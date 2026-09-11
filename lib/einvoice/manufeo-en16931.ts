import {
  generateCii,
  validateInput,
  type InvoiceInput,
  type InvoiceLine,
  type Party,
  type VatCategory,
} from "@attestwire/en16931";
import { ApiInputError } from "@/lib/api-guard";
import { normalizeCompanyProfile, type CompanyProfile } from "@/lib/company-profile";
import {
  customerDisplayName,
  type LineItem,
  type MobileCustomer,
  type MobileInvoice,
} from "@/lib/mobile-prototype";

export type ManufeoElectronicInvoice = {
  company: CompanyProfile;
  customer: MobileCustomer;
  invoice: MobileInvoice;
};

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function sirenFromSiret(value: string) {
  const normalized = digits(value);
  return normalized.length === 14 ? normalized.slice(0, 9) : "";
}

function requireSiret(value: string, label: string) {
  const normalized = digits(value);
  if (normalized.length !== 14) throw new ApiInputError(`${label} doit avoir un SIRET valide à 14 chiffres.`);
  return normalized;
}

function requireDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiInputError(`${label} est invalide.`);
  return value;
}

function unitCode(value: string | null) {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/\s/g, "");
  if (["h", "heure", "heures"].includes(normalized)) return "HUR";
  if (["m²", "m2", "m^2"].includes(normalized)) return "MTK";
  if (["m", "ml", "mètre", "metre", "mètres", "metres"].includes(normalized)) return "MTR";
  if (["kg", "kilogramme", "kilogrammes"].includes(normalized)) return "KGM";
  if (["l", "litre", "litres"].includes(normalized)) return "LTR";
  if (["jour", "jours", "j"].includes(normalized)) return "DAY";
  if (["forfait", "u", "unité", "unite", "pièce", "piece", "pcs"].includes(normalized)) return "C62";
  return "C62";
}

function vatTreatment(rate: number): { category: VatCategory; rate?: number } {
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) throw new ApiInputError("Taux de TVA invalide.");
  if (rate === 0) {
    throw new ApiInputError(
      "Une ligne à TVA 0 % doit préciser sa catégorie fiscale et son motif d’exonération avant transmission électronique.",
    );
  }
  return { category: "S", rate };
}

function normalizeLine(line: LineItem, index: number, creditNote: boolean): InvoiceLine {
  if (!line.label.trim()) throw new ApiInputError(`La ligne ${index + 1} n’a pas de désignation.`);
  if (line.quantity === null || !Number.isFinite(line.quantity) || line.quantity === 0) {
    throw new ApiInputError(`La quantité de la ligne ${index + 1} est invalide.`);
  }
  if (line.unitPrice === null || !Number.isFinite(line.unitPrice) || line.unitPrice < 0) {
    throw new ApiInputError(`Le prix unitaire de la ligne ${index + 1} est invalide.`);
  }
  if (line.taxRate === null) throw new ApiInputError(`Le taux de TVA de la ligne ${index + 1} est requis.`);
  const vat = vatTreatment(line.taxRate);
  return {
    id: String(index + 1),
    description: line.label.trim(),
    longDescription: line.description.trim() || undefined,
    quantity: creditNote ? Math.abs(line.quantity) : line.quantity,
    unitCode: unitCode(line.unit),
    unitPrice: line.unitPrice,
    vatCategory: vat.category,
    vatRate: vat.rate,
  };
}

function companyParty(profile: CompanyProfile): Party {
  const siret = requireSiret(profile.siret, "Le fournisseur");
  const siren = sirenFromSiret(siret);
  if (!profile.legalName.trim() && !profile.displayName.trim()) {
    throw new ApiInputError("La raison sociale de l’entreprise est requise.");
  }
  if (!profile.address || !profile.postalCode || !profile.city) {
    throw new ApiInputError("L’adresse complète de l’entreprise est requise.");
  }
  return {
    name: profile.legalName || profile.displayName,
    tradingName: profile.displayName && profile.displayName !== profile.legalName ? profile.displayName : undefined,
    vatId: profile.vatNumber || undefined,
    legalRegistrationId: siren,
    legalRegistrationSchemeId: "0002",
    address: {
      line1: profile.address,
      city: profile.city,
      postalCode: profile.postalCode,
      countryCode: "FR",
    },
    electronicAddress: profile.email
      ? { schemeId: "EM", value: profile.email }
      : { schemeId: "0225", value: siren },
    contact: profile.email || profile.phone
      ? { name: profile.displayName || profile.legalName, email: profile.email || undefined, phone: profile.phone || undefined }
      : undefined,
  };
}

function customerParty(customer: MobileCustomer): Party {
  if (customer.kind !== "Professionnel") {
    throw new ApiInputError("La transmission e-invoicing B2B nécessite un client professionnel. Les autres opérations relèvent du e-reporting.");
  }
  const siret = requireSiret(customer.siret, "Le client");
  const siren = sirenFromSiret(siret);
  if (!customer.address || !customer.postalCode || !customer.city) {
    throw new ApiInputError("L’adresse complète du client professionnel est requise.");
  }
  return {
    name: customerDisplayName(customer),
    vatId: customer.vat || undefined,
    legalRegistrationId: siren,
    legalRegistrationSchemeId: "0002",
    address: {
      line1: customer.address,
      city: customer.city,
      postalCode: customer.postalCode,
      countryCode: "FR",
    },
    electronicAddress: { schemeId: "0225", value: siren },
    contact: customer.emails.find(Boolean) || customer.phones.find(Boolean)
      ? {
          name: customerDisplayName(customer),
          email: customer.emails.find(Boolean) || undefined,
          phone: customer.phones.find(Boolean) || undefined,
        }
      : undefined,
  };
}

export function buildManufeoEn16931Input(raw: ManufeoElectronicInvoice): InvoiceInput {
  const company = normalizeCompanyProfile(raw.company);
  const invoice = raw.invoice;
  const creditNote = invoice.status === "Avoir" || /^A-/i.test(invoice.number);
  if (!invoice.number.trim()) throw new ApiInputError("Le numéro de facture est requis.");
  if (!invoice.items.length) throw new ApiInputError("La facture doit contenir au moins une ligne.");
  if (invoice.items.some((line) => line.incomplete || line.quantity === null || line.unitPrice === null || line.taxRate === null)) {
    throw new ApiInputError("Toutes les lignes doivent être complètes avant transmission électronique.");
  }

  const declared = {
    lineExtensionAmount: Math.abs(invoice.subtotal),
    taxAmount: Math.abs(invoice.taxTotal),
    taxExclusiveAmount: Math.abs(invoice.subtotal),
    taxInclusiveAmount: Math.abs(invoice.total),
    payableAmount: Math.max(0, Math.abs(invoice.total) - Math.abs(invoice.paidTotal || 0)),
  };

  return {
    profile: "en16931",
    invoiceNumber: invoice.number.trim(),
    issueDate: requireDate(invoice.issueDate, "La date d’émission"),
    dueDate: requireDate(invoice.dueDate, "La date d’échéance"),
    currency: "EUR",
    invoiceTypeCode: creditNote ? "381" : "380",
    note: invoice.notes.trim() || undefined,
    seller: companyParty(company),
    buyer: customerParty(raw.customer),
    lines: invoice.items.map((line, index) => normalizeLine(line, index, creditNote)),
    paymentTerms: `Paiement au plus tard le ${invoice.dueDate}`,
    paidAmount: creditNote ? 0 : Math.max(0, invoice.paidTotal || 0),
    declaredTotals: declared,
  };
}

export function generateManufeoCii(raw: ManufeoElectronicInvoice) {
  const input = buildManufeoEn16931Input(raw);
  const validation = validateInput(input);
  if (!validation.valid) {
    const errors = validation.errors.slice(0, 12).map((finding) => ({
      rule: finding.rule,
      field: finding.field,
      message: finding.message,
      fix: finding.fix,
    }));
    throw new ApiInputError(
      `Facture EN16931 invalide : ${errors.map((finding) => `${finding.rule} — ${finding.message}`).join(" | ")}`.slice(0, 1800),
    );
  }
  return {
    input,
    xml: generateCii(input),
    validation: {
      valid: validation.valid,
      warnings: validation.warnings.map((finding) => ({ rule: finding.rule, message: finding.message })),
      information: validation.information.map((finding) => ({ rule: finding.rule, message: finding.message })),
    },
  };
}
