import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { ApiInputError } from "@/lib/api-guard";

export type OrganizationMembership = {
  organizationId: string;
  role: string;
};

export type AuthenticatedRequestContext = {
  user: User;
  client: SupabaseClient;
  memberships: OrganizationMembership[];
};

export function bearerToken(request: Request) {
  const header = request.headers.get("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match?.[1] || match[1].length > 8_000) {
    throw new ApiInputError("Authentification requise.", 401);
  }
  return match[1];
}

export function authenticatedSupabase(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new ApiInputError("Service d’authentification indisponible.", 503);

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function authenticateRequest(request: Request): Promise<AuthenticatedRequestContext> {
  const token = bearerToken(request);
  const client = authenticatedSupabase(token);
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new ApiInputError("Votre session a expiré. Reconnectez-vous.", 401);

  const { data: rows, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", data.user.id);
  if (membershipError) throw new Error("Vos entreprises sont momentanément inaccessibles.");

  return {
    user: data.user,
    client,
    memberships: (rows ?? []).map((row) => ({
      organizationId: String(row.organization_id),
      role: String(row.role ?? ""),
    })),
  };
}

export function requireOrganization(
  context: AuthenticatedRequestContext,
  organizationId: string,
  allowedRoles?: readonly string[],
) {
  const membership = context.memberships.find((item) => item.organizationId === organizationId);
  if (!membership) throw new ApiInputError("Entreprise non autorisée.", 403);
  if (allowedRoles?.length && !allowedRoles.includes(membership.role)) {
    throw new ApiInputError("Vous n’avez pas les droits nécessaires dans cette entreprise.", 403);
  }
  return membership;
}
