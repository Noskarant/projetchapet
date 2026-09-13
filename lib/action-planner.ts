import {
  ACTION_INTENTS,
  normalizeActionProposal,
  type ActionIntent,
  type ActionProposalInput,
} from "@/lib/action-engine";

export type VoiceActionTarget = "command" | "quote" | "invoice" | "customer" | "agenda";

export type PlannedAction = ActionProposalInput & {
  customerFromPosition?: number;
};

type RecordLike = Record<string, unknown>;

function record(value: unknown): RecordLike {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as RecordLike)
    : {};
}

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function stringArray(value: unknown, max = 12) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => text(item, 260)).filter(Boolean))].slice(0, max);
}

function intent(value: unknown): ActionIntent | null {
  const candidate = text(value, 80) as ActionIntent;
  return ACTION_INTENTS.includes(candidate) ? candidate : null;
}

function normalizeLine(value: unknown) {
  const source = record(value);
  const tax = numberOrNull(source.tax_rate);
  return {
    label: text(source.label, 240),
    description: text(source.description, 800),
    quantity: numberOrNull(source.quantity),
    unit: text(source.unit, 40) || null,
    unit_price: numberOrNull(source.unit_price),
    tax_rate: tax !== null && [0, 5.5, 10, 20].includes(tax) ? tax : null,
  };
}

function normalizeCustomerPayload(source: RecordLike) {
  const kind = source.kind === "individual" ? "individual" : "business";
  const emails = Array.isArray(source.emails)
    ? source.emails.map((item) => text(item, 160)).filter(Boolean)
    : [text(source.email1, 160), text(source.email2, 160)].filter(Boolean);
  const phones = Array.isArray(source.phones)
    ? source.phones.map((item) => text(item, 40)).filter(Boolean)
    : [text(source.phone1, 40), text(source.phone2, 40)].filter(Boolean);
  const addresses = Array.isArray(source.addresses)
    ? source.addresses.slice(0, 5).map((item) => {
        const address = record(item);
        return {
          label: text(address.label, 80) || "Principale",
          line1: text(address.line1, 220),
          line2: text(address.line2, 220),
          postal_code: text(address.postal_code, 12),
          city: text(address.city, 120),
          country: text(address.country, 80) || "France",
        };
      })
    : [{
        label: "Principale",
        line1: text(source.line1, 220),
        postal_code: text(source.postal_code, 12),
        city: text(source.city, 120),
        country: "France",
      }];
  return {
    kind,
    company_name: text(source.company_name, 180) || null,
    civility: text(source.civility, 30) || null,
    last_name: text(source.last_name, 120) || null,
    first_name: text(source.first_name, 120) || null,
    siret: text(source.siret, 24).replace(/\D/g, "") || null,
    vat_number: text(source.vat_number, 30).replace(/\s/g, "").toUpperCase() || null,
    emails,
    phones,
    addresses: addresses.filter((address) => address.line1 || address.city),
    notes: text(source.notes, 2000) || null,
  };
}

function normalizeDocumentPayload(source: RecordLike) {
  const items = Array.isArray(source.items) ? source.items.slice(0, 100).map(normalizeLine) : [];
  const customerFromPosition = numberOrNull(source.customer_from_position);
  return {
    customer_id: text(source.customer_id, 80) || null,
    customer_hint: text(source.customer_hint, 180),
    customer_from_position: customerFromPosition === null ? null : Math.floor(customerFromPosition),
    customer_from_proposal_id: text(source.customer_from_proposal_id, 80) || null,
    quote_id: text(source.quote_id, 80) || null,
    quote_number: text(source.quote_number, 100) || null,
    title: text(source.title, 260) || "Travaux",
    notes: text(source.notes, 2400) || null,
    site_address: text(source.site_address, 320) || null,
    issue_date: text(source.issue_date, 20) || null,
    expiry_date: text(source.expiry_date, 20) || null,
    due_date: text(source.due_date, 20) || null,
    items,
  };
}

function normalizeSchedulePayload(source: RecordLike) {
  return {
    customer_hint: text(source.customer_hint, 180),
    title: text(source.title, 260),
    date: text(source.date, 20),
    time: text(source.time, 12),
    location: text(source.location, 320),
    type: text(source.type, 80) || "Chantier",
    notes: text(source.notes, 1200),
  };
}

function normalizeOrderPayload(source: RecordLike) {
  return {
    project_id: text(source.project_id, 180) || null,
    supplier_name: text(source.supplier_name, 200),
    supplier_email: text(source.supplier_email, 254),
    label: text(source.label, 500),
    quantity: numberOrNull(source.quantity) ?? 1,
    unit_price: numberOrNull(source.unit_price) ?? 0,
    notes: text(source.notes, 3000),
  };
}

function missingForIntent(intentType: ActionIntent, payload: RecordLike) {
  const missing: string[] = [];
  if (intentType === "create_customer") {
    const customer = normalizeCustomerPayload(payload);
    if (customer.kind === "business" && !customer.company_name) missing.push("raison_sociale");
    if (customer.kind === "individual" && !customer.last_name) missing.push("nom_client");
  }
  if (intentType === "prepare_quote" || intentType === "prepare_invoice") {
    const document = normalizeDocumentPayload(payload);
    if (!document.customer_id && !document.customer_hint && document.customer_from_position === null && !document.customer_from_proposal_id) {
      missing.push("client");
    }
    if (!document.items.length && !document.quote_id && !document.quote_number) missing.push("prestations");
  }
  if (intentType === "update_project_note") {
    if (!text(payload.project_id, 180)) missing.push("chantier");
    if (!text(payload.body, 5000)) missing.push("note");
  }
  if (intentType === "prepare_supplier_order") {
    const order = normalizeOrderPayload(payload);
    if (!order.supplier_name) missing.push("fournisseur");
    if (!order.supplier_email) missing.push("email_fournisseur");
    if (!order.label) missing.push("article");
  }
  if (intentType === "schedule_task") {
    const task = normalizeSchedulePayload(payload);
    if (!task.title) missing.push("objet");
    if (!task.date) missing.push("date");
    if (!task.time) missing.push("heure");
  }
  if (intentType === "mark_payment") {
    if (!text(payload.invoice_id, 80) && !text(payload.invoice_number, 100)) missing.push("facture");
    if ((numberOrNull(payload.amount) ?? 0) <= 0) missing.push("montant");
  }
  if (intentType === "prepare_email") {
    if (!text(payload.to, 254)) missing.push("destinataire");
    if (!text(payload.subject, 300)) missing.push("objet");
    if (!text(payload.body, 6000)) missing.push("message");
  }
  return missing;
}

function payloadForIntent(intentType: ActionIntent, source: RecordLike) {
  if (intentType === "create_customer") return normalizeCustomerPayload(source);
  if (intentType === "prepare_quote" || intentType === "prepare_invoice") return normalizeDocumentPayload(source);
  if (intentType === "schedule_task") return normalizeSchedulePayload(source);
  if (intentType === "prepare_supplier_order") return normalizeOrderPayload(source);
  if (intentType === "update_project_note") {
    return { project_id: text(source.project_id, 180), body: text(source.body ?? source.notes, 5000) };
  }
  if (intentType === "mark_payment") {
    return {
      invoice_id: text(source.invoice_id, 80) || null,
      invoice_number: text(source.invoice_number, 100) || null,
      amount: numberOrNull(source.amount),
      method: text(source.method, 80) || "virement",
      reference: text(source.reference, 500) || "Paiement confirmé via MANUFEO",
    };
  }
  return {
    to: text(source.to, 254),
    subject: text(source.subject, 300),
    body: text(source.body, 6000),
    related_entity: text(source.related_entity, 120) || null,
  };
}

export function plannedActionFromParsed(
  target: Exclude<VoiceActionTarget, "command">,
  parsedValue: unknown,
  transcript: string,
): PlannedAction {
  const parsed = record(parsedValue);
  const intentType: ActionIntent = target === "customer"
    ? "create_customer"
    : target === "quote"
      ? "prepare_quote"
      : target === "invoice"
        ? "prepare_invoice"
        : "schedule_task";
  const payload = payloadForIntent(intentType, parsed);
  const warnings = stringArray(parsed.warnings, 20);
  const missingFields = missingForIntent(intentType, payload as RecordLike);
  return normalizeActionProposal({
    sourceType: "voice",
    rawText: transcript,
    intentType,
    payload,
    confidence: numberOrNull(parsed.confidence) ?? (warnings.length ? 0.72 : 0.9),
    warnings,
    missingFields,
  });
}

export function normalizeModelPlan(rawValue: unknown, transcript: string): PlannedAction[] {
  const raw = record(rawValue);
  const values = Array.isArray(raw.actions) ? raw.actions.slice(0, 12) : [];
  const actions: PlannedAction[] = [];
  for (const value of values) {
    const source = record(value);
    const intentType = intent(source.intent_type);
    if (!intentType) continue;
    const payload = payloadForIntent(intentType, record(source.payload));
    const warnings = stringArray(source.warnings, 20);
    const missingFields = [
      ...missingForIntent(intentType, payload as RecordLike),
      ...stringArray(source.missing_fields, 20),
    ];
    const normalized = normalizeActionProposal({
      sourceType: "voice",
      rawText: transcript,
      intentType,
      payload,
      confidence: numberOrNull(source.confidence) ?? 0.7,
      warnings,
      missingFields: [...new Set(missingFields)],
    });
    const customerFromPosition = numberOrNull(record(source.payload).customer_from_position);
    actions.push({
      ...normalized,
      customerFromPosition: customerFromPosition === null ? undefined : Math.floor(customerFromPosition),
    });
  }
  return actions;
}

export function fallbackCommandPlan(transcript: string): PlannedAction[] {
  const lower = transcript.toLowerCase();
  const likelyIntent: ActionIntent = /facture/.test(lower)
    ? "prepare_invoice"
    : /devis|chiffr/.test(lower)
      ? "prepare_quote"
      : /client|contact/.test(lower)
        ? "create_customer"
        : /rendez-vous|rdv|agenda|mardi|mercredi|jeudi|vendredi|lundi/.test(lower)
          ? "schedule_task"
          : "update_project_note";
  const payload: RecordLike = likelyIntent === "update_project_note"
    ? { project_id: "", body: transcript }
    : likelyIntent === "schedule_task"
      ? { title: transcript, date: "", time: "", location: "", type: "Chantier" }
      : likelyIntent === "create_customer"
        ? { kind: "business", company_name: "", notes: transcript }
        : { customer_hint: "", title: "Travaux", notes: transcript, items: [] };
  const missingFields = missingForIntent(likelyIntent, payload);
  return [normalizeActionProposal({
    sourceType: "voice",
    rawText: transcript,
    intentType: likelyIntent,
    payload,
    confidence: 0.25,
    warnings: ["Le plan multi-actions nécessite DeepSeek. La demande a été conservée sans inventer les informations manquantes."],
    missingFields,
  })];
}
