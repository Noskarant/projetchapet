import { OrganizationAuthError, type requireOrganization } from "./server-organization";
type Context = Awaited<ReturnType<typeof requireOrganization>>;
export async function assignedProjectIds(context: Context): Promise<string[]> {
  const { data, error } = await context.admin.from("artisan_workflow_records")
    .select("id,payload").eq("organization_id", context.organizationId).eq("kind", "collaborator_contact");
  if (error) throw new OrganizationAuthError("Affectations indisponibles.", 503);
  const email = context.user.email?.trim().toLowerCase();
  const ids = email ? (data ?? []).filter(row => String(row.payload.email || "").trim().toLowerCase() === email).map(row => row.id) : [];
  if (!ids.length) return [];
  const links = await context.admin.from("commercial_project_members").select("project_id")
    .eq("organization_id", context.organizationId).in("collaborator_id", ids);
  if (links.error) throw new OrganizationAuthError("Affectations indisponibles.", 503);
  return [...new Set((links.data ?? []).map(row => String(row.project_id)))];
}
export async function assertProjectAccess(context: Context, projectId: string) {
  if (["owner", "admin", "office", "manager"].includes(context.role)) return;
  if (context.role === "worker" && (await assignedProjectIds(context)).includes(projectId)) return;
  throw new OrganizationAuthError("Ce chantier ne vous est pas accessible.", 403);
}
