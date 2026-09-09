import { getActiveOrganizationId } from "./project-chapet";
import { supabase } from "./supabase";
import type {
  ActivityEvent,
  CommercialCollaborator,
  CommercialDemoState,
  CommercialProject,
  CommercialProjectIssue,
  CommercialProjectPhoto,
  CommercialProjectStep,
} from "./mobile-commercial-demo";

export const COMMERCIAL_PHOTO_BUCKET = "commercial-project-photos";
export const COMMERCIAL_CLOUD_MIGRATION_KEY = "forgeo-commercial-cloud-migrated-v1";
export const COMMERCIAL_PULL_INTERVAL_MS = 5_000;
export const COMMERCIAL_FAILED_PUSH_RETRY_MS = 5_000;

export type CommercialCloudSnapshot = {
  organizationId: string;
  revision: number;
  state: CommercialDemoState;
};

type StoredProjectPhoto = CommercialProjectPhoto & { storagePath?: string };

type CollaboratorRow = {
  id: string;
  position: number;
  name: string;
  role: string;
  phone: string;
  initials: string;
  active: boolean;
};

type ProjectRow = {
  id: string;
  position: number;
  name: string;
  subtitle: string;
  customer_id: string;
  quote_id: string | null;
  invoice_id: string | null;
  address: string;
  status: CommercialProject["status"];
  start_date: string | null;
  next_visit: string | null;
};

type ProjectMemberRow = {
  project_id: string;
  collaborator_id: string;
  position: number;
};

type ProjectStepRow = {
  project_id: string;
  id: string;
  position: number;
  label: string;
  assignee_id: string | null;
  due_date: string | null;
  done: boolean;
};

type ProjectIssueRow = {
  project_id: string;
  id: string;
  position: number;
  title: string;
  detail: string;
  severity: CommercialProjectIssue["severity"];
  resolved: boolean;
  created_at: string;
};

type ProjectPhotoRow = {
  project_id: string;
  id: string;
  position: number;
  name: string;
  caption: string;
  storage_path: string | null;
  created_at: string;
};

type ActivityRow = {
  id: string;
  position: number;
  kind: ActivityEvent["kind"];
  message: string;
  document_number: string | null;
  project_id: string | null;
  created_at: string;
};

function stableObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((next, key) => {
      next[key] = stableObject(record[key]);
      return next;
    }, {});
}

function stableSignature(value: unknown) {
  return JSON.stringify(stableObject(value));
}

function photoStoragePath(photo: CommercialProjectPhoto) {
  return (photo as StoredProjectPhoto).storagePath;
}

function projectForCloudSignature(project: CommercialProject) {
  return {
    ...project,
    photos: project.photos.map((photo) => ({
      id: photo.id,
      name: photo.name,
      caption: photo.caption,
      createdAt: photo.createdAt,
      storagePath: photoStoragePath(photo) ?? null,
    })),
  };
}

export function commercialCloudSignature(state: CommercialDemoState) {
  return stableSignature({
    collaborators: state.collaborators,
    projects: state.projects.map(projectForCloudSignature),
    activity: state.activity,
  });
}

export function commercialStateToPayload(state: CommercialDemoState) {
  return {
    collaborators: state.collaborators.map((person) => ({ ...person })),
    projects: state.projects.map((project) => ({
      ...project,
      photos: project.photos.map((photo) => ({
        id: photo.id,
        name: photo.name,
        caption: photo.caption,
        createdAt: photo.createdAt,
        storagePath: photoStoragePath(photo) ?? null,
      })),
    })),
    activity: state.activity.map((event) => ({ ...event })),
  };
}

function mergeServerFirst<T extends { id: string }>(server: T[], local: T[]) {
  const serverIds = new Set(server.map((item) => item.id));
  return [...server, ...local.filter((item) => !serverIds.has(item.id))];
}

export function mergeInitialCommercialState(
  server: CommercialDemoState,
  local: CommercialDemoState,
): CommercialDemoState {
  return {
    company: local.company,
    filters: local.filters,
    collaborators: mergeServerFirst(server.collaborators, local.collaborators),
    projects: mergeServerFirst(server.projects, local.projects),
    activity: mergeServerFirst(server.activity, local.activity).slice(0, 80),
  };
}

function mergeConcurrentCollection<T extends { id: string }>(baseline: T[], local: T[], server: T[]) {
  const baselineMap = new Map(baseline.map((item) => [item.id, item]));
  const localMap = new Map(local.map((item) => [item.id, item]));
  const result = new Map(server.map((item) => [item.id, item]));

  for (const base of baseline) {
    const localItem = localMap.get(base.id);
    if (!localItem) {
      result.delete(base.id);
      continue;
    }
    if (stableSignature(localItem) !== stableSignature(base)) result.set(base.id, localItem);
  }

  for (const item of local) {
    if (!baselineMap.has(item.id)) result.set(item.id, item);
  }

  const ordered: T[] = [];
  const seen = new Set<string>();
  for (const item of local) {
    const resolved = result.get(item.id);
    if (resolved && !seen.has(item.id)) {
      ordered.push(resolved);
      seen.add(item.id);
    }
  }
  for (const item of server) {
    const resolved = result.get(item.id);
    if (resolved && !seen.has(item.id)) {
      ordered.push(resolved);
      seen.add(item.id);
    }
  }
  return ordered;
}

export function mergeConcurrentCommercialState(
  baseline: CommercialDemoState,
  local: CommercialDemoState,
  server: CommercialDemoState,
): CommercialDemoState {
  return {
    company: local.company,
    filters: local.filters,
    collaborators: mergeConcurrentCollection(baseline.collaborators, local.collaborators, server.collaborators),
    projects: mergeConcurrentCollection(baseline.projects, local.projects, server.projects),
    activity: mergeConcurrentCollection(baseline.activity, local.activity, server.activity).slice(0, 80),
  };
}

function localPhotoFallback(state: CommercialDemoState, projectId: string, photoId: string) {
  return state.projects
    .find((project) => project.id === projectId)
    ?.photos.find((photo) => photo.id === photoId)?.dataUrl;
}

export async function fetchCommercialCloudState(localState: CommercialDemoState): Promise<CommercialCloudSnapshot> {
  const organizationId = await getActiveOrganizationId();
  const [
    metaResult,
    collaboratorsResult,
    projectsResult,
    membersResult,
    stepsResult,
    issuesResult,
    photosResult,
    activityResult,
  ] = await Promise.all([
    supabase.from("commercial_workspace_meta").select("revision").eq("organization_id", organizationId).maybeSingle(),
    supabase.from("commercial_collaborators").select("id,position,name,role,phone,initials,active").eq("organization_id", organizationId).order("position"),
    supabase.from("commercial_projects").select("id,position,name,subtitle,customer_id,quote_id,invoice_id,address,status,start_date,next_visit").eq("organization_id", organizationId).order("position"),
    supabase.from("commercial_project_members").select("project_id,collaborator_id,position").eq("organization_id", organizationId).order("position"),
    supabase.from("commercial_project_steps").select("project_id,id,position,label,assignee_id,due_date,done").eq("organization_id", organizationId).order("position"),
    supabase.from("commercial_project_issues").select("project_id,id,position,title,detail,severity,resolved,created_at").eq("organization_id", organizationId).order("position"),
    supabase.from("commercial_project_photos").select("project_id,id,position,name,caption,storage_path,created_at").eq("organization_id", organizationId).order("position"),
    supabase.from("commercial_activity_events").select("id,position,kind,message,document_number,project_id,created_at").eq("organization_id", organizationId).order("position").limit(80),
  ]);

  const error =
    metaResult.error ||
    collaboratorsResult.error ||
    projectsResult.error ||
    membersResult.error ||
    stepsResult.error ||
    issuesResult.error ||
    photosResult.error ||
    activityResult.error;
  if (error) throw error;

  const collaborators = (collaboratorsResult.data ?? []) as CollaboratorRow[];
  const projectRows = (projectsResult.data ?? []) as ProjectRow[];
  const memberRows = (membersResult.data ?? []) as ProjectMemberRow[];
  const stepRows = (stepsResult.data ?? []) as ProjectStepRow[];
  const issueRows = (issuesResult.data ?? []) as ProjectIssueRow[];
  const photoRows = (photosResult.data ?? []) as ProjectPhotoRow[];
  const activityRows = (activityResult.data ?? []) as ActivityRow[];

  const storagePaths = photoRows.flatMap((photo) => photo.storage_path ? [photo.storage_path] : []);
  const signedUrls = new Map<string, string>();
  if (storagePaths.length) {
    const { data, error: signedError } = await supabase.storage
      .from(COMMERCIAL_PHOTO_BUCKET)
      .createSignedUrls(storagePaths, 86_400);
    if (!signedError) {
      (data ?? []).forEach((item) => {
        if (item.path && item.signedUrl) signedUrls.set(item.path, item.signedUrl);
      });
    }
  }

  const projects: CommercialProject[] = projectRows.map((row) => {
    const steps: CommercialProjectStep[] = stepRows
      .filter((step) => step.project_id === row.id)
      .map((step) => ({
        id: step.id,
        label: step.label,
        assigneeId: step.assignee_id ?? "",
        dueDate: step.due_date ?? "",
        done: step.done,
      }));
    const issues: CommercialProjectIssue[] = issueRows
      .filter((issue) => issue.project_id === row.id)
      .map((issue) => ({
        id: issue.id,
        title: issue.title,
        detail: issue.detail,
        severity: issue.severity,
        resolved: issue.resolved,
        createdAt: issue.created_at,
      }));
    const photos: StoredProjectPhoto[] = photoRows
      .filter((photo) => photo.project_id === row.id)
      .map((photo) => ({
        id: photo.id,
        name: photo.name,
        caption: photo.caption,
        createdAt: photo.created_at,
        storagePath: photo.storage_path ?? undefined,
        dataUrl: photo.storage_path
          ? signedUrls.get(photo.storage_path) ?? localPhotoFallback(localState, row.id, photo.id)
          : localPhotoFallback(localState, row.id, photo.id),
      }));

    return {
      id: row.id,
      name: row.name,
      subtitle: row.subtitle,
      customerId: row.customer_id,
      quoteId: row.quote_id ?? undefined,
      invoiceId: row.invoice_id ?? undefined,
      address: row.address,
      status: row.status,
      startDate: row.start_date ?? "",
      nextVisit: row.next_visit ?? "",
      teamIds: memberRows.filter((member) => member.project_id === row.id).map((member) => member.collaborator_id),
      steps,
      issues,
      photos,
    };
  });

  const state: CommercialDemoState = {
    company: localState.company,
    filters: localState.filters,
    collaborators: collaborators.map((person) => ({
      id: person.id,
      name: person.name,
      role: person.role,
      phone: person.phone,
      initials: person.initials,
      active: person.active,
    } satisfies CommercialCollaborator)),
    projects,
    activity: activityRows.map((event) => ({
      id: event.id,
      kind: event.kind,
      message: event.message,
      createdAt: event.created_at,
      documentNumber: event.document_number ?? undefined,
      projectId: event.project_id ?? undefined,
    })),
  };

  return {
    organizationId,
    revision: Number(metaResult.data?.revision ?? 0),
    state,
  };
}

function safePathSegment(value: string) {
  const clean = value.trim().replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
  return clean.slice(0, 120) || "item";
}

export function commercialPhotoPath(
  organizationId: string,
  projectId: string,
  photoId: string,
  mimeType: string,
) {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return `${organizationId}/${safePathSegment(projectId)}/${safePathSegment(photoId)}.${extension}`;
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("La photo locale ne peut pas être préparée pour le cloud.");
  const blob = await response.blob();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(blob.type)) {
    throw new Error("Format de photo non pris en charge.");
  }
  if (blob.size > 5 * 1024 * 1024) throw new Error("La photo dépasse la limite de 5 Mo.");
  return blob;
}

async function preparePhotosForCloud(state: CommercialDemoState, organizationId: string) {
  const projects: CommercialProject[] = [];
  for (const project of state.projects) {
    const photos: StoredProjectPhoto[] = [];
    for (const originalPhoto of project.photos) {
      const photo = originalPhoto as StoredProjectPhoto;
      if (!photo.dataUrl?.startsWith("data:image/")) {
        photos.push({ ...photo });
        continue;
      }

      const blob = await dataUrlToBlob(photo.dataUrl);
      const path = photo.storagePath ?? commercialPhotoPath(organizationId, project.id, photo.id, blob.type);
      const { error: uploadError } = await supabase.storage
        .from(COMMERCIAL_PHOTO_BUCKET)
        .upload(path, blob, { upsert: true, contentType: blob.type, cacheControl: "3600" });
      if (uploadError) throw uploadError;

      const { data: signed, error: signedError } = await supabase.storage
        .from(COMMERCIAL_PHOTO_BUCKET)
        .createSignedUrl(path, 86_400);
      if (signedError) throw signedError;

      photos.push({ ...photo, storagePath: path, dataUrl: signed.signedUrl });
    }
    projects.push({ ...project, photos });
  }
  return { ...state, projects };
}

export function isCommercialCloudConflict(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "40001");
}

export async function saveCommercialCloudState(
  state: CommercialDemoState,
  expectedRevision: number,
): Promise<CommercialCloudSnapshot> {
  const organizationId = await getActiveOrganizationId();
  const prepared = await preparePhotosForCloud(state, organizationId);
  const { data, error } = await supabase.rpc("replace_commercial_workspace", {
    p_state: commercialStateToPayload(prepared),
    p_expected_revision: expectedRevision,
  });
  if (error) throw error;
  return { organizationId, revision: Number(data), state: prepared };
}
