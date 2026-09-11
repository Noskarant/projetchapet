import { NextResponse } from "next/server";
import {
  ApiInputError,
  errorResponse,
  rateLimit,
  readJsonBody,
  requireString,
} from "@/lib/api-guard";
import { generateManufeoCii } from "@/lib/einvoice/manufeo-en16931";
import {
  eInvoiceServiceSupabase,
  getEInvoicePilotSnapshot,
  getValidSuperPdpAccessToken,
  requireEInvoiceOrganizationAccess,
} from "@/lib/einvoice/server";
import {
  sendSuperPdpInvoice,
  superPdpConfiguration,
} from "@/lib/einvoice/superpdp";
import { normalizePilotSnapshot } from "@/lib/pilot-cloud-workspace";

export const runtime = "nodejs";

type TransmitBody = {
  organizationId?: unknown;
  invoiceNumber?: unknown;
};

function textField(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return "";
}

function providerStatus(source: Record<string, unknown>) {
  const direct = textField(source, "status", "state", "lifecycle_status");
  if (direct) return direct.slice(0, 120);
  const events = Array.isArray(source.events) ? source.events : [];
  const last = events.at(-1);
  if (last && typeof last === "object") {
    const event = textField(last as Record<string, unknown>, "status", "state", "type", "code");
    if (event) return event.slice(0, 120);
  }
  return "submitted";
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "einvoice-superpdp-transmit", 8);
  if (limited) return limited;

  try {
    const body = await readJsonBody<TransmitBody>(request, 16_000);
    const organizationId = typeof body.organizationId === "string" && body.organizationId.trim()
      ? body.organizationId.trim()
      : undefined;
    const invoiceNumber = requireString(body.invoiceNumber, "Numéro de facture", 120);
    const access = await requireEInvoiceOrganizationAccess(
      request,
      organizationId,
      ["owner", "admin", "office", "manager", "accountant"],
    );

    const { configured, config } = superPdpConfiguration();
    if (!configured) throw new ApiInputError("SUPER PDP n’est pas configuré sur le serveur.", 503);

    const snapshot = await getEInvoicePilotSnapshot(access.organizationId);
    const normalized = normalizePilotSnapshot(snapshot.workspace, snapshot.companyProfile);
    const invoice = normalized.workspace.invoices.find((item) => item.number === invoiceNumber);
    if (!invoice) {
      throw new ApiInputError("Cette facture n’est pas encore synchronisée avec le cloud MANUFEO. Réessayez dans quelques secondes.", 409);
    }
    if (invoice.status === "Brouillon") {
      throw new ApiInputError("Passez la facture hors brouillon avant sa transmission réglementaire.");
    }
    const customer = normalized.workspace.customers.find((item) => item.id === invoice.customerId);
    if (!customer) throw new ApiInputError("Le client lié à cette facture est introuvable.");

    const generated = generateManufeoCii({
      company: normalized.companyProfile,
      customer,
      invoice,
    });
    const token = await getValidSuperPdpAccessToken(access.organizationId);
    const externalId = invoice.number;
    const response = await sendSuperPdpInvoice(config, token, {
      externalId,
      content: new Blob([generated.xml], { type: "application/xml" }),
      contentType: "application/xml",
    });

    const providerInvoiceId = textField(response, "id", "invoice_id", "document_id");
    const status = providerStatus(response);
    const service = eInvoiceServiceSupabase();
    const { error: storeError } = await service.from("einvoice_transmissions").upsert({
      organization_id: access.organizationId,
      local_invoice_id: invoice.id,
      invoice_number: invoice.number,
      provider: "superpdp",
      provider_invoice_id: providerInvoiceId || null,
      external_id: externalId,
      direction: "out",
      status,
      submitted_at: new Date().toISOString(),
      last_synced_at: new Date().toISOString(),
    }, { onConflict: "organization_id,local_invoice_id" });
    if (storeError) throw new Error("La facture a été transmise mais son accusé n’a pas pu être journalisé.");

    return NextResponse.json({
      transmitted: true,
      provider: "superpdp",
      invoiceNumber: invoice.number,
      providerInvoiceId: providerInvoiceId || null,
      status,
      format: "CII",
      profile: "EN16931",
      validation: generated.validation,
    });
  } catch (error) {
    return errorResponse(error, "Transmission réglementaire impossible.");
  }
}
