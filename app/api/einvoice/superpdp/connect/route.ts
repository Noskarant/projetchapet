import { NextResponse } from "next/server";
import { ApiInputError, errorResponse, rateLimit } from "@/lib/api-guard";
import { createEInvoiceOAuthState } from "@/lib/einvoice/crypto";
import {
  eInvoiceEncryptionSecret,
  requireEInvoiceOrganizationAccess,
} from "@/lib/einvoice/server";
import {
  buildSuperPdpAuthorizationUrl,
  superPdpConfiguration,
} from "@/lib/einvoice/superpdp";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(request, "einvoice-superpdp-connect", 8);
  if (limited) return limited;

  try {
    const url = new URL(request.url);
    const requestedOrganizationId = url.searchParams.get("organizationId")?.trim() || undefined;
    const access = await requireEInvoiceOrganizationAccess(
      request,
      requestedOrganizationId,
      ["owner", "admin"],
    );
    const { configured, config } = superPdpConfiguration();
    if (!configured) throw new ApiInputError("SUPER PDP n’est pas encore configuré sur le serveur.", 503);

    const redirectUri = process.env.SUPERPDP_REDIRECT_URI?.trim()
      || new URL("/api/einvoice/superpdp/callback", request.url).toString();
    const state = createEInvoiceOAuthState({
      organizationId: access.organizationId,
      userId: access.userId,
      expiresAt: Date.now() + 10 * 60_000,
      redirectUri,
    }, eInvoiceEncryptionSecret());

    // On ne préremplit pas le SIREN ici : en sandbox SUPER PDP utilise les
    // entreprises fictives Burger Queen / Tricatel. En production, l’utilisateur
    // choisira/vérifiera son entreprise dans l’écran OAuth/KYB SUPER PDP.
    const authorizationUrl = buildSuperPdpAuthorizationUrl({
      config,
      redirectUri,
      state,
      loginHint: access.organization.email ?? undefined,
    });

    return NextResponse.json({
      provider: "superpdp",
      organizationId: access.organizationId,
      authorizationUrl,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error, "Connexion SUPER PDP impossible.");
  }
}
