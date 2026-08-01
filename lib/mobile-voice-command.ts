import {
  calculateTotals,
  customerDisplayName,
  makeId,
  normalizeInvoice,
  normalizeQuote,
  upsertAgenda,
  upsertCustomer,
  upsertInvoice,
  upsertQuote,
  type AgendaType,
  type InvoiceStatus,
  type LineItem,
  type MobileAgendaEntry,
  type MobileCustomer,
  type MobileInvoice,
  type MobileQuote,
  type MobileWorkspace,
  type QuoteStatus,
} from "./mobile-prototype";
import { parseAgendaVoiceRequest } from "./mobile-agenda-voice";

export type VoiceEntityKind = "quote" | "invoice" | "agenda" | "customer";

export type VoiceLineOperation = {
  action: "add" | "update" | "delete";
  match?: string;
  designation?: string;
  description?: string;
  quantite?: number;
  unite?: string;
  prix_unitaire_ht?: number;
  taux_tva?: number;
};

export type MobileVoiceCommand = {
  entity: VoiceEntityKind;
  id: string;
  summary: string;
  changes?: {
    customer_id?: string;
    customer_name?: string;
    title?: string;
    notes?: string;
    status?: string;
    issue_date?: string;
    expiry_date?: string;
    due_date?: string;
    paid_total?: number;
    date?: string;
    time?: string;
    type?: string;
    done?: boolean;
    company_name?: string;
    civility?: string;
    last_name?: string;
    first_name?: string;
    email?: string;
    phone?: string;
    address?: string;
    postal_code?: string;
    city?: string;
    siret?: string;
    vat?: string;
  };
  line_operations?: VoiceLineOperation[];
};

const normalize = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function validTime(value: unknown) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : undefined;
}

function finite(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function findCustomer(workspace: MobileWorkspace, id?: string, name?: string) {
  if (id) {
    const exact = workspace.customers.find((customer) => customer.id === id);
    if (exact) return exact;
  }
  const needle = normalize(name || "");
  if (!needle) return undefined;
  const matches = workspace.customers.filter((customer) => {
    const candidate = normalize(customerDisplayName(customer));
    return candidate === needle || candidate.includes(needle) || needle.includes(candidate);
  });
  return matches.length === 1 ? matches[0] : undefined;
}

function lineScore(line: LineItem, match: string) {
  const needle = normalize(match);
  const label = normalize(`${line.label} ${line.description}`);
  if (!needle || !label) return 0;
  if (label === needle) return 100;
  if (label.includes(needle) || needle.includes(label)) return 80;
  const tokens = needle.split(" ").filter((token) => token.length > 2);
  return tokens.reduce((score, token) => score + (label.includes(token) ? 10 : 0), 0);
}

function applyLineOperations(items: LineItem[], operations: VoiceLineOperation[] = []) {
  let result = items.map((item) => ({ ...item }));
  for (const operation of operations) {
    if (operation.action === "add") {
      const designation = String(operation.designation || operation.match || "").trim();
      if (!designation) continue;
      result.push({
        id: makeId("line"),
        label: designation,
        description: String(operation.description || ""),
        quantity: finite(operation.quantite) ?? 1,
        unit: String(operation.unite || "u"),
        unitPrice: finite(operation.prix_unitaire_ht) ?? 0,
        taxRate: finite(operation.taux_tva) ?? 20,
      });
      continue;
    }

    const match = String(operation.match || operation.designation || "").trim();
    if (!match) continue;
    const ranked = result
      .map((line, index) => ({ index, score: lineScore(line, match) }))
      .sort((a, b) => b.score - a.score);
    if (!ranked[0] || ranked[0].score <= 0) continue;
    const index = ranked[0].index;

    if (operation.action === "delete") {
      result = result.filter((_, current) => current !== index);
      continue;
    }

    const current = result[index];
    result[index] = {
      ...current,
      label: String(operation.designation || current.label),
      description: operation.description === undefined ? current.description : String(operation.description),
      quantity: finite(operation.quantite) ?? current.quantity,
      unit: operation.unite === undefined ? current.unit : String(operation.unite),
      unitPrice: finite(operation.prix_unitaire_ht) ?? current.unitPrice,
      taxRate: finite(operation.taux_tva) ?? current.taxRate,
    };
  }
  return result;
}

function quoteStatus(value: unknown): QuoteStatus | undefined {
  const text = normalize(String(value || ""));
  if (/attente/.test(text)) return "En attente";
  if (/valid|accept/.test(text)) return "Validé";
  if (/termin|archive|pay/.test(text)) return "Terminé";
  if (/refus|annul/.test(text)) return "Refusé";
  return undefined;
}

function invoiceStatus(value: unknown): InvoiceStatus | undefined {
  const text = normalize(String(value || ""));
  if (/brouillon/.test(text)) return "Brouillon";
  if (/retard/.test(text)) return "En retard";
  if (/pay|regl/.test(text)) return "Payée";
  if (/avoir/.test(text)) return "Avoir";
  if (/cours|envoy/.test(text)) return "En cours";
  return undefined;
}

function agendaType(value: unknown): AgendaType | undefined {
  const text = normalize(String(value || ""));
  if (/factur/.test(text)) return "Facturation";
  if (/command/.test(text)) return "Commande";
  if (/relanc/.test(text)) return "Relance";
  if (/chantier|rendez|visite|intervention/.test(text)) return "Chantier";
  return undefined;
}

export function applyMobileVoiceCommand(workspace: MobileWorkspace, command: MobileVoiceCommand): MobileWorkspace {
  const changes = command.changes || {};
  if (command.entity === "quote") {
    const current = workspace.quotes.find((item) => item.id === command.id);
    if (!current) return workspace;
    const customer = findCustomer(workspace, changes.customer_id, changes.customer_name);
    const items = applyLineOperations(current.items, command.line_operations);
    const quote: MobileQuote = normalizeQuote({
      ...current,
      customerId: customer?.id || current.customerId,
      customerName: customer ? customerDisplayName(customer) : current.customerName,
      title: changes.title === undefined ? current.title : String(changes.title),
      notes: changes.notes === undefined ? current.notes : String(changes.notes),
      status: quoteStatus(changes.status) || current.status,
      issueDate: validDate(changes.issue_date) || current.issueDate,
      expiryDate: validDate(changes.expiry_date) || current.expiryDate,
      items: items.length ? items : current.items,
      ...calculateTotals(items.length ? items : current.items),
    });
    return upsertQuote(workspace, quote);
  }

  if (command.entity === "invoice") {
    const current = workspace.invoices.find((item) => item.id === command.id);
    if (!current) return workspace;
    const customer = findCustomer(workspace, changes.customer_id, changes.customer_name);
    const items = applyLineOperations(current.items, command.line_operations);
    const status = invoiceStatus(changes.status) || current.status;
    const invoice: MobileInvoice = normalizeInvoice({
      ...current,
      customerId: customer?.id || current.customerId,
      customerName: customer ? customerDisplayName(customer) : current.customerName,
      title: changes.title === undefined ? current.title : String(changes.title),
      notes: changes.notes === undefined ? current.notes : String(changes.notes),
      status,
      issueDate: validDate(changes.issue_date) || current.issueDate,
      dueDate: validDate(changes.due_date) || current.dueDate,
      paidTotal: status === "Payée" ? finite(changes.paid_total) ?? current.total : finite(changes.paid_total) ?? current.paidTotal,
      items: items.length ? items : current.items,
      ...calculateTotals(items.length ? items : current.items),
    });
    return upsertInvoice(workspace, invoice);
  }

  if (command.entity === "agenda") {
    const current = workspace.agenda.find((item) => item.id === command.id);
    if (!current) return workspace;
    const customer = findCustomer(workspace, changes.customer_id, changes.customer_name);
    const entry: MobileAgendaEntry = {
      ...current,
      customerId: customer?.id || current.customerId,
      customerName: customer ? customerDisplayName(customer) : current.customerName,
      title: changes.title === undefined ? current.title : String(changes.title),
      date: validDate(changes.date) || current.date,
      time: validTime(changes.time) || current.time,
      type: agendaType(changes.type) || current.type,
      done: typeof changes.done === "boolean" ? changes.done : current.done,
    };
    return upsertAgenda(workspace, entry);
  }

  const current = workspace.customers.find((item) => item.id === command.id);
  if (!current) return workspace;
  const customer: MobileCustomer = {
    ...current,
    companyName: changes.company_name === undefined ? current.companyName : String(changes.company_name),
    civility: changes.civility === undefined ? current.civility : String(changes.civility),
    lastName: changes.last_name === undefined ? current.lastName : String(changes.last_name),
    firstName: changes.first_name === undefined ? current.firstName : String(changes.first_name),
    emails: changes.email === undefined ? current.emails : [String(changes.email), current.emails[1] || ""],
    phones: changes.phone === undefined ? current.phones : [String(changes.phone), current.phones[1] || ""],
    address: changes.address === undefined ? current.address : String(changes.address),
    postalCode: changes.postal_code === undefined ? current.postalCode : String(changes.postal_code),
    city: changes.city === undefined ? current.city : String(changes.city),
    siret: changes.siret === undefined ? current.siret : String(changes.siret),
    vat: changes.vat === undefined ? current.vat : String(changes.vat),
    notes: changes.notes === undefined ? current.notes : String(changes.notes),
  };
  return upsertCustomer(workspace, customer);
}

function moneyValue(text: string, expression: RegExp) {
  const match = text.match(expression)?.[1];
  if (!match) return undefined;
  const value = Number(match.replace(",", "."));
  return Number.isFinite(value) ? value : undefined;
}

export function fallbackMobileVoiceCommand(
  transcript: string,
  target: { entity: VoiceEntityKind; id: string; data: MobileQuote | MobileInvoice | MobileAgendaEntry | MobileCustomer },
  workspace: MobileWorkspace,
  reference = new Date(),
): MobileVoiceCommand {
  const text = transcript.trim();
  const normalizedText = normalize(text);
  const changes: MobileVoiceCommand["changes"] = {};
  const operations: VoiceLineOperation[] = [];

  const customerMention = text.match(/(?:client|pour|avec)\s+([^,.;]+?)(?=\s+(?:et|au|à|a|le|la|pour|sur|passe|mets|change)\b|[,.;]|$)/i)?.[1]?.trim();
  const customer = customerMention ? findCustomer(workspace, undefined, customerMention) : undefined;
  if (customer) {
    changes.customer_id = customer.id;
    changes.customer_name = customerDisplayName(customer);
  }

  const title = text.match(/(?:objet|titre|chantier|consigne)\s+(?:en|à|a|par)?\s*[«\"]?([^.;»\"]+)/i)?.[1]?.trim();
  if (title) changes.title = title;

  if (target.entity === "quote") {
    const status = quoteStatus(normalizedText);
    if (status) changes.status = status;
  }

  if (target.entity === "invoice") {
    const status = invoiceStatus(normalizedText);
    if (status) changes.status = status;
  }

  if (target.entity === "agenda") {
    const parsed = parseAgendaVoiceRequest(text, reference);
    if (parsed.date) changes.date = parsed.date;
    if (parsed.time) changes.time = parsed.time;
    if (parsed.title && !/^Rendez-vous$/i.test(parsed.title)) changes.title = parsed.title;
    if (parsed.type) changes.type = parsed.type;
    const agendaCustomer = findCustomer(workspace, undefined, parsed.customer_hint);
    if (agendaCustomer) {
      changes.customer_id = agendaCustomer.id;
      changes.customer_name = customerDisplayName(agendaCustomer);
    }
    if (/\b(?:termine|fait|realise)\b/.test(normalizedText)) changes.done = true;
    if (/\b(?:rouvre|pas termine|a faire)\b/.test(normalizedText)) changes.done = false;
  }

  const deleteMatch = text.match(/(?:supprime|retire|enl[eè]ve|oublie)\s+(?:la ligne|le poste|la prestation)?\s*([^.;]+)/i)?.[1]?.trim();
  if (deleteMatch && (target.entity === "quote" || target.entity === "invoice")) {
    operations.push({ action: "delete", match: deleteMatch });
  }

  const addMatch = text.match(/(?:ajoute|rajoute)\s+(\d+(?:[,.]\d+)?)?\s*(m2|m²|m|ml|l|h|heures?|unit[eé]s?|u|forfait)?\s*(?:de\s+)?([^.;]+?)\s+(?:à|a)\s*(\d+(?:[,.]\d+)?)\s*(?:€|euros?)/i);
  if (addMatch && (target.entity === "quote" || target.entity === "invoice")) {
    operations.push({
      action: "add",
      designation: addMatch[3].trim(),
      quantite: Number((addMatch[1] || "1").replace(",", ".")),
      unite: addMatch[2] || "u",
      prix_unitaire_ht: Number(addMatch[4].replace(",", ".")),
      taux_tva: moneyValue(text, /tva\s*(?:à|a|de)?\s*(5[,.]5|10|20|0)\s*%/i),
    });
  }

  const updateMatch = text.match(/(?:sur|pour)\s+(?:la ligne|le poste|la prestation)?\s*([^,.;]+?)[,:]?\s*(?:passe|mets?|change|remplace)[^.;]*/i)?.[1]?.trim();
  if (updateMatch && (target.entity === "quote" || target.entity === "invoice")) {
    operations.push({
      action: "update",
      match: updateMatch,
      quantite: moneyValue(text, /(?:quantit[eé]|surface)\s*(?:à|a|de)?\s*(\d+(?:[,.]\d+)?)/i),
      prix_unitaire_ht: moneyValue(text, /(?:prix|tarif|passe|mets?|remplace)\s*(?:le\s+prix\s*)?(?:à|a|par)?\s*(\d+(?:[,.]\d+)?)\s*(?:€|euros?)/i),
      taux_tva: moneyValue(text, /tva\s*(?:à|a|de)?\s*(5[,.]5|10|20|0)\s*%/i),
    });
  }

  return {
    entity: target.entity,
    id: target.id,
    summary: `Modification vocale de ${target.entity === "quote" ? "ce devis" : target.entity === "invoice" ? "cette facture" : target.entity === "agenda" ? "cet événement" : "ce client"}.`,
    changes,
    line_operations: operations,
  };
}

export function sanitizeMobileVoiceCommand(value: unknown, fallback: MobileVoiceCommand): MobileVoiceCommand {
  if (!value || typeof value !== "object") return fallback;
  const raw = value as Record<string, unknown>;
  const entity = ["quote", "invoice", "agenda", "customer"].includes(String(raw.entity))
    ? String(raw.entity) as VoiceEntityKind
    : fallback.entity;
  const id = typeof raw.id === "string" && raw.id ? raw.id : fallback.id;
  const summary = typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim().slice(0, 500) : fallback.summary;
  const changes = raw.changes && typeof raw.changes === "object" ? raw.changes as MobileVoiceCommand["changes"] : fallback.changes;
  const lineOperations = Array.isArray(raw.line_operations)
    ? raw.line_operations.slice(0, 100).filter((operation): operation is VoiceLineOperation => Boolean(operation && typeof operation === "object" && ["add", "update", "delete"].includes(String((operation as Record<string, unknown>).action))))
    : fallback.line_operations;
  return { entity, id, summary, changes, line_operations: lineOperations };
}
