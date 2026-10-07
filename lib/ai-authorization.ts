import { ApiInputError } from "./api-guard";
import { authenticateRequest } from "./server-auth";
import { createServiceSupabase } from "./server-organization";

/** Verify the user before parsing uploads or spending provider credits. */
export async function authorizeAiRequest(request: Request, financial = true) {
  const context = await authenticateRequest(request);
  const allowed = financial ? ["owner", "admin", "office", "manager"] : ["owner", "admin", "office", "manager", "accountant", "worker"];
  const requestedOrganization = request.headers.get("x-manufeo-organization");
  const membership = context.memberships.find(member =>
    (!requestedOrganization || member.organizationId === requestedOrganization) && allowed.includes(member.role));
  if (!membership) throw new ApiInputError("Vous n’avez pas les droits nécessaires dans cette entreprise.", 403);
  await consumeAiQuota(context.user.id, membership.organizationId);
  return context;
}

/** Shared atomic quotas survive serverless instances and IP/header changes. */
export async function consumeAiQuota(userId: string, organizationId: string) {
  const admin = createServiceSupabase();
  const { data, error } = await admin.rpc("manufeo_consume_ai_quota", { p_user_id: userId, p_organization_id: organizationId });
  if (error) throw new ApiInputError("Le service IA est momentanément indisponible.", 503);
  if (data !== true) throw new ApiInputError("La limite de demandes IA est atteinte. Réessayez plus tard.", 429);
}
