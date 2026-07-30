import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, optionalString, rateLimit, readJsonBody } from "@/lib/api-guard";

function finiteNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "einvoice", 30);
  if (limited) return limited;

  try {
    const body = await readJsonBody<Record<string, unknown>>(request, 200_000);
    const invoice = body.invoice && typeof body.invoice === "object"
      ? body.invoice as Record<string, unknown>
      : {};
    const customer = invoice.customer && typeof invoice.customer === "object"
      ? invoice.customer as Record<string, unknown>
      : {};
    const company = body.company && typeof body.company === "object"
      ? body.company as Record<string, unknown>
      : {};
    const rawItems = Array.isArray(invoice.items) ? invoice.items : [];
    if (rawItems.length > 200) throw new ApiInputError("La facture contient trop de lignes.");

    const warnings: string[] = [];
    const companySiret = optionalString(company.siret, 20).replace(/\D/g, "");
    const customerSiret = optionalString(customer.siret, 20).replace(/\D/g, "");
    const customerKind = optionalString(customer.kind, 20);
    const invoiceNumber = optionalString(invoice.number, 80);
    const issueDate = optionalString(invoice.issue_date, 20);

    if (!companySiret) warnings.push("SIRET fournisseur manquant");
    if (!customerSiret && customerKind === "business") warnings.push("SIRET client manquant");
    if (!invoiceNumber) warnings.push("Numéro de facture manquant");
    if (!issueDate) warnings.push("Date d’émission manquante");
    if (!rawItems.length) warnings.push("Aucune ligne de facture");

    const payload = {
      profile: "FR-B2B-DRAFT",
      format_target: "Factur-X | UBL | CII",
      transmission_status: "not_transmitted",
      supplier: {
        name: optionalString(company.name, 180) || "CHAPET SAS",
        siret: companySiret,
        vat_number: optionalString(company.vat_number, 30),
        address: company.address && typeof company.address === "object" ? company.address : {},
      },
      customer: {
        name: optionalString(customer.company_name, 180)
          || [customer.civility, customer.last_name, customer.first_name]
            .map((value) => optionalString(value, 100))
            .filter(Boolean)
            .join(" "),
        kind: customerKind,
        siret: customerSiret,
        vat_number: optionalString(customer.vat_number, 30),
        addresses: Array.isArray(customer.addresses) ? customer.addresses.slice(0, 10) : [],
      },
      invoice: {
        number: invoiceNumber,
        issue_date: issueDate,
        due_date: optionalString(invoice.due_date, 20),
        operation_category: optionalString(body.operation_category, 40) || "service",
        vat_on_debits: Boolean(body.vat_on_debits),
        subtotal: finiteNumber(invoice.subtotal),
        tax_total: finiteNumber(invoice.tax_total),
        total: finiteNumber(invoice.total),
        items: rawItems.map((raw) => {
          const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
          return {
            label: optionalString(item.label, 240),
            description: optionalString(item.description, 800),
            quantity: finiteNumber(item.quantity),
            unit: optionalString(item.unit, 30) || "u",
            unit_price: finiteNumber(item.unit_price),
            tax_rate: finiteNumber(item.tax_rate),
            line_total: finiteNumber(item.total),
          };
        }),
      },
      warnings,
      compliance_note: "Préparation technique uniquement. La transmission réglementaire doit passer par une plateforme agréée et son API.",
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json({ ready: warnings.length === 0, payload, warnings });
  } catch (error) {
    return errorResponse(error, "Préparation impossible.");
  }
}
