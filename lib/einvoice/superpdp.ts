export const SUPERPDP_DEFAULT_BASE_URL = "https://api.superpdp.tech";

export type SuperPdpTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

export type SuperPdpConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
};

export function superPdpConfiguration(env: NodeJS.ProcessEnv = process.env) {
  const clientId = env.SUPERPDP_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.SUPERPDP_CLIENT_SECRET?.trim() ?? "";
  const baseUrl = (env.SUPERPDP_API_BASE_URL?.trim() || SUPERPDP_DEFAULT_BASE_URL).replace(/\/$/, "");
  return {
    configured: Boolean(clientId && clientSecret),
    config: { baseUrl, clientId, clientSecret } satisfies SuperPdpConfig,
  };
}

export function extractFrenchSiren(siret: string | null | undefined) {
  const digits = String(siret ?? "").replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(0, 9) : "";
}

export function buildSuperPdpAuthorizationUrl({
  config,
  redirectUri,
  state,
  loginHint,
  siren,
}: {
  config: SuperPdpConfig;
  redirectUri: string;
  state: string;
  loginHint?: string;
  siren?: string;
}) {
  const url = new URL("/oauth2/authorize", config.baseUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  if (loginHint?.trim()) url.searchParams.set("login_hint", loginHint.trim());
  if (siren?.trim()) {
    url.searchParams.set("superpdp_company_number", siren.trim());
    url.searchParams.set("superpdp_company_number_scheme", "fr_siren");
  }
  return url.toString();
}

async function readProviderResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("json")
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => "");
  if (!response.ok) {
    const providerMessage = payload && typeof payload === "object"
      ? String((payload as Record<string, unknown>).detail ?? (payload as Record<string, unknown>).message ?? "")
      : "";
    throw new Error(`SUPER PDP API ${response.status}${providerMessage ? ` : ${providerMessage.slice(0, 220)}` : ""}`);
  }
  return payload;
}

function basicAuthorization(config: SuperPdpConfig) {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`;
}

async function tokenRequest(config: SuperPdpConfig, body: URLSearchParams) {
  const response = await fetch(`${config.baseUrl}/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: basicAuthorization(config),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const payload = await readProviderResponse(response);
  if (!payload || typeof payload !== "object" || typeof (payload as Record<string, unknown>).access_token !== "string") {
    throw new Error("Réponse OAuth SUPER PDP invalide.");
  }
  return payload as SuperPdpTokenResponse;
}

export function exchangeSuperPdpAuthorizationCode(
  config: SuperPdpConfig,
  code: string,
  redirectUri: string,
) {
  return tokenRequest(config, new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  }));
}

export function refreshSuperPdpAccessToken(config: SuperPdpConfig, refreshToken: string) {
  return tokenRequest(config, new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  }));
}

export async function superPdpApi<T = unknown>(
  config: SuperPdpConfig,
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(25_000),
    cache: "no-store",
  });
  return await readProviderResponse(response) as T;
}

export function getSuperPdpCurrentCompany(config: SuperPdpConfig, accessToken: string) {
  return superPdpApi<Record<string, unknown>>(config, accessToken, "/v1.beta/companies/me");
}

export function getSuperPdpCurrentSession(config: SuperPdpConfig, accessToken: string) {
  return superPdpApi<Record<string, unknown>>(config, accessToken, "/v1.beta/oauth2_sessions/me");
}

export function listSuperPdpInvoices(
  config: SuperPdpConfig,
  accessToken: string,
  options: { direction?: "in" | "out"; limit?: number; date?: string } = {},
) {
  const params = new URLSearchParams();
  params.set("direction", options.direction ?? "in");
  params.set("order", "desc");
  params.set("limit", String(Math.max(1, Math.min(options.limit ?? 100, 1000))));
  if (options.date) params.set("date", options.date);
  return superPdpApi<Record<string, unknown>>(
    config,
    accessToken,
    `/v1.beta/invoices?${params.toString()}`,
  );
}

export function sendSuperPdpInvoice(
  config: SuperPdpConfig,
  accessToken: string,
  input: { externalId: string; content: Blob; contentType: "application/pdf" | "application/xml" | "text/xml" },
) {
  const params = new URLSearchParams({ external_id: input.externalId });
  return superPdpApi<Record<string, unknown>>(
    config,
    accessToken,
    `/v1.beta/invoices?${params.toString()}`,
    {
      method: "POST",
      headers: { "Content-Type": input.contentType },
      body: input.content,
    },
  );
}
