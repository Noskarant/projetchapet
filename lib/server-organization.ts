import { createClient } from "@supabase/supabase-js";
import type { OrganizationRole } from "./pilot-operations";
import { isOrganizationRole } from "./pilot-operations";

export class OrganizationAuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "OrganizationAuthError";
    this.status = status;
  }
}

export function createServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new OrganizationAuthError("Service serveur indisponible.", 503);
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1] || match[1].length > 8000) throw new OrganizationAuthError("Authentification requise.", 401);
  return match[1];
}

export async function requireOrganization(request: Request) {
  const admin = createServiceSupabase();
  const token = bearerToken(request);
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) throw new OrganizationAuthError("Session expirée.", 401);

  const { data: membership, error: membershipError } = await admin
    .from("organization_members")
    .select("organization_id, role, created_at")
    .eq("user_id", authData.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) throw new OrganizationAuthError("Impossible de vérifier l’entreprise.", 503);
  if (!membership?.organization_id || !isOrganizationRole(membership.role)) {
    throw new OrganizationAuthError("Aucune entreprise MANUFEO accessible.", 403);
  }

  return {
    admin,
    user: authData.user,
    organizationId: String(membership.organization_id),
    role: membership.role as OrganizationRole,
  };
}

export function requireRole(role: OrganizationRole, allowed: OrganizationRole[]) {
  if (!allowed.includes(role)) throw new OrganizationAuthError("Droits insuffisants pour cette action.", 403);
}

export function organizationErrorResponse(error: unknown) {
  const status = error instanceof OrganizationAuthError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Erreur serveur.";
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function publicSiteUrl(request: Request) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  try {
    return new URL(request.url).origin;
  } catch {
    return "https://manufeo.fr";
  }
}
