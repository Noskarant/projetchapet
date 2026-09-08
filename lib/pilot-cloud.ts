import { supabase } from "./supabase";
import {
  PILOT_SNAPSHOT_SCHEMA_VERSION,
  normalizePilotSnapshot,
  type PilotLocalSnapshot,
} from "./pilot-cloud-workspace";

export type PilotOrganization = {
  id: string;
  name: string;
  role: string;
};

export type PilotCloudSnapshot = PilotLocalSnapshot & {
  updatedAt: string;
};

function throwIfError(error: { message?: string } | null, fallback: string) {
  if (!error) return;
  throw new Error(error.message || fallback);
}

export async function ensurePilotOrganization(userId: string): Promise<PilotOrganization> {
  const ensured = await supabase.rpc("ensure_personal_organization");
  throwIfError(ensured.error, "Impossible d’ouvrir l’entreprise FORGEO.");
  const organizationId = String(ensured.data ?? "");
  if (!organizationId) throw new Error("Entreprise FORGEO introuvable.");

  const [organizationResult, membershipResult] = await Promise.all([
    supabase.from("organizations").select("id,name").eq("id", organizationId).single(),
    supabase
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  throwIfError(organizationResult.error, "Impossible de charger l’entreprise FORGEO.");
  throwIfError(membershipResult.error, "Impossible de vérifier l’accès à l’entreprise.");

  return {
    id: String(organizationResult.data?.id ?? organizationId),
    name: String(organizationResult.data?.name ?? "Mon entreprise"),
    role: String(membershipResult.data?.role ?? "member"),
  };
}

export async function loadPilotCloudSnapshot(organizationId: string): Promise<PilotCloudSnapshot | null> {
  const result = await supabase
    .from("pilot_workspace_snapshots")
    .select("workspace,company_profile,schema_version,updated_at")
    .eq("organization_id", organizationId)
    .maybeSingle();

  throwIfError(result.error, "Impossible de charger les données sécurisées FORGEO.");
  if (!result.data) return null;

  return {
    ...normalizePilotSnapshot(result.data.workspace, result.data.company_profile),
    updatedAt: String(result.data.updated_at ?? ""),
  };
}

export async function savePilotCloudSnapshot(
  organizationId: string,
  userId: string,
  snapshot: PilotLocalSnapshot,
) {
  const normalized = normalizePilotSnapshot(snapshot.workspace, snapshot.companyProfile);
  const result = await supabase
    .from("pilot_workspace_snapshots")
    .upsert({
      organization_id: organizationId,
      schema_version: PILOT_SNAPSHOT_SCHEMA_VERSION,
      workspace: normalized.workspace,
      company_profile: normalized.companyProfile,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id" })
    .select("updated_at")
    .single();

  throwIfError(result.error, "Impossible de sauvegarder les données sécurisées FORGEO.");
  return String(result.data?.updated_at ?? "");
}
