import { createClient } from "@supabase/supabase-js";
import { ApiInputError } from "@/lib/api-guard";
import { openEInvoiceSecret, sealEInvoiceSecret } from "@/lib/einvoice/crypto";
import {
  refreshSuperPdpAccessToken,
  superPdpConfiguration,
  type SuperPdpTokenResponse,
} from "@/lib/einvoice/superpdp";

export type EInvoiceOrganizationAccess = {
  userId: string;
  organizationId: string;
  role: string;
  organization: {
    id: string;
    name: string;
    siret: string | null;
    email: string | null;
  };
};

export type EInvoiceProviderConnectionRow = {
  organization_id: string;
  provider: "superpdp";
  access_token_ciphertext: string;
  refresh_token_ciphertext: string | null;
  token_expires_at: string | null;
  provider_company_id: string | null;
  provider_company_number: string | null;
  provider_company_name: string | null;
  verification_status: string | null;
  connected_at: string;
  updated_at: string;
};

export function eInvoiceBearerToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1] || match[1].length > 8_000) {
    throw new ApiInputError("Authentification requise.", 401);
  }
  return match[1];
}

function publicSupabase(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ApiInputError("Service d’authentification indisponible.", 503);
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export function eInvoiceServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    throw new ApiInputError("Stockage sécurisé de facturation non configuré.", 503);
  }
  return createClient(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

export function eInvoiceEncryptionSecret() {
  const secret = process.env.EINVOICE_SECRET?.trim() ?? "";
  if (secret.length < 24) {
    throw new ApiInputError("Chiffrement de facturation non configuré.", 503);
  }
  return secret;
}

export async function requireEInvoiceOrganizationAccess(
  request: Request,
  requestedOrganizationId?: string,
  allowedRoles?: string[],
): Promise<EInvoiceOrganizationAccess> {
  const token = eInvoiceBearerToken(request);
  const client = publicSupabase(token);
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) {
    throw new ApiInputError("Votre session a expiré. Reconnectez-vous.", 401);
  }

  let membershipQuery = client
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", userData.user.id);
  if (requestedOrganizationId) membershipQuery = membershipQuery.eq("organization_id", requestedOrganizationId);
  const { data: memberships, error: membershipError } = await membershipQuery.limit(10);
  if (membershipError) throw new Error("Entreprise inaccessible.");
  const membership = memberships?.[0];
  if (!membership) throw new ApiInputError("Aucune entreprise autorisée.", 403);
  const role = String(membership.role ?? "");
  if (allowedRoles?.length && !allowedRoles.includes(role)) {
    throw new ApiInputError("Votre rôle ne permet pas cette opération de facturation électronique.", 403);
  }

  const organizationId = String(membership.organization_id);
  const { data: organization, error: organizationError } = await client
    .from("organizations")
    .select("id, name, siret, email")
    .eq("id", organizationId)
    .single();
  if (organizationError || !organization) throw new Error("Entreprise inaccessible.");

  return {
    userId: userData.user.id,
    organizationId,
    role,
    organization: {
      id: String(organization.id),
      name: String(organization.name ?? ""),
      siret: organization.siret ? String(organization.siret) : null,
      email: organization.email ? String(organization.email) : userData.user.email ?? null,
    },
  };
}

export async function verifyEInvoiceCallbackMembership(
  userId: string,
  organizationId: string,
) {
  const client = eInvoiceServiceSupabase();
  const { data, error } = await client
    .from("organization_members")
    .select("role")
    .eq("user_id", userId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error("Vérification de l’autorisation impossible.");
  const role = String(data?.role ?? "");
  if (!data || !["owner", "admin"].includes(role)) {
    throw new ApiInputError("Autorisation de connexion refusée.", 403);
  }
  return role;
}

export async function getEInvoicePilotSnapshot(organizationId: string) {
  const client = eInvoiceServiceSupabase();
  const { data, error } = await client
    .from("pilot_workspace_snapshots")
    .select("workspace, company_profile, updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error("Données de facturation MANUFEO inaccessibles.");
  if (!data) throw new ApiInputError("Synchronisez d’abord les données de l’entreprise avec le cloud MANUFEO.", 409);
  return {
    workspace: data.workspace,
    companyProfile: data.company_profile,
    updatedAt: data.updated_at ? String(data.updated_at) : "",
  };
}

export async function getEInvoiceProviderConnection(organizationId: string) {
  const client = eInvoiceServiceSupabase();
  const { data, error } = await client
    .from("einvoice_provider_connections")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("provider", "superpdp")
    .maybeSingle();
  if (error) throw new Error("Connexion de facturation inaccessible.");
  return data as EInvoiceProviderConnectionRow | null;
}

function stringField(source: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

export async function saveEInvoiceProviderConnection({
  organizationId,
  tokens,
  company,
  session,
}: {
  organizationId: string;
  tokens: SuperPdpTokenResponse;
  company: Record<string, unknown>;
  session: Record<string, unknown>;
}) {
  const secret = eInvoiceEncryptionSecret();
  const expiresIn = Number(tokens.expires_in ?? 3600);
  const expiresAt = Number.isFinite(expiresIn)
    ? new Date(Date.now() + Math.max(60, expiresIn) * 1000).toISOString()
    : null;
  const existing = await getEInvoiceProviderConnection(organizationId);
  const refreshCiphertext = tokens.refresh_token
    ? sealEInvoiceSecret(tokens.refresh_token, secret)
    : existing?.refresh_token_ciphertext ?? null;
  const verificationStatus = stringField(
    session,
    "company_verification_status",
    "status",
  );

  const client = eInvoiceServiceSupabase();
  const { error } = await client.from("einvoice_provider_connections").upsert({
    organization_id: organizationId,
    provider: "superpdp",
    access_token_ciphertext: sealEInvoiceSecret(tokens.access_token, secret),
    refresh_token_ciphertext: refreshCiphertext,
    token_expires_at: expiresAt,
    provider_company_id: stringField(company, "id", "company_id"),
    provider_company_number: stringField(company, "number", "company_number", "siren", "siret"),
    provider_company_name: stringField(company, "name", "company_name", "legal_name"),
    verification_status: verificationStatus,
    connected_at: existing?.connected_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id" });
  if (error) throw new Error("Impossible d’enregistrer la connexion SUPER PDP.");
}

export async function deleteEInvoiceProviderConnection(organizationId: string) {
  const client = eInvoiceServiceSupabase();
  const { error } = await client
    .from("einvoice_provider_connections")
    .delete()
    .eq("organization_id", organizationId)
    .eq("provider", "superpdp");
  if (error) throw new Error("Impossible de déconnecter SUPER PDP.");
}

export async function getValidSuperPdpAccessToken(organizationId: string) {
  const connection = await getEInvoiceProviderConnection(organizationId);
  if (!connection) throw new ApiInputError("SUPER PDP n’est pas connecté à cette entreprise.", 409);
  const secret = eInvoiceEncryptionSecret();
  const accessToken = openEInvoiceSecret(connection.access_token_ciphertext, secret);
  const expiresAt = connection.token_expires_at ? Date.parse(connection.token_expires_at) : Number.POSITIVE_INFINITY;
  if (expiresAt > Date.now() + 60_000) return accessToken;
  if (!connection.refresh_token_ciphertext) {
    throw new ApiInputError("La connexion SUPER PDP a expiré. Reconnectez l’entreprise.", 409);
  }

  const refreshToken = openEInvoiceSecret(connection.refresh_token_ciphertext, secret);
  const { configured, config } = superPdpConfiguration();
  if (!configured) throw new ApiInputError("SUPER PDP n’est pas configuré sur le serveur.", 503);
  const refreshed = await refreshSuperPdpAccessToken(config, refreshToken);
  await saveEInvoiceProviderConnection({
    organizationId,
    tokens: refreshed,
    company: {
      id: connection.provider_company_id,
      number: connection.provider_company_number,
      name: connection.provider_company_name,
    },
    session: { status: connection.verification_status },
  });
  return refreshed.access_token;
}
