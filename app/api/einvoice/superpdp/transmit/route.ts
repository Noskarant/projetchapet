import { transmitOrganizationInvoice } from "@/lib/einvoice/transmit-invoice";
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

    return NextResponse.json(await transmitOrganizationInvoice(access.organizationId, invoiceNumber));
  } catch (error) {
    return errorResponse(error, "Transmission réglementaire impossible.");
  }
}
