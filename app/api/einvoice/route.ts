import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, any>;
    const invoice = body.invoice ?? {};
    const customer = invoice.customer ?? {};
    const company = body.company ?? {};
    const warnings: string[] = [];

    if (!company.siret) warnings.push("SIRET fournisseur manquant");
    if (!customer.siret && customer.kind === "business") warnings.push("SIRET client manquant");
    if (!invoice.number) warnings.push("Numéro de facture manquant");
    if (!invoice.issue_date) warnings.push("Date d’émission manquante");
    if (!Array.isArray(invoice.items) || !invoice.items.length) warnings.push("Aucune ligne de facture");

    const payload = {
      profile: "FR-B2B-DRAFT",
      format_target: "Factur-X | UBL | CII",
      transmission_status: "not_transmitted",
      supplier: {
        name: company.name || "CHAPET SAS",
        siret: company.siret || "",
        vat_number: company.vat_number || "",
        address: company.address || {},
      },
      customer: {
        name: customer.company_name || [customer.civility, customer.last_name, customer.first_name].filter(Boolean).join(" "),
        kind: customer.kind,
        siret: customer.siret || "",
        vat_number: customer.vat_number || "",
        addresses: customer.addresses || [],
      },
      invoice: {
        number: invoice.number,
        issue_date: invoice.issue_date,
        due_date: invoice.due_date,
        operation_category: body.operation_category || "service",
        vat_on_debits: Boolean(body.vat_on_debits),
        subtotal: Number(invoice.subtotal || 0),
        tax_total: Number(invoice.tax_total || 0),
        total: Number(invoice.total || 0),
        items: (invoice.items || []).map((item: any) => ({
          label: item.label,
          description: item.description || "",
          quantity: Number(item.quantity || 0),
          unit: item.unit || "u",
          unit_price: Number(item.unit_price || 0),
          tax_rate: Number(item.tax_rate || 0),
          line_total: Number(item.total || 0),
        })),
      },
      warnings,
      compliance_note: "Préparation technique uniquement. La transmission réglementaire doit passer par une plateforme agréée et son API.",
      generated_at: new Date().toISOString(),
    };

    return NextResponse.json({ ready: warnings.length === 0, payload, warnings });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Préparation impossible." }, { status: 500 });
  }
}
