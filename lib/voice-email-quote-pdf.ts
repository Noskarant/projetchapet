import { Buffer } from "node:buffer";
import { ApiInputError, isEmail } from "./api-guard";
import { normalizeCompanyProfile } from "./company-profile";
import { buildBusinessDocumentPdf, documentFileName } from "./mobile-document-pdf";
import type { LineItem, MobileCustomer, MobileQuote } from "./mobile-prototype";

export type VoiceEmailQuoteChoice = {
  id: string;
  number: string;
  title: string;
  issueDate: string;
  total: number;
  sameBatch: boolean;
};

type AddressRecord = {
  line1?: unknown;
  line2?: unknown;
  postal_code?: unknown;
  postalCode?: unknown;
  city?: unknown;
  country?: unknown;
};

export type VoiceQuoteRecord = {
  id: string;
  number: string;
  title: string;
  status: string;
  issue_date: string;
  expiry_date: string | null;
  subtotal: number | string;
  tax_total: number | string;
  total: number | string;
  notes: string | null;
  customer_id: string;
  items: Array<{
    id?: string;
    position?: number;
    label: string;
    description?: string | null;
    quantity?: number | string | null;
    unit?: string | null;
    unit_price?: number | string | null;
    tax_rate?: number | string | null;
  }>;
};

export type VoiceQuoteCustomerRecord = {
  id: string;
  kind: string;
  company_name: string | null;
  civility: string | null;
  last_name: string | null;
  first_name: string | null;
  emails: string[];
  phones: string[];
  addresses: AddressRecord[];
  siret: string | null;
  vat_number: string | null;
  notes: string | null;
};

export type VoiceQuoteOrganizationRecord = {
  id: string;
  name: string;
  siret: string | null;
  vat_number: string | null;
  phone: string | null;
  email: string | null;
  address: AddressRecord | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR").replace(/[^a-z0-9]+/g, " ").trim();
}

function addressRecord(value: AddressRecord | null | undefined) {
  return value && typeof value === "object" ? value : {};
}

function mobileStatus(value: string): MobileQuote["status"] {
  if (value === "accepted") return "Validé";
  if (value === "rejected") return "Refusé";
  return "En attente";
}

export function assertQuoteBelongsToRecipient(recipient: string, emails: unknown) {
  const expected = recipient.trim().toLowerCase();
  if (!isEmail(expected)) throw new ApiInputError("Adresse du destinataire invalide.");
  const available = Array.isArray(emails)
    ? emails.map((value) => clean(value).toLowerCase()).filter(isEmail)
    : [];
  if (!available.includes(expected)) {
    throw new ApiInputError("Ce devis n’appartient pas au destinataire de cet e-mail.", 403);
  }
}

export function suggestedVoiceQuoteId({
  subject,
  body,
  quotes,
}: {
  subject: string;
  body: string;
  quotes: VoiceEmailQuoteChoice[];
}) {
  if (!quotes.length) return null;
  const message = normalize(`${subject} ${body}`);

  const numbered = quotes.filter((quote) => {
    const number = normalize(quote.number);
    return Boolean(number && message.includes(number));
  });
  if (numbered.length === 1) return numbered[0].id;

  if (!/\b(devis|proposition commerciale|offre de prix|estimation)\b/.test(message)) return null;
  const sameBatch = quotes.filter((quote) => quote.sameBatch);
  return sameBatch.length === 1 ? sameBatch[0].id : null;
}

export async function buildVoiceEmailQuoteAttachment({
  quote,
  customer,
  organization,
  companyProfile,
  recipient,
}: {
  quote: VoiceQuoteRecord;
  customer: VoiceQuoteCustomerRecord;
  organization: VoiceQuoteOrganizationRecord;
  companyProfile?: unknown;
  recipient: string;
}) {
  assertQuoteBelongsToRecipient(recipient, customer.emails);

  const customerAddress = addressRecord(Array.isArray(customer.addresses) ? customer.addresses[0] : null);
  const customerName = customer.kind === "business"
    ? clean(customer.company_name) || "Entreprise sans nom"
    : [customer.civility, customer.last_name, customer.first_name].map(clean).filter(Boolean).join(" ") || "Client sans nom";

  const mobileCustomer: MobileCustomer = {
    id: quote.customer_id,
    kind: customer.kind === "business" ? "Professionnel" : "Particulier",
    companyName: clean(customer.company_name),
    civility: clean(customer.civility),
    lastName: clean(customer.last_name),
    firstName: clean(customer.first_name),
    emails: Array.isArray(customer.emails) ? customer.emails.map(clean).filter(Boolean) : [],
    phones: Array.isArray(customer.phones) ? customer.phones.map(clean).filter(Boolean) : [],
    address: clean(customerAddress.line1),
    postalCode: clean(customerAddress.postal_code ?? customerAddress.postalCode),
    city: clean(customerAddress.city),
    siret: clean(customer.siret),
    vat: clean(customer.vat_number),
    notes: clean(customer.notes),
  };

  const items: LineItem[] = [...(quote.items ?? [])]
    .sort((left, right) => Number(left.position ?? 0) - Number(right.position ?? 0))
    .map((item, index) => ({
      id: clean(item.id) || `quote-line-${index}`,
      label: clean(item.label) || "Prestation",
      description: clean(item.description),
      quantity: numberOrNull(item.quantity),
      unit: clean(item.unit) || null,
      unitPrice: numberOrNull(item.unit_price),
      taxRate: numberOrNull(item.tax_rate),
    }));

  const mobileQuote: MobileQuote = {
    id: quote.id,
    number: clean(quote.number),
    customerId: quote.customer_id,
    customerName,
    title: clean(quote.title) || "Travaux",
    issueDate: clean(quote.issue_date),
    expiryDate: clean(quote.expiry_date),
    status: mobileStatus(clean(quote.status)),
    items,
    notes: clean(quote.notes),
    subtotal: numberOrNull(quote.subtotal) ?? 0,
    taxTotal: numberOrNull(quote.tax_total) ?? 0,
    total: numberOrNull(quote.total) ?? 0,
  };

  const organizationAddress = addressRecord(organization.address);
  const profile = normalizeCompanyProfile(companyProfile);
  const blob = await buildBusinessDocumentPdf({
    document: mobileQuote,
    customer: mobileCustomer,
    company: {
      displayName: clean(organization.name),
      legalName: clean(organization.name),
      siret: clean(organization.siret),
      vat: clean(organization.vat_number),
      address: clean(organizationAddress.line1),
      postalCode: clean(organizationAddress.postal_code ?? organizationAddress.postalCode),
      city: clean(organizationAddress.city),
      phone: clean(organization.phone),
      email: clean(organization.email),
    },
    profile,
  });

  const bytes = Buffer.from(await blob.arrayBuffer());
  if (bytes.length > 7_500_000) throw new ApiInputError("Le PDF du devis est trop volumineux pour être envoyé.", 413);
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("Le PDF du devis n’a pas pu être généré.");
  const filename = documentFileName(mobileQuote).replace(/[\\/:*?"<>|]/g, "-").slice(0, 120);
  return {
    quoteId: quote.id,
    filename,
    content: bytes.toString("base64"),
  };
}
