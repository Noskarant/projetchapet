import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit } from "@/lib/api-guard";
import {
  getValidSuperPdpAccessToken,
  requireEInvoiceOrganizationAccess,
} from "@/lib/einvoice/server";
import {
  listSuperPdpInvoices,
  superPdpConfiguration,
} from "@/lib/einvoice/superpdp";

export const runtime = "nodejs";

function providerConfig() {
  const { configured, config } = superPdpConfiguration();
  if (!configured) throw new ApiInputError("SUPER PDP n’est pas configuré sur le serveur.", 503);
  return config;
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "einvoice-superpdp-list", 30);
  if (limited) return limited;

  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId")?.trim() || undefined;
    const access = await requireEInvoiceOrganizationAccess(request, organizationId);
    const direction = url.searchParams.get("direction") === "out" ? "out" : "in";
    const date = url.searchParams.get("date")?.trim() || undefined;
    const requestedLimit = Number(url.searchParams.get("limit") || 100);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 500)) : 100;
    const token = await getValidSuperPdpAccessToken(access.organizationId);
    const data = await listSuperPdpInvoices(providerConfig(), token, { direction, date, limit });
    return NextResponse.json({ provider: "superpdp", direction, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Lecture des factures électroniques impossible.");
  }
}
