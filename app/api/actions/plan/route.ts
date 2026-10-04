import { restrictSourcePlan } from "@/lib/source-plan";
import { resolveVoicePlanCustomers } from "@/lib/voice-plan-customers";
import { orderVoicePlan } from "@/lib/voice-plan-order";
import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit, readJsonBody } from "@/lib/api-guard";
import { hardenPlannedActions } from "@/lib/action-plan-safety";
import {
  fallbackCommandPlan,
  normalizeModelPlan,
  plannedActionFromParsed,
  type PlannedAction,
  type VoiceActionTarget,
} from "@/lib/action-planner";
import { authenticateRequest, requireOrganization } from "@/lib/server-auth";
import { normalizeVoiceTranscript } from "@/lib/voice-facts";
import { matchProjectCollaborator } from "@/lib/voice-project-matching";
import { proposeLearnedSellingPrices } from "@/lib/learned-selling-prices-server";

function cleanTarget(value: unknown): VoiceActionTarget {
  return ["command", "quote", "invoice", "customer", "supplier", "agenda"].includes(String(value))
    ? (String(value) as VoiceActionTarget)
    : "command";
}

function planningPrompt() {
  return `Tu es le planificateur d'actions de MANUFEO, logiciel de gestion pour artisans français.
Les références *_from_position sont des indices à partir de zéro. Le client et les collaborateurs précèdent le devis, le devis précède le chantier auquel il est lié.
Transforme UNE demande orale en une liste ordonnée d'actions structurées. Comprends les formulations naturelles, les hésitations et les erreurs probables de transcription à partir du contexte, sans modifier les chiffres ni inventer de données. Si une information nécessaire manque, laisse-la vide/null et ajoute-la à missing_fields.

Intentions autorisées exactement :
- create_customer : créer un client ;
- create_supplier : créer une fiche fournisseur, nom obligatoire, contact, e-mail, téléphone, adresse et notes facultatifs ; ne jamais envoyer de message pour cette création ;
- create_collaborator : créer une fiche collaborateur avec son nom, prénom éventuel, rôle et téléphone éventuels ;
- create_project : créer une fiche chantier, éventuellement liée à un client, un devis et des collaborateurs ;
- prepare_quote : créer uniquement un BROUILLON de devis ;
- prepare_invoice : créer uniquement un BROUILLON de facture ;
- schedule_task : préparer un événement d'agenda ;
- update_project_note : ajouter une note à un chantier existant ;
- prepare_supplier_order : préparer une commande fournisseur en brouillon ; pour une demande de prix/devis fournisseur, renseigne le fournisseur, label, quantity, unit, unit_price (prix souhaité facultatif). Si l’utilisateur demande explicitement son envoi, la demande de prix sera envoyée après validation des actions ; une commande ferme reste en brouillon ;
- mark_payment : enregistrer un paiement uniquement si facture et montant sont explicitement donnés ;
- prepare_email : préparer un brouillon de message, jamais l'envoyer.

Ne crée create_project que si l'utilisateur demande d'ouvrir/créer un chantier, et pas pour une simple mention d'un chantier existant. Une seule phrase peut combiner plusieurs intentions, sans que l'utilisateur choisisse une catégorie. Si un devis doit être lié au nouveau chantier, place prepare_quote avant create_project et renseigne quote_from_position (index base 0). Si un client vient d'être créé, utilise customer_from_position aussi dans create_project. Ne crée create_collaborator que si l'utilisateur demande explicitement de créer/ajouter une personne à l'équipe ; « affecte Lucas » seul signifie chercher Lucas existant et ne suffit jamais à le créer. Le nom seul est suffisant pour une nouvelle fiche, prénom, rôle et téléphone sont facultatifs. Place create_collaborator avant create_project et renseigne collaborator_from_positions (indices base 0) pour les nouveaux membres ; mets les collaborateurs existants dans collaborator_names. N'invente pas de collaborateur, de client ni de devis. Un chantier seul n'implique pas la création d'un devis ; un chiffrage n'implique pas la création d'un chantier.

Si la demande crée un client puis un devis/facture pour ce même nouveau client, place create_customer avant le document et mets customer_from_position à l'index (base 0) de l'action client dans le payload du document.
Pour un client existant, utilise customer_hint avec son nom prononcé. Les noms, prénoms, sociétés et e-mails épelés lettre par lettre prévalent sur une transcription phonétique ; respecte le nombre de lettres répétées (deux E, trois R). Ne devine pas une lettre que l'audio ou le texte ne contient pas. N'invente jamais un UUID.
Dans une adresse e-mail, « arobase » ou « @ » désigne @ et « point » désigne un point. Si la transcription ne permet pas de placer @ sans ambiguïté, conserve l'adresse telle quelle et signale qu'elle doit être corrigée.
Une majoration RSE ou un autre poste demandé en pourcentage est calculé automatiquement par MANUFEO : ne crée pas de ligne supplémentaire à prix forfaitaire pour ce pourcentage. Une remise dictée est une réduction globale, pas une prestation. Une franchise dictée est calculée par MANUFEO comme un poste négatif séparé : ne crée pas sa ligne toi-même. Recopie fidèlement son montant, sa mention HT/TTC et sa TVA éventuelle dans notes. Le serveur convertit une franchise TTC en HT avec une TVA connue, puis réduit HT, TVA et TTC. Ne laisse pas sa mention TTC rendre les prix des travaux ambigus.
Chaque prestation distincte explicitement demandée d'un devis/facture doit devenir une ligne. Une pièce citée, une répétition ou un fragment incompris ne suffit pas à créer une autre prestation. Reformule clairement les libellés malgré les erreurs évidentes de transcription, sans exiger une formule précise ni transformer une précision en nouvelle ligne.
Recopie exactement les libellés dictés, y compris virgules et ponctuation utiles (ex. « Chambre 2, plafond »). Une virgule entre chiffres fait partie d'un nombre : 18,50 m² = 18.5, jamais 18 ni 50 ; « 18 mètres 50 » signifie 18,50 mètres, sans inventer « carrés » si ce n'est pas dit. N'attribue jamais à une autre pièce un métrage ou un prix dicté pour celle-ci.
Pour chaque ligne recopie la courte expression exacte de la dictée dans quantity_evidence, price_evidence et tax_evidence si présente. « Un forfait à 180 euros » signifie une quantité de 1 et une unité forfait. Conserve la somme prononcée dans unit_price et indique price_type « ht », « ttc » ou « unknown » ; ne convertis PAS le TTC, le serveur le convertira seulement avec une TVA explicite. « Hors taxes » = HT, « toutes taxes comprises » = TTC. Si le type n'est pas précisé, laisse unknown ; si la TVA n'est pas donnée, laisse tax_rate à null. Une TVA annoncée au début du devis s'applique aux prestations suivantes jusqu'à l'annonce explicite d'un autre taux. Une TVA ponctuelle annoncée seulement pour une ligne ne modifie pas les autres lignes.
Un devis ou une facture est seulement un brouillon : conserve les prestations explicitement demandées même si leur libellé, quantité ou prix manque ; laisse la valeur absente vide/null et ajoute un warning clair. Ne bloque le brouillon que si le client ou toute prestation exploitable manque. Ne mets pas de chemins techniques comme items[3].quantity dans missing_fields.
Un montant comme « 1 700 euros » vaut 1700, jamais 700. Les étapes préparation, peinture et finition d'une même intervention avec une seule unité et un seul prix constituent UN poste contenant toutes ces étapes ; ne répète pas ce prix sur plusieurs lignes.
Conserve dans create_customer l'adresse et le code postal dictés. Rattache le document à cette fiche avec customer_from_position ; le prénom suivi du nom et le nom suivi du prénom désignent la même personne.
Pour un document d’assurance, recopie dans insurance uniquement les références explicitement présentes : assureur, numéro de dossier, référence de mission et adresse du sinistre. L’assuré est le client, l’assureur n’est pas sa société. Recopie les coordonnées complètes et le libellé exact de franchise. MANUFEO ajoutera le poste négatif de franchise avec les montants HT/TTC et la TVA explicitement connus ; une mention HT/TTC absente doit rester à préciser.
Pour l'agenda, convertis les dates relatives uniquement si elles sont déterminables sans ambiguïté ; sinon laisse date vide et demande une précision. Quand la date est donnée sans heure, crée schedule_task avec time vide : c'est un événement à la journée, sans horaire inventé et sans missing_fields pour l'heure.

Réponds uniquement par ce JSON :
{
  "actions":[
    {
      "intent_type":"create_customer|create_supplier|create_collaborator|create_project|prepare_quote|prepare_invoice|schedule_task|update_project_note|prepare_supplier_order|mark_payment|prepare_email",
      "confidence":0.0,
      "warnings":[],
      "missing_fields":[],
      "payload":{}
    }
  ]
}

Schémas de payload utiles :
create_customer: {"kind":"business|individual","company_name":"","civility":"M.|Mme|M. et Mme","last_name":"","first_name":"","siret":"","vat_number":"","emails":[],"phones":[],"addresses":[{"line1":"","postal_code":"","city":"","country":"France"}],"notes":""}
create_supplier: {"name":"","contact":"","email":"","phone":"","address":"","notes":""}
create_collaborator: {"name":"prénom et nom ou seulement un nom","role":"","phone":""}
create_project: {"name":"","subtitle":"","customer_hint":"","customer_from_position":null,"quote_from_position":null,"address":"","start_date":"YYYY-MM-DD ou vide","next_visit":"YYYY-MM-DD ou vide","collaborator_names":[],"collaborator_from_positions":[]}
prepare_quote/prepare_invoice: {"customer_hint":"","customer_from_position":null,"title":"","notes":"","insurance":{"insurer":"","mission_reference":"","case_reference":"","claim_address":""},"items":[{"label":"","description":"","quantity":null,"quantity_evidence":"","unit":null,"unit_price":null,"price_evidence":"","price_type":"ht|ttc|unknown","tax_rate":null,"tax_evidence":""}]}
schedule_task: {"customer_hint":"","title":"","date":"YYYY-MM-DD","time":"HH:MM","location":"","type":"Chantier|Commande|Facturation|Relance","notes":""}
update_project_note: {"project_id":"","body":""}
prepare_supplier_order: {"project_id":"","supplier_name":"","supplier_email":"","label":"","unit":"","quantity":1,"unit_price":0,"notes":""}
mark_payment: {"invoice_number":"","amount":null,"method":"virement","reference":""}
prepare_email: {"to":"","subject":"","body":"","related_entity":""}`;
}

async function planWithDeepSeek(transcript: string, supplierOnly = false) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return supplierOnly ? [plannedActionFromParsed("supplier", {}, transcript)] : fallbackCommandPlan(transcript);

  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const getPart = (type: string) => dateParts.find((part) => part.type === type)?.value ?? "";
  const parisDate = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;

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
        { role: "system", content: planningPrompt() + (supplierOnly ? "\nL’utilisateur a choisi la création d’un fournisseur. Retourne uniquement une action create_supplier avec les coordonnées dictées. N’invente pas les coordonnées manquantes." : "") },
        { role: "user", content: `Date du jour en France : ${parisDate}. Demande : ${transcript}` },
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
  const actions = normalizeModelPlan(raw, transcript).filter(action => !supplierOnly || action.intentType === "create_supplier");
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
  if (action.intentType !== "create_customer" || action.payload.existing_customer_id) return;
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
    if (typeof dependencyIndex === "number" && (dependencyIndex < 0 || dependencyIndex >= index || actions[dependencyIndex]?.intentType !== "create_customer")) {
      throw new ApiInputError("Le plan IA contient une dépendance client invalide.", 422);
    }
    const quoteIndex = actions[index].quoteFromPosition;
    if (typeof quoteIndex === "number" && (quoteIndex < 0 || quoteIndex >= index || actions[index].intentType !== "create_project" || actions[quoteIndex]?.intentType !== "prepare_quote")) {
      throw new ApiInputError("Le plan IA contient une dépendance devis invalide.", 422);
    }
    if ((actions[index].collaboratorFromPositions ?? []).some((position) => !Number.isInteger(position)
      || position < 0 || position >= index || actions[index].intentType !== "create_project"
      || actions[position]?.intentType !== "create_collaborator")) {
      throw new ApiInputError("Le plan IA contient une dépendance collaborateur invalide.", 422);
    }
  }
}

async function resolveProjectCollaborators(actions: PlannedAction[], organizationId: string, client: Awaited<ReturnType<typeof authenticateRequest>>["client"]) {
  const projects = actions.filter((action) => action.intentType === "create_project");
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").trim();
  const creates = actions.map((action, index) => ({ action, index })).filter(({ action }) => action.intentType === "create_collaborator");
  if (!projects.length && !creates.length) return;
  const needsTeam = creates.length > 0 || projects.some((action) => Array.isArray(action.payload.collaborator_names) && action.payload.collaborator_names.length);
  const needsCustomer = projects.some((action) => action.payload.customer_hint && action.customerFromPosition === undefined);
  const [teamResult, customerResult] = await Promise.all([
    needsTeam ? client.from("commercial_collaborators").select("id, name, active").eq("organization_id", organizationId).limit(200) : Promise.resolve({ data: [], error: null }),
    needsCustomer ? client.from("customers").select("id, kind, company_name, civility, last_name, first_name").eq("organization_id", organizationId).limit(500) : Promise.resolve({ data: [], error: null }),
  ]);
  if (teamResult.error || customerResult.error) throw new Error("Vérification du chantier impossible.");
  for (const { action, index } of creates) {
    const name = String(action.payload.name || "").trim();
    if (!name) continue;
    const existing = matchProjectCollaborator(teamResult.data ?? [], name);
    const duplicateInRequest = creates.some((other) => other.index < index && normalize(String(other.action.payload.name || "")) === normalize(name));
    if (existing.status !== "missing" || duplicateInRequest) {
      action.missingFields.push(`collaborateur_deja_existant: ${name}`);
      action.status = "needs_input";
    }
  }
  for (const action of projects) {
    const customerHint = String(action.payload.customer_hint || "").trim();
    if (customerHint && action.customerFromPosition === undefined) {
      const wanted = normalize(customerHint);
      const matches = (customerResult.data ?? []).filter((customer) => {
        const name = customer.kind === "business" ? customer.company_name : [customer.civility, customer.last_name, customer.first_name].filter(Boolean).join(" ");
        const normalized = normalize(String(name || ""));
        return normalized === wanted || (wanted.length >= 3 && normalized.includes(wanted));
      });
      if (matches.length !== 1) action.missingFields.push(matches.length ? "client_ambigu" : "client_introuvable");
      else action.payload.customer_id = String(matches[0].id);
    }
    const names = Array.isArray(action.payload.collaborator_names) ? action.payload.collaborator_names as string[] : [];
    const newPositions = new Set(action.collaboratorFromPositions ?? []);
    const ids: string[] = [];
    const existingNames: string[] = [];
    for (const name of names) {
      const newMatch = matchProjectCollaborator(
        creates.filter(({ index }) => index < actions.indexOf(action)).map(({ action: created, index }) => ({ id: String(index), name: String(created.payload.name || ""), active: true })),
        name,
      );
      if (newMatch.status === "found") {
        newPositions.add(Number(newMatch.id));
        continue;
      }
      if (newMatch.status === "ambiguous") {
        action.missingFields.push(`collaborateur_ambigu: ${name}`);
        continue;
      }
      const match = matchProjectCollaborator(teamResult.data ?? [], name);
      if (match.status !== "found") {
        action.missingFields.push(`${match.status === "ambiguous" ? "collaborateur_ambigu" : "collaborateur_introuvable"}: ${name}`);
      } else {
        ids.push(match.id);
        existingNames.push(name);
      }
    }
    action.collaboratorFromPositions = [...newPositions].sort((a, b) => a - b);
    action.payload.collaborator_from_positions = action.collaboratorFromPositions;
    action.payload.collaborator_names = existingNames;
    action.payload.collaborator_new_names = action.collaboratorFromPositions.map((position) => String(actions[position]?.payload.name || "")).filter(Boolean);
    action.payload.collaborator_ids = [...new Set(ids)];
    action.missingFields = [...new Set(action.missingFields)];
    if (action.missingFields.length) action.status = "needs_input";
  }
}

async function resolveSupplierRequests(actions: PlannedAction[], organizationId: string, client: Awaited<ReturnType<typeof authenticateRequest>>["client"]) {
  const requests = actions.filter(action => action.intentType === "prepare_supplier_order");
  if (!requests.length) return;
  const rows = await client.from("artisan_workflow_records").select("id,payload").eq("organization_id", organizationId).eq("kind", "supplier");
  if (rows.error) throw new Error("Lecture des fournisseurs impossible.");
  const normalize = (value: unknown) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  for (const action of requests) {
    const matches = (rows.data || []).filter(row => normalize(row.payload.name) === normalize(action.payload.supplier_name) || normalize(row.payload.email) === normalize(action.payload.supplier_email) && Boolean(action.payload.supplier_email));
    if (matches.length === 1) {
      action.payload.supplier_id = matches[0].id;
      action.payload.supplier_name = matches[0].payload.name;
      action.payload.supplier_email = matches[0].payload.email;
      action.missingFields = action.missingFields.filter(field => !["fournisseur", "email_fournisseur"].includes(field));
    } else if (action.payload.request_type === "price_request") {
      action.missingFields.push(matches.length ? "fournisseur_ambigu" : "fournisseur_à_créer");
    }
    if (action.payload.request_type === "price_request" && action.payload.send_requested) action.warnings.push("La demande de prix sera envoyée au fournisseur lorsque vous validerez les actions.");
    action.status = action.missingFields.length ? "needs_input" : "ready";
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
    if (typeof action.quoteFromPosition === "number") {
      const dependency = inserted[action.quoteFromPosition];
      if (!dependency?.id || dependency.intent_type !== "prepare_quote") {
        throw new ApiInputError("Le devis lié au chantier n'a pas pu être préparé.", 422);
      }
      payload.quote_from_proposal_id = String(dependency.id);
      delete payload.quote_from_position;
    }
    if (action.collaboratorFromPositions?.length) {
      payload.collaborator_from_proposal_ids = action.collaboratorFromPositions.map((position) => {
        const dependency = inserted[position];
        if (!dependency?.id || dependency.intent_type !== "create_collaborator") {
          throw new ApiInputError("Le collaborateur lié au chantier n'a pas pu être préparé.", 422);
        }
        return String(dependency.id);
      });
      delete payload.collaborator_from_positions;
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
      quoteSources?: unknown;
      sourceTarget?: unknown;
    }>(request, 40_000);
    const organizationId = typeof body.organizationId === "string" ? body.organizationId.trim() : "";
    const transcript = typeof body.transcript === "string" ? normalizeVoiceTranscript(body.transcript) : "";
    if (!organizationId) throw new ApiInputError("Entreprise manquante.");
    if (!transcript) throw new ApiInputError("La demande est vide.");
    if (transcript.length > 14_000) throw new ApiInputError("La demande est trop longue.", 413);

    const context = await authenticateRequest(request);
    requireOrganization(context, organizationId, ["owner", "admin", "office", "manager"]);
    const target = cleanTarget(body.target);

    let planned = target === "command" || target === "supplier"
      ? await planWithDeepSeek(transcript, target === "supplier")
      : [plannedActionFromParsed(target, body.parsed, transcript)];
    if (body.sourceTarget === "customer") {
      planned = restrictSourcePlan(planned, "customer");
      if (!planned.length) throw new ApiInputError("Aucune identité client lisible. Complétez le nom dans la note.", 422);
    } else if (body.quoteSources === true || body.sourceTarget === "quote") {
      planned = restrictSourcePlan(planned, "quote");
      if (!planned.some(action => action.intentType === 'prepare_quote')) throw new ApiInputError('Décrivez les travaux à chiffrer pour préparer un devis.', 422);
    }
    await resolveVoicePlanCustomers(planned, organizationId, context.client);
    await proposeLearnedSellingPrices(planned, organizationId, context.client);
    const actions = hardenPlannedActions(orderVoicePlan(planned));
    await resolveProjectCollaborators(actions, organizationId, context.client);
    await resolveSupplierRequests(actions, organizationId, context.client);

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
