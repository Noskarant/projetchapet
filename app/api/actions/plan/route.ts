import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from "@/lib/api-guard";
import {
  fallbackCommandPlan,
  normalizeModelPlan,
  plannedActionFromParsed,
  type PlannedAction,
  type VoiceActionTarget,
} from "@/lib/action-planner";
import { authenticateRequest, requireOrganization } from "@/lib/server-auth";

function cleanTarget(value: unknown): VoiceActionTarget {
  return ["command", "quote", "invoice", "customer", "agenda"].includes(String(value))
    ? (String(value) as VoiceActionTarget)
    : "command";
}

function planningPrompt() {
  return `Tu es le planificateur d'actions de MANUFEO, logiciel de gestion pour artisans français.
Transforme UNE demande orale en une liste ordonnée d'actions structurées. N'invente jamais une donnée non prononcée. Si une information nécessaire manque, laisse-la vide/null et ajoute-la à missing_fields.

Intentions autorisées exactement :
- create_customer : créer un client ;
- prepare_quote : créer uniquement un BROUILLON de devis ;
- prepare_invoice : créer uniquement un BROUILLON de facture ;
- schedule_task : préparer un événement d'agenda ;
- update_project_note : ajouter une note à un chantier existant ;
- prepare_supplier_order : préparer uniquement un BROUILLON de commande fournisseur, jamais l'envoyer ;
- mark_payment : enregistrer un paiement uniquement si facture et montant sont explicitement donnés ;
- prepare_email : préparer un brouillon de message, jamais l'envoyer.

Si la demande crée un client puis un devis/facture pour ce même nouveau client, place create_customer avant le document et mets customer_from_position à l'index (base 0) de l'action client dans le payload du document.
Pour un client existant, utilise customer_hint avec son nom prononcé. N'invente jamais un UUID.
Chaque prestation distincte d'un devis/facture doit devenir une ligne.
Les prix sont HT sauf si l'utilisateur dit explicitement TTC. Si TTC est explicitement dit et que la TVA est connue, convertis le prix unitaire en HT. Sinon laisse la valeur telle quelle et ajoute un warning.

Réponds uniquement par ce JSON :
{
  "actions":[
    {
      "intent_type":"create_customer|prepare_quote|prepare_invoice|schedule_task|update_project_note|prepare_supplier_order|mark_payment|prepare_email",
      "confidence":0.0,
      "warnings":[],
      "missing_fields":[],
      "payload":{}
    }
  ]
}

Schémas de payload utiles :
create_customer: {"kind":"business|individual","company_name":"","civility":"M.|Mme|M. et Mme","last_name":"","first_name":"","siret":"","vat_number":"","emails":[],"phones":[],"addresses":[{"line1":"","postal_code":"","city":"","country":"France"}],"notes":""}
prepare_quote/prepare_invoice: {"customer_hint":"","customer_from_position":null,"title":"","notes":"","items":[{"label":"","description":"","quantity":null,"unit":null,"unit_price":null,"tax_rate":null}]}
schedule_task: {"customer_hint":"","title":"","date":"YYYY-MM-DD","time":"HH:MM","location":"","type":"Chantier|Commande|Facturation|Relance","notes":""}
update_project_note: {"project_id":"","body":""}
prepare_supplier_order: {"project_id":"","supplier_name":"","supplier_email":"","label":"","quantity":1,"unit_price":0,"notes":""}
mark_payment: {"invoice_number":"","amount":null,"method":"virement","reference":""}
prepare_email: {"to":"","subject":"","body":"","related_entity":""}`;
}

async function planWithDeepSeek(transcript: string) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return fallbackCommandPlan(transcript);

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL ?? "deepseek-v4-flash",
      thinking: { type: "disabled" },
      max_tokens: 3200,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: planningPrompt() },
        { role: "user", content: transcript },
      ],
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.error?.message ?? `DeepSeek API : ${response.status}`);
  const content = result?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Le planificateur IA n’a retourné aucune donnée.");
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new Error("Le planificateur IA a retourné un JSON invalide.");
  }
  const actions = normalizeModelPlan(raw, transcript);
  if (!actions.length) throw new ApiInputError("Aucune action exploitable n’a été reconnue.", 422);
  return actions;
}

async function assertCustomerNotDuplicate({
  action,
  organizationId,
  client,
}: {
  action: PlannedAction;
  organizationId: string;
  client: Awaited<ReturnType<typeof authenticateRequest>>["client"];
}) {
  if (action.intentType !== "create_customer") return;
  const siret = typeof action.payload.siret === "string" ? action.payload.siret.trim() : "";
  if (siret) {
    const { data, error } = await client
      .from("customers")
      .select("id, company_name")
      .eq("organization_id", organizationId)
      .eq("siret", siret)
      .limit(1);
    if (error) throw new Error("Vérification du SIRET impossible.");
    if (data?.length) {
      throw new ApiInputError(`Un client avec le SIRET ${siret} existe déjà dans MANUFEO.`, 409);
    }
  }

  const firstEmail = Array.isArray(action.payload.emails)
    ? action.payload.emails.find((value) => typeof value === "string" && value.trim())
    : null;
  if (typeof firstEmail === "string" && firstEmail.trim()) {
    const email = firstEmail.trim().toLowerCase();
    const { data, error } = await client
      .from("customers")
      .select("id, company_name, emails")
      .eq("organization_id", organizationId)
      .contains("emails", [email])
      .limit(1);
    if (error) throw new Error("Vérification de l’e-mail client impossible.");
    if (data?.length) {
      throw new ApiInputError(`Un client utilisant ${email} existe déjà dans MANUFEO.`, 409);
    }
  }
}

function validateDependencies(actions: PlannedAction[]) {
  for (let index = 0; index < actions.length; index += 1) {
    const dependencyIndex = actions[index].customerFromPosition;
    if (typeof dependencyIndex !== "number") continue;
    if (dependencyIndex < 0 || dependencyIndex >= index || actions[dependencyIndex]?.intentType !== "create_customer") {
      throw new ApiInputError("Le plan IA contient une dépendance client invalide.", 422);
    }
  }
}

async function persistPlan({
  actions,
  organizationId,
  userId,
  client,
}: {
  actions: PlannedAction[];
  organizationId: string;
  userId: string;
  client: Awaited<ReturnType<typeof authenticateRequest>>["client"];
}) {
  validateDependencies(actions);
  for (const action of actions) {
    await assertCustomerNotDuplicate({ action, organizationId, client });
  }

  const batchReference = `voice-batch:${crypto.randomUUID()}`;
  const inserted: Record<string, unknown>[] = [];

  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const payload = { ...action.payload } as Record<string, unknown>;
    if (typeof action.customerFromPosition === "number") {
      const dependency = inserted[action.customerFromPosition];
      if (!dependency?.id || dependency.intent_type !== "create_customer") {
        throw new ApiInputError("Le client lié au document n’a pas pu être préparé correctement.", 422);
      }
      payload.customer_from_proposal_id = String(dependency.id);
      delete payload.customer_from_position;
    }
    const { data, error } = await client
      .from("action_proposals")
      .insert({
        organization_id: organizationId,
        created_by: userId,
        source_type: action.sourceType,
        source_reference: batchReference,
        raw_text: action.rawText,
        intent_type: action.intentType,
        payload,
        risk_level: action.riskLevel,
        status: action.status,
        confidence: action.confidence,
        warnings: action.warnings,
        missing_fields: action.missingFields,
      })
      .select("id, organization_id, source_type, source_reference, raw_text, intent_type, payload, risk_level, status, confidence, warnings, missing_fields, created_at")
      .single();
    if (error || !data) {
      throw new Error(error?.message || "La proposition n’a pas pu être enregistrée.");
    }
    inserted.push(data as Record<string, unknown>);
  }
  return inserted;
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "action-plan", 30);
  if (limited) return limited;

  try {
    const body = await readJsonBody<{
      organizationId?: unknown;
      transcript?: unknown;
      target?: unknown;
      parsed?: unknown;
    }>(request, 40_000);
    const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
    const transcript = typeof body.transcript === "string" ? body.transcript.trim() : "";
    if (!organizationId) throw new ApiInputError("Entreprise manquante.");
    if (!transcript) throw new ApiInputError("La demande est vide.");
    if (transcript.length > 14_000) throw new ApiInputError("La demande est trop longue.", 413);

    const context = await authenticateRequest(request);
    requireOrganization(context, organizationId);
    const target = cleanTarget(body.target);

    const actions = target === "command"
      ? await planWithDeepSeek(transcript)
      : [plannedActionFromParsed(target, body.parsed, transcript)];

    if (actions.length > 12) throw new ApiInputError("La demande contient trop d’actions.", 413);
    const proposals = await persistPlan({
      actions,
      organizationId,
      userId: context.user.id,
      client: context.client,
    });

    return NextResponse.json({
      batchReference: proposals[0]?.source_reference ?? null,
      proposals,
    });
  } catch (error) {
    return errorResponse(error, "Préparation des actions impossible.");
  }
}
