import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api-guard";
import {
  deleteEInvoiceProviderConnection,
  getEInvoiceProviderConnection,
  requireEInvoiceOrganizationAccess,
} from "@/lib/einvoice/server";
import { superPdpConfiguration } from "@/lib/einvoice/superpdp";

export const runtime = "nodejs";

function serverReady() {
  const provider = superPdpConfiguration();
  return provider.configured
    && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    && Boolean(process.env.EINVOICE_SECRET && process.env.EINVOICE_SECRET.trim().length >= 24);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId")?.trim() || undefined;
    const access = await requireEInvoiceOrganizationAccess(request, organizationId);
    const configured = serverReady();
    const connection = configured
      ? await getEInvoiceProviderConnection(access.organizationId)
      : null;

    return NextResponse.json({
      provider: "superpdp",
      providerLabel: "SUPER PDP",
      configured,
      connected: Boolean(connection),
      organizationId: access.organizationId,
      company: connection ? {
        id: connection.provider_company_id,
        number: connection.provider_company_number,
        name: connection.provider_company_name,
      } : null,
      verificationStatus: connection?.verification_status ?? null,
      connectedAt: connection?.connected_at ?? null,
      capabilities: [
        "Factur-X",
        "UBL",
        "CII",
        "réception",
        "émission",
        "cycle de vie",
        "e-reporting",
        "annuaire",
      ],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "État SUPER PDP indisponible.");
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organizationId")?.trim() || undefined;
    const access = await requireEInvoiceOrganizationAccess(
      request,
      organizationId,
      ["owner", "admin"],
    );
    await deleteEInvoiceProviderConnection(access.organizationId);
    return NextResponse.json({ disconnected: true });
  } catch (error) {
    return errorResponse(error, "Déconnexion SUPER PDP impossible.");
  }
}
