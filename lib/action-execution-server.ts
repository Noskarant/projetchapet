import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ApiInputError } from "@/lib/api-guard";
import type { ActionIntent } from "@/lib/action-engine";
import type { AuthenticatedRequestContext } from "@/lib/server-auth";

export type ProposalRow = {
  id: string;
  organization_id: string;
  created_by: string;
  source_type: string;
  source_reference: string | null;
  raw_text: string;
  intent_type: ActionIntent;
  payload: Record<string, unknown>;
  risk_level: "low" | "review" | "explicit_confirmation";
  status: string;
  confidence: number;
  warnings: string[];
  missing_fields: string[];
};

export type ExecutionResult = {
  proposalId: string;
  intentType: ActionIntent;
  entityType: string;
  entityId: string | null;
  message: string;
  clientAction?: "agenda";
  clientPayload?: Record<string, unknown>;
};

function serviceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new ApiInputError("Moteur d’exécution MANUFEO non configuré.", 503);
  }
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function string(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizedItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).map((entry, index) => {
    const line = object(entry);
    const quantity = numberOrNull(line.quantity);
    const unitPrice = numberOrNull(line.unit_price);
    const tax = numberOrNull(line.tax_rate);
    return {
      position: index,
      label: string(line.label, 240) || "Prestation à compléter",
      description: string(line.description, 800) || null,
      quantity,
      unit: string(line.unit, 40) || null,
      unit_price: unitPrice,
      tax_rate: tax !== null && [0, 5.5, 10, 20].includes(tax) ? tax : null,
      total: quantity === null || unitPrice === null ? 0 : Math.round(quantity * unitPrice * 100) / 100,
    };
  });
}

async function resolveCustomerId({
  proposal,
  client,
  results,
}: {
  proposal: ProposalRow;
  client: SupabaseClient;
  results: Map<string, ExecutionResult>;
}) {
  const payload = proposal.payload;
  const direct = string(payload.customer_id, 80);
  if (direct) {
    const { data } = await client
      .from("customers")
      .select("id")
      .eq("organization_id", proposal.organization_id)
      .eq("id", direct)
      .maybeSingle();
    if (data?.id) return String(data.id);
    throw new ApiInputError("Le client sélectionné n’existe plus.", 409);
  }

  const dependencyId = string(payload.customer_from_proposal_id, 80);
  if (dependencyId) {
    const dependency = results.get(dependencyId);
    if (dependency?.entityType === "customer" && dependency.entityId) return dependency.entityId;
    throw new ApiInputError("Le client dépendant n’a pas pu être créé avant ce document.", 409);
  }

  const hint = string(payload.customer_hint, 180);
  if (!hint) throw new ApiInputError("Le client doit être précisé avant de créer le document.", 409);
  const { data, error } = await client
    .from("customers")
    .select("id, kind, company_name, civility, last_name, first_name")
    .eq("organization_id", proposal.organization_id)
    .limit(500);
  if (error) throw new Error("Recherche du client impossible.");
  const wanted = normalizeText(hint);
  const matches = (data ?? []).filter((customer) => {
    const name = customer.kind === "business"
      ? String(customer.company_name ?? "")
      : [customer.civility, customer.last_name, customer.first_name].filter(Boolean).join(" ");
    const normalized = normalizeText(name);
    return normalized === wanted || normalized.includes(wanted) || wanted.includes(normalized);
  });
  if (matches.length === 1) return String(matches[0].id);
  if (matches.length > 1) throw new ApiInputError(`Plusieurs clients correspondent à « ${hint} ». Précisez le nom.`, 409);
  throw new ApiInputError(`Le client « ${hint} » n’existe pas encore dans MANUFEO.`, 409);
}

async function resolveQuote(client: SupabaseClient, organizationId: string, payload: Record<string, unknown>) {
  const quoteId = string(payload.quote_id, 80);
  const quoteNumber = string(payload.quote_number, 100);
  if (!quoteId && !quoteNumber) return null;
  let query = client
    .from("quotes")
    .select("id, customer_id, title, notes, items:quote_items(*)")
    .eq("organization_id", organizationId);
  query = quoteId ? query.eq("id", quoteId) : query.eq("number", quoteNumber);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Recherche du devis impossible.");
  if (!data) throw new ApiInputError("Le devis source est introuvable.", 409);
  return data as unknown as {
    id: string;
    customer_id: string;
    title: string;
    notes: string | null;
    items: Record<string, unknown>[];
  };
}

async function claimProposal(service: SupabaseClient, proposal: ProposalRow, userId: string) {
  const { data, error } = await service
    .from("action_proposals")
    .update({
      status: "confirmed",
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposal.id)
    .eq("organization_id", proposal.organization_id)
    .eq("status", "ready")
    .select("id")
    .maybeSingle();
  if (error) throw new Error("Verrouillage de la proposition impossible.");
  if (!data) throw new ApiInputError("Cette action a déjà été traitée ou n’est plus exécutable.", 409);
}

async function finalizeProposal(
  service: SupabaseClient,
  proposal: ProposalRow,
  result: ExecutionResult,
  userId: string,
) {
  const now = new Date().toISOString();
  const { error } = await service
    .from("action_proposals")
    .update({
      status: "executed",
      executed_at: now,
      updated_at: now,
      execution_result: result,
    })
    .eq("id", proposal.id)
    .eq("organization_id", proposal.organization_id)
    .eq("status", "confirmed");
  if (error) throw new Error("Enregistrement du résultat impossible.");

  await service.from("audit_log").insert({
    organization_id: proposal.organization_id,
    user_id: userId,
    entity_type: result.entityType,
    entity_id: result.entityId && validUuid(result.entityId) ? result.entityId : null,
    action: `ai_${proposal.intent_type}_executed`,
    payload: {
      proposal_id: proposal.id,
      source_type: proposal.source_type,
      result,
    },
  });
}

async function failProposal(service: SupabaseClient, proposal: ProposalRow, error: unknown) {
  const message = error instanceof Error ? error.message : "Exécution impossible.";
  await service
    .from("action_proposals")
    .update({
      status: "failed",
      updated_at: new Date().toISOString(),
      execution_result: { error: message },
    })
    .eq("id", proposal.id)
    .eq("organization_id", proposal.organization_id)
    .eq("status", "confirmed");
}

async function executeProposal(
  context: AuthenticatedRequestContext,
  proposal: ProposalRow,
  results: Map<string, ExecutionResult>,
): Promise<ExecutionResult> {
  const payload = proposal.payload;

  if (proposal.intent_type === "create_customer") {
    const kind = payload.kind === "individual" ? "individual" : "business";
    const companyName = string(payload.company_name, 180) || null;
    const lastName = string(payload.last_name, 120) || null;
    if (kind === "business" && !companyName) throw new ApiInputError("La raison sociale du client est manquante.", 409);
    if (kind === "individual" && !lastName) throw new ApiInputError("Le nom du client est manquant.", 409);
    const addresses = Array.isArray(payload.addresses) ? payload.addresses.slice(0, 5) : [];
    const emails = Array.isArray(payload.emails) ? payload.emails.map((item) => string(item, 160)).filter(Boolean) : [];
    const phones = Array.isArray(payload.phones) ? payload.phones.map((item) => string(item, 40)).filter(Boolean) : [];
    const { data, error } = await context.client
      .from("customers")
      .insert({
        organization_id: proposal.organization_id,
        kind,
        company_name: companyName,
        civility: kind === "individual" ? string(payload.civility, 30) || null : null,
        last_name: kind === "individual" ? lastName : null,
        first_name: kind === "individual" ? string(payload.first_name, 120) || null : null,
        siret: kind === "business" ? string(payload.siret, 24) || null : null,
        vat_number: kind === "business" ? string(payload.vat_number, 30) || null : null,
        emails,
        phones,
        addresses,
        notes: string(payload.notes, 2000) || null,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Création du client impossible.");
    return {
      proposalId: proposal.id,
      intentType: proposal.intent_type,
      entityType: "customer",
      entityId: String(data.id),
      message: "Client créé.",
    };
  }

  if (proposal.intent_type === "prepare_quote") {
    const customerId = await resolveCustomerId({ proposal, client: context.client, results });
    const items = normalizedItems(payload.items);
    if (!items.length) throw new ApiInputError("Aucune prestation exploitable pour le devis.", 409);
    const issueDate = string(payload.issue_date, 20) || todayIso();
    const { data, error } = await context.client.rpc("save_quote_document", {
      p_quote_id: null,
      p_customer_id: customerId,
      p_title: string(payload.title, 260) || "Travaux",
      p_status: "draft",
      p_issue_date: issueDate,
      p_expiry_date: string(payload.expiry_date, 20) || addDaysIso(issueDate, 30),
      p_notes: string(payload.notes, 2400) || null,
      p_items: items,
    });
    if (error || !data) throw new Error(error?.message || "Création du brouillon de devis impossible.");
    return {
      proposalId: proposal.id,
      intentType: proposal.intent_type,
      entityType: "quote",
      entityId: String(data),
      message: "Brouillon de devis créé.",
    };
  }

  if (proposal.intent_type === "prepare_invoice") {
    const sourceQuote = await resolveQuote(context.client, proposal.organization_id, payload);
    const customerId = sourceQuote?.customer_id || await resolveCustomerId({ proposal, client: context.client, results });
    const sourceItems = sourceQuote?.items ?? [];
    const items = normalizedItems(Array.isArray(payload.items) && payload.items.length ? payload.items : sourceItems);
    if (!items.length) throw new ApiInputError("Aucune prestation exploitable pour la facture.", 409);
    const issueDate = string(payload.issue_date, 20) || todayIso();
    const { data, error } = await context.client.rpc("save_invoice_document", {
      p_invoice_id: null,
      p_customer_id: customerId,
      p_quote_id: sourceQuote?.id ?? null,
      p_status: "draft",
      p_issue_date: issueDate,
      p_due_date: string(payload.due_date, 20) || addDaysIso(issueDate, 30),
      p_notes: string(payload.notes, 2400) || sourceQuote?.notes || null,
      p_items: items,
    });
    if (error || !data) throw new Error(error?.message || "Création du brouillon de facture impossible.");
    return {
      proposalId: proposal.id,
      intentType: proposal.intent_type,
      entityType: "invoice",
      entityId: String(data),
      message: "Brouillon de facture créé.",
    };
  }

  if (proposal.intent_type === "update_project_note") {
    const projectId = string(payload.project_id, 180);
    const body = string(payload.body, 5000);
    if (!projectId || !body) throw new ApiInputError("Le chantier et la note doivent être précisés.", 409);
    const { data, error } = await context.client
      .from("project_notes")
      .insert({
        organization_id: proposal.organization_id,
        project_id: projectId,
        body,
        created_by: context.user.id,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Ajout de la note impossible.");
    return {
      proposalId: proposal.id,
      intentType: proposal.intent_type,
      entityType: "project_note",
      entityId: String(data.id),
      message: "Note chantier ajoutée.",
    };
  }

  if (proposal.intent_type === "prepare_supplier_order") {
    const supplierName = string(payload.supplier_name, 200);
    const supplierEmail = string(payload.supplier_email, 254);
    const label = string(payload.label, 500);
    if (!supplierName || !supplierEmail || !label) {
      throw new ApiInputError("Fournisseur, e-mail et article sont requis pour préparer la commande.", 409);
    }
    const { data, error } = await context.client
      .from("supplier_orders")
      .insert({
        organization_id: proposal.organization_id,
        project_id: string(payload.project_id, 180) || null,
        supplier_name: supplierName,
        supplier_email: supplierEmail,
        label,
        quantity: numberOrNull(payload.quantity) ?? 1,
        unit_price: numberOrNull(payload.unit_price) ?? 0,
        notes: string(payload.notes, 3000),
        status: "draft",
        created_by: context.user.id,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "Préparation de la commande impossible.");
    return {
      proposalId: proposal.id,
      intentType: proposal.intent_type,
      entityType: "supplier_order",
      entityId: String(data.id),
      message: "Brouillon de commande fournisseur créé. Aucun e-mail n’a été envoyé.",
    };
  }

  if (proposal.intent_type === "mark_payment") {
    let invoiceId = string(payload.invoice_id, 80);
    if (!invoiceId) {
      const invoiceNumber = string(payload.invoice_number, 100);
      const { data, error } = await context.client
        .from("invoices")
        .select("id")
        .eq("organization_id", proposal.organization_id)
        .eq("number", invoiceNumber)
        .maybeSingle();
      if (error) throw new Error("Recherche de la facture impossible.");
      invoiceId = data?.id ? String(data.id) : "";
    }
    const amount = numberOrNull(payload.amount);
    if (!invoiceId || !amount || amount <= 0) throw new ApiInputError("Facture ou montant du paiement manquant.", 409);
    const { error } = await context.client.rpc("record_invoice_payment", {
      p_invoice_id: invoiceId,
      p_amount: amount,
      p_paid_at: new Date().toISOString(),
      p_method: string(payload.method, 80) || "virement",
      p_reference: string(payload.reference, 500) || "Paiement confirmé via MANUFEO",
    });
    if (error) throw new Error(error.message || "Enregistrement du paiement impossible.");
    return {
      proposalId: proposal.id,
      intentType: proposal.intent_type,
      entityType: "payment",
      entityId: null,
      message: "Paiement enregistré.",
    };
  }

  if (proposal.intent_type === "schedule_task") {
    return {
      proposalId: proposal.id,
      intentType: proposal.intent_type,
      entityType: "agenda_event",
      entityId: null,
      message: "Événement d’agenda confirmé.",
      clientAction: "agenda",
      clientPayload: payload,
    };
  }

  if (proposal.intent_type === "prepare_email") {
    return {
      proposalId: proposal.id,
      intentType: proposal.intent_type,
      entityType: "email_draft",
      entityId: null,
      message: "Brouillon d’e-mail préparé. Aucun e-mail n’a été envoyé.",
    };
  }

  throw new ApiInputError("Cette action n’est pas encore exécutable automatiquement.", 409);
}

export async function executeProposalBatch({
  context,
  organizationId,
  proposalIds,
  explicitConfirmation,
}: {
  context: AuthenticatedRequestContext;
  organizationId: string;
  proposalIds: string[];
  explicitConfirmation: boolean;
}) {
  const membership = context.memberships.find((item) => item.organizationId === organizationId);
  if (!membership) throw new ApiInputError("Entreprise non autorisée.", 403);

  const { data, error } = await context.client
    .from("action_proposals")
    .select("id, organization_id, created_by, source_type, source_reference, raw_text, intent_type, payload, risk_level, status, confidence, warnings, missing_fields")
    .eq("organization_id", organizationId)
    .in("id", proposalIds);
  if (error) throw new Error("Chargement des propositions impossible.");
  const byId = new Map((data ?? []).map((row) => [String(row.id), row as unknown as ProposalRow]));
  const proposals = proposalIds.map((id) => byId.get(id)).filter((value): value is ProposalRow => Boolean(value));
  if (proposals.length !== proposalIds.length) throw new ApiInputError("Une proposition est introuvable.", 404);

  const canExecuteOthers = ["owner", "admin"].includes(membership.role);
  for (const proposal of proposals) {
    if (proposal.created_by !== context.user.id && !canExecuteOthers) {
      throw new ApiInputError("Vous ne pouvez pas exécuter une proposition préparée par un autre membre.", 403);
    }
    if (proposal.status !== "ready") {
      throw new ApiInputError("Toutes les actions doivent être prêtes avant validation.", 409);
    }
    if ((proposal.missing_fields ?? []).length) {
      throw new ApiInputError("Une action contient encore des informations à préciser.", 409);
    }
  }

  const requiresExplicit = proposals.some((proposal) => proposal.risk_level === "explicit_confirmation");
  if (requiresExplicit && !explicitConfirmation) {
    throw new ApiInputError("Une confirmation explicite est requise pour les actions sensibles.", 409);
  }

  const service = serviceSupabase();
  const results = new Map<string, ExecutionResult>();
  for (const proposal of proposals) {
    await claimProposal(service, proposal, context.user.id);
    try {
      const result = await executeProposal(context, proposal, results);
      await finalizeProposal(service, proposal, result, context.user.id);
      results.set(proposal.id, result);
    } catch (executionError) {
      await failProposal(service, proposal, executionError);
      throw executionError;
    }
  }

  return {
    requiresExplicit,
    results: proposalIds.map((id) => results.get(id)).filter(Boolean),
  };
}
