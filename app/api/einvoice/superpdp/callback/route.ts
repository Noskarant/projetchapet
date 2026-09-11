import { NextResponse } from "next/server";
import { ApiInputError } from "@/lib/api-guard";
import { verifyEInvoiceOAuthState } from "@/lib/einvoice/crypto";
import {
  eInvoiceEncryptionSecret,
  saveEInvoiceProviderConnection,
  verifyEInvoiceCallbackMembership,
} from "@/lib/einvoice/server";
import {
  exchangeSuperPdpAuthorizationCode,
  getSuperPdpCurrentCompany,
  getSuperPdpCurrentSession,
  superPdpConfiguration,
} from "@/lib/einvoice/superpdp";

export const runtime = "nodejs";

function appRedirect(request: Request, result: "connected" | "error") {
  const url = new URL("/", request.url);
  url.searchParams.set("einvoice", result);
  url.searchParams.set("provider", "superpdp");
  return NextResponse.redirect(url, 303);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("error")) {
      return appRedirect(request, "error");
    }

    const code = url.searchParams.get("code")?.trim() ?? "";
    const stateValue = url.searchParams.get("state")?.trim() ?? "";
    if (!code || code.length > 4_000 || !stateValue || stateValue.length > 12_000) {
      throw new ApiInputError("Réponse OAuth incomplète.");
    }

    const state = verifyEInvoiceOAuthState(stateValue, eInvoiceEncryptionSecret());
    await verifyEInvoiceCallbackMembership(state.userId, state.organizationId);

    const { configured, config } = superPdpConfiguration();
    if (!configured) throw new ApiInputError("SUPER PDP n’est pas configuré.", 503);

    const tokens = await exchangeSuperPdpAuthorizationCode(config, code, state.redirectUri);
    const [company, session] = await Promise.all([
      getSuperPdpCurrentCompany(config, tokens.access_token),
      getSuperPdpCurrentSession(config, tokens.access_token),
    ]);
    await saveEInvoiceProviderConnection({
      organizationId: state.organizationId,
      tokens,
      company,
      session,
    });

    return appRedirect(request, "connected");
  } catch {
    return appRedirect(request, "error");
  }
}
