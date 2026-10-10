import { sourceTableFacts } from './source-table-facts';
import { sourceWorkItems } from './source-work-scope';
import { documentUnit } from "./document-units";
import { reuseSameDocumentPrices } from './same-document-prices';
import { interventionNotes } from './document-intervention-notes';
import { insuranceDocumentNotes } from "./document-insurance";
import { restoreSourcePhone } from './phone-display';
import { spokenAmountPattern } from "./spoken-financial-number";
import { applyDeductibleLine, deductibleLineNotes, isDeductibleLine, spokenDeductibleAdjustment, withoutPaymentAdjustments } from "./document-deductible";
import { applySpokenPercentageLines, spokenDiscount } from "./percentage-adjustments";
import { stripUngroundedDiscountNotes, worksiteDocumentNotes } from './document-parties';
import { applySupplierMarkup, isSupplierMarkupLine, spokenSupplierMarkup, supplierMarkupNotes, withoutSupplierMarkup } from './supplier-markup';
import {
  ACTION_INTENTS,
  riskLevelForIntent,
  type ActionIntent,
  type ActionRiskLevel,
} from "@/lib/action-engine";
import {
  explicitPrice,
  explicitQuantity,
  explicitTax,
  groundedEvidence,
  isEmailSeparatorWarning,
  normalizeSpokenEmail,
  roomEvidenceSegments,
  roomQuantityEvidence,
  spelledName,
  spokenPriceType,
} from "@/lib/voice-facts";
import { polishFrenchTradeDesignation } from "@/lib/quote-language-polish";
import { scopedVoiceUnitPrices, sharedVoiceUnitPrice } from './voice-document-lines';

export type VoiceActionTarget = "command" | "quote" | "invoice" | "customer" | "supplier" | "agenda";

export type PlannedAction = {
  sourceType: "voice";
  rawText: string;
  intentType: ActionIntent;
  payload: Record<string, unknown>;
  riskLevel: ActionRiskLevel;
  status: "needs_input" | "ready";
  confidence: number;
  warnings: string[];
  missingFields: string[];
  customerFromPosition?: number;
  quoteFromPosition?: number;
  collaboratorFromPositions?: number[];
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

function normalizeLine(value: unknown, transcript: string, roomSegment?: string, roomQuantity?: number | null, alreadyConverted = false, sharedPrice?: ReturnType<typeof sharedVoiceUnitPrice>, scopedPrice?: ReturnType<typeof sharedVoiceUnitPrice>) {
  const original = record(value);
  const table = sourceTableFacts(transcript, text(original.label, 240));
  const artisan = transcript.split('Informations issues des sources à vérifier :')[0].split('Instructions de l’artisan :')[1] || '';
  const artisanOverride = Boolean(groundedEvidence(artisan, original.price_evidence));
  const artisanQuantityOverride = Boolean(groundedEvidence(artisan, original.quantity_evidence));
  const source = table ? { ...original, ...table,
    ...(artisanOverride ? { unit_price: original.unit_price } : {}),
    ...(artisanQuantityOverride ? { quantity: original.quantity, unit: original.unit } : {}),
  } : original;
  const quantityEvidence = groundedEvidence(transcript, source.quantity_evidence);
  const priceEvidence = groundedEvidence(transcript, source.price_evidence);
  const taxEvidence = groundedEvidence(transcript, source.tax_evidence);
  const unitEvidence = quantityEvidence || priceEvidence;
  const quantityFromEvidence = unitEvidence ? explicitQuantity(unitEvidence) : null;
  const quantity = table && !artisanQuantityOverride ? table.quantity : quantityFromEvidence !== null ? quantityFromEvidence
    : roomQuantity !== undefined ? roomQuantity : numberOrNull(source.quantity);
  const pricesInRoom = roomSegment ? [...withoutPaymentAdjustments(withoutSupplierMarkup(roomSegment)).matchAll(new RegExp(`${spokenAmountPattern}\\s*(?:€|euros?)`, 'giu'))] : [];
  const priceInRoom = pricesInRoom.length === 1 ? explicitPrice(pricesInRoom[0][0]) : null;
  const sourcePrice = numberOrNull(source.unit_price);
  const explicitSingleForfait = text(source.unit, 40).toLocaleLowerCase("fr-FR") === "forfait"
    && sourcePrice !== null
    && [...transcript.matchAll(/\b(?:un|une|1)\s+forfait\b[^.!?]{0,45}?\b(\d+(?:[,.]\d+)?)\s*(?:€|euros?)/giu)]
      .some((match) => explicitPrice(match[0]) === sourcePrice);
  const spokenPrice = table && !artisanOverride ? table.unit_price : alreadyConverted && sourcePrice !== null && !scopedPrice
    ? sourcePrice : scopedPrice?.amount ?? sharedPrice?.amount ?? (priceEvidence ? explicitPrice(priceEvidence) : null) ?? priceInRoom ?? sourcePrice;
  const taxesInTranscript = [...withoutPaymentAdjustments(withoutSupplierMarkup(transcript)).matchAll(new RegExp(`(?:tva|taxe\\s+sur\\s+la\\s+valeur\\s+ajoutée)\\s*(?:à|a|de|au\\s+taux\\s+de)?\\s*[:=]?\\s*(${spokenAmountPattern})\\s*(?:%|pour\\s+cent)?`, 'giu'))]
    .map((match) => {
      const lineScope = /\b(?:(?:uniquement|seulement|exclusivement)\s+)?(?:pour|sur)\s+(?:cette|ce|la)\s+(?:ligne|prestation)\b/iu;
      const after = transcript.slice(match.index + match[0].length, match.index + match[0].length + 65).split(/[.!?]/u)[0];
      const before = transcript.slice(Math.max(0, match.index - 65), match.index).split(/[.!?]/u).at(-1) ?? "";
      return { rate: explicitTax(match[0]), position: match.index, scoped: lineScope.test(after) || lineScope.test(before) };
    });
  const segmentPosition = roomSegment ? transcript.indexOf(roomSegment) : -1;
  const firstPricePosition = transcript.search(/\d+(?:[,.]\d+)?\s*(?:€|euros?)/iu);
  const initialTax = taxesInTranscript[0] && !taxesInTranscript[0].scoped
    && (firstPricePosition < 0 || taxesInTranscript[0].position < firstPricePosition)
    ? taxesInTranscript[0].rate : null;
  const persistentTaxes = initialTax !== null ? taxesInTranscript.filter((match) => !match.scoped) : [];
  const evidencePosition = [quantityEvidence, priceEvidence]
    .filter(Boolean)
    .map((phrase) => transcript.indexOf(phrase))
    .filter((position) => position >= 0)
    .sort((a, b) => a - b)[0] ?? -1;
  const linePosition = evidencePosition >= 0 ? evidencePosition : segmentPosition;
  const priorTax = linePosition >= 0
    ? persistentTaxes.filter((match) => match.position <= linePosition).at(-1)?.rate ?? null : null;
  // A single unscoped rate remains the document default even when spoken
  // after the first price. Never inherit a rate explicitly limited to a line.
  const unscopedRates = [...new Set(taxesInTranscript.filter(match => !match.scoped).map(match => match.rate))];
  const confirmedTax = unscopedRates.length === 1 ? unscopedRates[0] : null;
  // Source tables often put the TVA header and the row percentage in separate cells.
  const rowRates = taxEvidence ? [...taxEvidence.matchAll(/\b(0|5[,.]5|10|20)\s*%/gu)].map(match => Number(match[1].replace(',', '.'))) : [];
  const sourcesStart = transcript.indexOf('Informations issues des sources à vérifier :');
  const sourceObservations = sourcesStart >= 0 ? transcript.slice(sourcesStart + 'Informations issues des sources à vérifier :'.length) : '';
  const sourceRowTax = /\bTVA\s*(?:\(\s*%\s*\))?\s*(?:[|;\t\r\n]|$)/imu.test(sourceObservations)
    && Boolean(groundedEvidence(sourceObservations, taxEvidence))
    && rowRates.length === 1 && numberOrNull(source.tax_rate) === rowRates[0] ? rowRates[0] : null;
  const instructionsStart = transcript.indexOf('Instructions de l’artisan :');
  const artisanRates = [...new Set(taxesInTranscript.filter(match => !match.scoped
    && instructionsStart >= 0 && match.position >= instructionsStart
    && sourcesStart > instructionsStart && match.position < sourcesStart).map(match => match.rate))];
  const artisanTax = artisanRates.length === 1 ? artisanRates[0] : null;
  const artisanEvidence = instructionsStart >= 0 && sourcesStart > instructionsStart
    ? groundedEvidence(transcript.slice(instructionsStart, sourcesStart), taxEvidence) : null;
  const tax = (artisanEvidence ? explicitTax(artisanEvidence) : null) ?? artisanTax
    ?? table?.tax_rate ?? (taxEvidence ? explicitTax(taxEvidence) : null) ?? sourceRowTax ?? priorTax ?? initialTax ?? confirmedTax;
  // The source wrapper mentions both HT and TTC as instructions. These are not
  // conflicting price evidence; only the artisan's text and source data count.
  const priceText = sourcesStart >= 0 ? `${instructionsStart >= 0 ? transcript.slice(instructionsStart + 'Instructions de l’artisan :'.length, sourcesStart) : ''}\n${sourceObservations}` : transcript;
  const priceTranscript = withoutPaymentAdjustments(withoutSupplierMarkup(priceText));
  const roomPriceType = roomSegment ? spokenPriceType(withoutPaymentAdjustments(withoutSupplierMarkup(roomSegment))) : null;
  const mixedPriceTypes = /(?:\bttc\b|toutes? taxes? comprises?)/iu.test(priceTranscript)
    && /(?:\bht\b|hors[- ]taxes?)/iu.test(priceTranscript);
  // Ground a cell against its unit-price header; totals elsewhere in the source
  // do not change that column from HT to TTC.
  const columnTypes = [...sourceObservations.matchAll(/prix\s+unitaire\s*(?:\(\s*)?(HT|TTC)\b/giu)]
    .flatMap(match => {
      const block = sourceObservations.slice(match.index + match[0].length).split(/\btotal\s+(?:HT|TTC)|\n\s*\n/iu)[0];
      return priceEvidence && groundedEvidence(block, priceEvidence)
        && explicitPrice(priceEvidence) === sourcePrice ? [match[1].toLowerCase()] : [];
    });
  const columnType = [...new Set(columnTypes)].length === 1 ? columnTypes[0] : null;
  const priceType = (table && !artisanOverride ? table.price_type : null) ?? scopedPrice?.type ?? sharedPrice?.type ?? spokenPriceType(priceEvidence) ?? columnType ?? roomPriceType
    ?? (mixedPriceTypes ? "ambiguous" : spokenPriceType(priceTranscript) ?? "unknown");
  const importDefault = transcript.startsWith('Prépare un brouillon de devis à partir des éléments suivants.')
    && transcript.slice(0, instructionsStart).includes('TVA par défaut à l’import : 10 %');
  const sourceTableHasRates = /\bTVA\s*(?:\(\s*%\s*\))?\s*(?:[|;\t\r\n]|$)/imu.test(sourceObservations)
    && /\d+(?:[,.]\d+)?\s*%/u.test(sourceObservations);
  const normalizedTax = tax !== null && [0, 5.5, 10, 20].includes(tax) ? tax
    : tax === null && importDefault && !taxesInTranscript.length && !sourceTableHasRates ? 10 : null;
  const needsTtcConversion = priceType === "ttc" && ((table && !artisanOverride) || !alreadyConverted || sourcePrice === null || scopedPrice?.type === 'ttc');
  const ttcWithoutTax = priceType === "ttc" && normalizedTax === null;
  const unitPrice = ttcWithoutTax || priceType === "ambiguous" ? null : needsTtcConversion
    ? normalizedTax === null || spokenPrice === null ? null : Math.round(spokenPrice / (1 + normalizedTax / 100) * 100) / 100
    : spokenPrice;
  return {
    label: polishFrenchTradeDesignation(text(source.label, 240)),
    description: text(source.description, 800).split('\n').map(polishFrenchTradeDesignation).join('\n'),
    quantity: quantity ?? (explicitSingleForfait ? 1 : null),
    unit: /\b(?:une?|1)\s+unit[ée](?![\p{L}])/iu.test(unitEvidence) ? 'U'
      : /\b(?:une?|1)\s+forfait\b/iu.test(unitEvidence) ? 'forfait'
      : documentUnit(source.unit) || (/^rouleaux?\b/iu.test(text(source.label, 240)) && /\brouleaux?\b/iu.test(transcript) ? 'rouleaux' : null),
    unit_price: unitPrice,
    tax_rate: normalizedTax,
    price_type: priceType,
    spoken_price_ttc: ttcWithoutTax ? spokenPrice : null,
    spoken_price_ambiguous: priceType === "ambiguous" ? spokenPrice : null,
  };
}

function normalizeCustomerPayload(source: RecordLike, transcript = "") {
  const kind = source.kind === "individual" ? "individual" : "business";
  const emails = Array.isArray(source.emails)
    ? source.emails.map((item) => normalizeSpokenEmail(item, transcript).slice(0, 160)).filter(Boolean)
    : [normalizeSpokenEmail(source.email1, transcript), normalizeSpokenEmail(source.email2, transcript)].filter(Boolean);
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
    last_name: spelledName(transcript, "nom") || text(source.last_name, 120) || null,
    first_name: spelledName(transcript, "prénom") || text(source.first_name, 120) || null,
    siret: text(source.siret, 24).replace(/\D/g, "") || null,
    vat_number: text(source.vat_number, 30).replace(/\s/g, "").toUpperCase() || null,
    emails,
    phones: phones.map(phone => restoreSourcePhone(phone, transcript)),
    addresses: addresses.filter((address) => address.line1 || address.city),
    notes: insuranceDocumentNotes(text(source.notes, 2000), source.insurance, transcript) || null,
  };
}

function normalizeDocumentPayload(source: RecordLike, transcript = "", alreadyConverted = false) {
  const markupPercent = spokenSupplierMarkup(transcript);
  const original = Array.isArray(source.items) ? sourceWorkItems(source.items.slice(0, 100), transcript).filter(item => !isDeductibleLine({ label: text(record(item).label, 240) }) && !(markupPercent !== null && isSupplierMarkupLine(text(record(item).label,240)))) : [];
  const labels = original.map((item) => text(record(item).label, 240));
  const sharedPrice = sharedVoiceUnitPrice(transcript, original.length);
  const scopedPrices = scopedVoiceUnitPrices(transcript, original.map(item => ({ label: text(record(item).label, 240), unit: text(record(item).unit, 40) })));
  const roomSegments = roomEvidenceSegments(transcript, labels);
  const roomQuantities = roomQuantityEvidence(transcript, labels);
  let normalizedItems = original.map((item, index) => normalizeLine(item, transcript, roomSegments[index], roomQuantities[index], alreadyConverted, sharedPrice, scopedPrices[index])).filter((line) =>
    // A trailing empty placeholder from the model is not a requested service.
    Boolean(line.label && !/^prestation(?:\s+à\s+compléter)?$/i.test(line.label))
      || (line.quantity !== null && line.quantity > 0) || line.unit_price !== null,
  );
  if (markupPercent !== null) normalizedItems = normalizedItems.map(item=>({...item,description:supplierMarkupNotes(item.description)}));
  normalizedItems = reuseSameDocumentPrices(normalizedItems, original.map(record), transcript);
  // Preparation and finishing steps covered by one explicitly priced unit are
  // one service. The model must not multiply that single spoken charge.
  const serviceTranscript = withoutPaymentAdjustments(withoutSupplierMarkup(transcript));
  const prices = [...serviceTranscript.matchAll(new RegExp(`${spokenAmountPattern}\\s*(?:€|euros?)`, 'giu'))];
  const units = [...serviceTranscript.matchAll(/\b(?:une?|1)\s+(?:unit[ée]|forfait)(?![\p{L}])/giu)];
  const otherQuantities = [...serviceTranscript.matchAll(/\b\d+(?:[,.]\d+)?\s*(?:m²|m2|mètres?|rouleaux?|heures?|pièces?|unités?|forfaits?)(?![\p{L}])/giu)];
  if (normalizedItems.length >= 1 && prices.length === 1 && units.length === 1
    && otherQuantities.every(match => /^(?:1)\s+(?:unit[ée]|forfait)(?![\p{L}])/iu.test(match[0]))
    && !sharedPrice && !/\b(?:chacun|chacune|chaque|par\s+poste|prix\s+identiques?)\b/iu.test(serviceTranscript)
    && !roomSegments.some(Boolean)
    && normalizedItems.every(item => item.quantity === 1 && (item.unit_price !== null || item.spoken_price_ttc !== null || item.spoken_price_ambiguous !== null))) {
    const first = normalizedItems[0];
    const price = explicitPrice(prices[0][0]);
    // The grounded line evidence wins over HT/TTC labels in source instructions
    // or document totals. Do not reinterpret an HT supplier price as TTC here.
    const type = first.price_type;
    const unitPrice = type === 'ttc' ? first.tax_rate === null || price === null ? null
      : Math.round(price / (1 + first.tax_rate / 100) * 100) / 100 : type === 'ambiguous' ? null : price;
    normalizedItems = [{ ...first,
      label: normalizedItems.map(item => item.label).join(' · ').slice(0, 240),
      description: normalizedItems.length === 1 ? first.description : normalizedItems.map(item => [item.label, item.description].filter(Boolean).join(' : ')).join('\n').slice(0, 800),
      quantity: 1, unit: first.unit === 'forfait' ? 'forfait' : 'U', unit_price: unitPrice,
      price_type: type || first.price_type,
      spoken_price_ttc: type === 'ttc' && first.tax_rate === null ? price : null,
    }];
  }
  const baseItems = normalizedItems.map((item, index) => ({ id: String(index), label: item.label, description: item.description, quantity: item.quantity, unit: item.unit, unitPrice: item.unit_price, taxRate: item.tax_rate }));
  const items = applyDeductibleLine(applySpokenPercentageLines(applySupplierMarkup(baseItems, markupPercent), withoutSupplierMarkup(transcript)), transcript).map(item => ({
    ...(normalizedItems.find(line => line.label === item.label) || {}), label: item.label, description: item.description, quantity: item.quantity, unit: item.unit, unit_price: item.unitPrice, tax_rate: item.taxRate,
  }));
  const customerFromPosition = numberOrNull(source.customer_from_position);
  return {
    customer_id: text(source.customer_id, 80) || null,
    customer_hint: text(source.customer_hint, 180),
    customer_from_position: customerFromPosition === null ? null : Math.floor(customerFromPosition),
    customer_from_proposal_id: text(source.customer_from_proposal_id, 80) || null,
    quote_id: text(source.quote_id, 80) || null,
    quote_number: text(source.quote_number, 100) || null,
    title: text(source.title, 260) || "Travaux",
    notes: interventionNotes(worksiteDocumentNotes(stripUngroundedDiscountNotes((spokenDeductibleAdjustment(transcript)
      ? deductibleLineNotes(insuranceDocumentNotes(markupPercent === null ? text(source.notes, 2400) : supplierMarkupNotes(text(source.notes, 2400)), source.insurance, transcript))
      : insuranceDocumentNotes(markupPercent === null ? text(source.notes, 2400) : supplierMarkupNotes(text(source.notes, 2400)), source.insurance, transcript)), transcript), source, transcript)) || null,
    site_address: text(source.site_address, 320) || null,
    issue_date: text(source.issue_date, 20) || null,
    expiry_date: text(source.expiry_date, 20) || null,
    due_date: text(source.due_date, 20) || null,
    items,
    ...(markupPercent !== null ? { supplier_markup_percent: markupPercent } : {}),
    discount_percent: spokenDiscount(transcript) ?? 0,
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

function normalizeOrderPayload(source: RecordLike, transcript = "") {
  return {
    project_id: text(source.project_id, 180) || null,
    supplier_name: text(source.supplier_name, 200),
    supplier_id: text(source.supplier_id, 160),
    request_type: /(?:demande\s+(?:de\s+)?(?:prix|devis)|devis\s+(?:au|à|a)\s+fournisseur)/iu.test(transcript) ? "price_request" : "order",
    send_requested: /(?:envoie|envoyer|envoies|envois|adresse|adresser|transmets)/iu.test(transcript),
    unit: text(source.unit, 40),
    supplier_email: normalizeSpokenEmail(source.supplier_email, transcript).slice(0, 254),
    label: text(source.label, 500),
    quantity: numberOrNull(source.quantity) ?? 1,
    unit_price: numberOrNull(source.unit_price) ?? 0,
    notes: text(source.notes, 3000),
  };
}

function normalizeProjectPayload(source: RecordLike) {
  return {
    name: text(source.name, 300),
    subtitle: text(source.subtitle, 500),
    customer_hint: text(source.customer_hint, 180),
    customer_id: text(source.customer_id, 80) || null,
    customer_from_position: numberOrNull(source.customer_from_position),
    quote_from_position: numberOrNull(source.quote_from_position),
    address: text(source.address, 320),
    start_date: text(source.start_date, 10),
    next_visit: text(source.next_visit, 10),
    collaborator_names: stringArray(source.collaborator_names, 20),
    collaborator_from_positions: Array.isArray(source.collaborator_from_positions)
      ? source.collaborator_from_positions.slice(0, 20).map(Number)
      : [],
  };
}

function normalizeCollaboratorPayload(source: RecordLike) {
  return {
    name: text(source.name, 240),
    role: text(source.role, 120),
    phone: text(source.phone, 40),
  };
}

export function normalizeSupplierPayload(source: RecordLike, transcript = "") {
  return {
    name: text(source.name ?? source.supplier_name, 200),
    email: normalizeSpokenEmail(source.email ?? source.supplier_email, transcript).slice(0, 254),
    phone: text(source.phone, 40),
    contact: text(source.contact, 200),
    address: text(source.address, 500),
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
  if (intentType === "create_supplier") {
    if (!text(payload.name, 200)) missing.push("nom_fournisseur");
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(String(payload.email))) missing.push("email_fournisseur_invalide");
  }
  if (intentType === "create_project" && !text(payload.name, 300)) missing.push("nom_chantier");
  if (intentType === "create_collaborator" && !text(payload.name, 240)) missing.push("nom_collaborateur");
  if (intentType === "prepare_quote" || intentType === "prepare_invoice") {
    const document = payload;
    if (!document.customer_id && !document.customer_hint && document.customer_from_position == null && !document.customer_from_proposal_id) {
      missing.push("client");
    }
    if ((!Array.isArray(document.items) || !document.items.length) && !document.quote_id && !document.quote_number) missing.push("prestations");
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

function payloadForIntent(intentType: ActionIntent, source: RecordLike, transcript = "", alreadyConverted = false) {
  if (intentType === "create_customer") return normalizeCustomerPayload(source, transcript);
  if (intentType === "create_supplier") return normalizeSupplierPayload(source, transcript);
  if (intentType === "create_collaborator") return normalizeCollaboratorPayload(source);
  if (intentType === "create_project") return normalizeProjectPayload(source);
  if (intentType === "prepare_quote" || intentType === "prepare_invoice") return normalizeDocumentPayload(source, transcript, alreadyConverted);
  if (intentType === "schedule_task") return normalizeSchedulePayload(source);
  if (intentType === "prepare_supplier_order") return normalizeOrderPayload(source, transcript);
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
    to: normalizeSpokenEmail(source.to, transcript).slice(0, 254),
    subject: text(source.subject, 300),
    body: text(source.body, 6000),
    related_entity: text(source.related_entity, 120) || null,
  };
}

function finalizeAction({
  intentType,
  payload,
  transcript,
  confidence,
  warnings,
  missingFields,
  customerFromPosition,
  quoteFromPosition,
  collaboratorFromPositions,
}: {
  intentType: ActionIntent;
  payload: Record<string, unknown>;
  transcript: string;
  confidence?: number | null;
  warnings?: string[];
  missingFields?: string[];
  customerFromPosition?: number;
  quoteFromPosition?: number;
  collaboratorFromPositions?: number[];
}): PlannedAction {
  const dedupedMissing = [...new Set(missingFields ?? [])].slice(0, 30);
  return {
    sourceType: "voice",
    rawText: text(transcript, 20_000),
    intentType,
    payload,
    riskLevel: riskLevelForIntent(intentType),
    status: dedupedMissing.length ? "needs_input" : "ready",
    confidence: Math.max(0, Math.min(1, Number.isFinite(Number(confidence)) ? Number(confidence) : 0)),
    warnings: [...new Set(warnings ?? [])].slice(0, 30),
    missingFields: dedupedMissing,
    ...(typeof customerFromPosition === "number" ? { customerFromPosition } : {}),
    ...(typeof quoteFromPosition === "number" ? { quoteFromPosition } : {}),
    ...(collaboratorFromPositions?.length ? { collaboratorFromPositions } : {}),
  };
}

export function plannedActionFromParsed(
  target: Exclude<VoiceActionTarget, "command">,
  parsedValue: unknown,
  transcript: string,
): PlannedAction {
  const parsed = record(parsedValue);
  const intentType: ActionIntent = target === "supplier" ? "create_supplier" : target === "customer"
    ? "create_customer"
    : target === "quote"
      ? "prepare_quote"
      : target === "invoice"
        ? "prepare_invoice"
        : "schedule_task";
  const payload = payloadForIntent(intentType, parsed, transcript, true);
  const emails = intentType === "create_customer" ? (payload as RecordLike).emails as string[] : [];
  const hasValidEmails = emails.length > 0 && emails.every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email));
  const warnings = stringArray(parsed.warnings, 20).filter((warning) => !(hasValidEmails && isEmailSeparatorWarning(warning)));
  const missingFields = missingForIntent(intentType, payload as RecordLike);
  return finalizeAction({
    intentType,
    payload,
    transcript,
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
    const rawPayload = record(source.payload);
    const payload = payloadForIntent(intentType, rawPayload, transcript);
    const emails = intentType === "create_customer" ? (payload as RecordLike).emails as string[]
      : intentType === "prepare_email" ? [(payload as RecordLike).to as string] : [];
    const hasValidEmail = emails.length > 0 && emails.every((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email));
    const warnings = stringArray(source.warnings, 20).filter((warning) =>
      !(hasValidEmail && isEmailSeparatorWarning(warning))
      && !((intentType === "prepare_quote" || intentType === "prepare_invoice") && /(?:prix|quantit|TVA|HT|TTC|ligne|prestation)/iu.test(warning)));
    // The model can report stale, duplicate or invented field paths. Documents are
    // drafts: derive their blocking requirements from the normalized payload.
    const missingFields = intentType === "prepare_quote" || intentType === "prepare_invoice" || intentType === "create_project" || intentType === "create_collaborator" || intentType === "create_supplier" || intentType === "create_customer" || intentType === "schedule_task"
      ? missingForIntent(intentType, payload as RecordLike)
      : [...missingForIntent(intentType, payload as RecordLike), ...stringArray(source.missing_fields, 20)
        .filter((field) => !(hasValidEmail && ["destinataire", "email_client", "email", "adresse_email"].includes(field)))];
    const customerFromPosition = numberOrNull(rawPayload.customer_from_position);
    const quoteFromPosition = intentType === "create_project" ? numberOrNull(rawPayload.quote_from_position) : null;
    const collaboratorFromPositions = intentType === "create_project"
      ? ((payload as RecordLike).collaborator_from_positions as number[]) : [];
    actions.push(finalizeAction({
      intentType,
      payload,
      transcript,
      confidence: numberOrNull(source.confidence) ?? 0.7,
      warnings,
      missingFields,
      customerFromPosition: customerFromPosition === null ? undefined : Math.floor(customerFromPosition),
      quoteFromPosition: quoteFromPosition === null ? undefined : Math.floor(quoteFromPosition),
      collaboratorFromPositions,
    }));
  }
  return actions;
}

export function fallbackCommandPlan(transcript: string): PlannedAction[] {
  const lower = transcript.toLowerCase();
  const likelyIntent: ActionIntent = /(?:cr[eé]e|ajoute|enregistre).{0,60}fournisseur/.test(lower) ? "create_supplier" : /facture/.test(lower)
    ? "prepare_invoice"
    : /devis|chiffr/.test(lower)
      ? "prepare_quote"
      : /(?:cr[eé]e|ouvrir|ajoute).{0,35}chantier|chantier.{0,35}(?:cr[eé]e|ouvrir)/.test(lower)
        ? "create_project"
      : /(?:cr[eé]e|ajoute).{0,35}collaborateur/.test(lower)
        ? "create_collaborator"
      : /client|contact/.test(lower)
        ? "create_customer"
        : /rendez-vous|rdv|agenda|mardi|mercredi|jeudi|vendredi|lundi/.test(lower)
          ? "schedule_task"
          : "update_project_note";
  const payload: RecordLike = likelyIntent === "update_project_note"
    ? { project_id: "", body: transcript }
    : likelyIntent === "create_project"
      ? { name: "", subtitle: transcript, collaborator_names: [] }
    : likelyIntent === "create_collaborator" || likelyIntent === "create_supplier"
      ? { name: "" }
    : likelyIntent === "schedule_task"
      ? { title: transcript, date: "", time: "", location: "", type: "Chantier" }
      : likelyIntent === "create_customer"
        ? { kind: "business", company_name: "", notes: transcript }
        : { customer_hint: "", title: "Travaux", notes: transcript, items: [] };
  const missingFields = missingForIntent(likelyIntent, payload);
  return [finalizeAction({
    intentType: likelyIntent,
    payload,
    transcript,
    confidence: 0.25,
    warnings: ["Le plan multi-actions nécessite DeepSeek. La demande a été conservée sans inventer les informations manquantes."],
    missingFields,
  })];
}
