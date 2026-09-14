import { NextResponse } from "next/server";
import {
  MAX_ACTIVITY_BODY_LENGTH,
  PROJECT_ACTIVITY_BUCKET,
  canCompleteActivityTask,
  canManageActivityContent,
  normalizeActivityBody,
  normalizeActivityTags,
  normalizeMentionIds,
} from "@/lib/project-activity";
import {
  OrganizationAuthError,
  organizationErrorResponse,
  requireOrganization,
} from "@/lib/server-organization";

export const runtime = "nodejs";

const noteColumns = "id,project_id,body,created_by,created_at,updated_at,kind,status,due_at,pinned,mentions,tags,source,edited_at,completed_at,completed_by";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: unknown, label: string) {
  const id = String(value ?? "").trim();
  if (!uuidPattern.test(id)) throw new OrganizationAuthError(`${label} invalide.`, 400);
  return id;
}

function normalizeProjectId(value: unknown) {
  const projectId = String(value ?? "").trim();
  if (!projectId || projectId.length > 160) {
    throw new OrganizationAuthError("Chantier invalide.", 400);
  }
  return projectId;
}

function normalizeDueAt(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) throw new OrganizationAuthError("Échéance invalide.", 400);
  return date.toISOString();
}

async function validateMentions(
  context: Awaited<ReturnType<typeof requireOrganization>>,
  mentions: string[],
) {
  if (!mentions.length) return;
  const { data, error } = await context.admin
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", context.organizationId)
    .in("user_id", mentions);
  if (error) throw new OrganizationAuthError("Impossible de vérifier les mentions.", 503);
  const found = new Set((data ?? []).map((row) => String(row.user_id)));
  if (mentions.some((id) => !found.has(id))) {
    throw new OrganizationAuthError("Une personne mentionnée ne fait pas partie de l’entreprise.", 400);
  }
}

async function fetchItem(
  context: Awaited<ReturnType<typeof requireOrganization>>,
  id: string,
) {
  const { data, error } = await context.admin
    .from("project_notes")
    .select(noteColumns)
    .eq("organization_id", context.organizationId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new OrganizationAuthError("Impossible de charger l’élément.", 503);
  if (!data) throw new OrganizationAuthError("Élément introuvable.", 404);
  return data;
}

export async function GET(request: Request) {
  try {
    const context = await requireOrganization(request);
    const url = new URL(request.url);
    const requestedProject = url.searchParams.get("projectId");

    let query = context.admin
      .from("project_notes")
      .select(noteColumns)
      .eq("organization_id", context.organizationId)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(250);

    if (requestedProject) query = query.eq("project_id", normalizeProjectId(requestedProject));

    const { data: items, error } = await query;
    if (error) throw new OrganizationAuthError("Impossible de charger le journal chantier.", 503);

    const ids = (items ?? []).map((item) => String(item.id));
    if (!ids.length) {
      return NextResponse.json({ items: [] }, { headers: { "Cache-Control": "no-store" } });
    }

    const { data: attachmentRows, error: attachmentError } = await context.admin
      .from("project_note_attachments")
      .select("id,note_id,file_name,storage_path,mime_type,size_bytes,created_by,created_at")
      .eq("organization_id", context.organizationId)
      .in("note_id", ids)
      .order("created_at", { ascending: true });
    if (attachmentError) throw new OrganizationAuthError("Impossible de charger les pièces jointes.", 503);

    const paths = (attachmentRows ?? []).map((row) => String(row.storage_path));
    const signedByPath = new Map<string, string>();
    if (paths.length) {
      const { data: signed, error: signedError } = await context.admin.storage
        .from(PROJECT_ACTIVITY_BUCKET)
        .createSignedUrls(paths, 20 * 60);
      if (signedError) throw new OrganizationAuthError("Impossible d’ouvrir les pièces jointes.", 503);
      for (const entry of signed ?? []) {
        if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl);
      }
    }

    const attachmentsByNote = new Map<string, Array<Record<string, unknown>>>();
    for (const attachment of attachmentRows ?? []) {
      const noteId = String(attachment.note_id);
      const list = attachmentsByNote.get(noteId) ?? [];
      list.push({
        id: attachment.id,
        file_name: attachment.file_name,
        mime_type: attachment.mime_type,
        size_bytes: attachment.size_bytes,
        created_by: attachment.created_by,
        created_at: attachment.created_at,
        signed_url: signedByPath.get(String(attachment.storage_path)) ?? null,
      });
      attachmentsByNote.set(noteId, list);
    }

    return NextResponse.json({
      items: (items ?? []).map((item) => ({
        ...item,
        attachments: attachmentsByNote.get(String(item.id)) ?? [],
      })),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireOrganization(request);
    const input = await request.json() as Record<string, unknown>;
    const projectId = normalizeProjectId(input.projectId);
    const body = normalizeActivityBody(input.body);
    if (!body) {
      throw new OrganizationAuthError(`Le texte doit contenir entre 1 et ${MAX_ACTIVITY_BODY_LENGTH} caractères.`, 400);
    }

    const kind = input.kind === "task" ? "task" : "note";
    const mentions = normalizeMentionIds(input.mentions);
    await validateMentions(context, mentions);
    const tags = normalizeActivityTags(input.tags);
    const dueAt = kind === "task" ? normalizeDueAt(input.dueAt) : null;
    const source = input.source === "voice" ? "voice" : "manual";

    const { data, error } = await context.admin
      .from("project_notes")
      .insert({
        organization_id: context.organizationId,
        project_id: projectId,
        body,
        created_by: context.user.id,
        kind,
        status: "open",
        due_at: dueAt,
        pinned: Boolean(input.pinned),
        mentions,
        tags,
        source,
      })
      .select(noteColumns)
      .single();
    if (error) throw new OrganizationAuthError("Impossible d’ajouter l’élément au chantier.", 503);

    return NextResponse.json({ item: { ...data, attachments: [] } }, { status: 201 });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireOrganization(request);
    const input = await request.json() as Record<string, unknown>;
    const id = requireUuid(input.id, "Élément");
    const existing = await fetchItem(context, id);
    const mentions = normalizeMentionIds(existing.mentions);
    const contentAllowed = canManageActivityContent(
      context.role,
      context.user.id,
      String(existing.created_by),
    );
    const updates: Record<string, unknown> = {};

    if (Object.prototype.hasOwnProperty.call(input, "status")) {
      if (existing.kind !== "task") throw new OrganizationAuthError("Seules les tâches ont un statut.", 400);
      if (!canCompleteActivityTask(context.role, context.user.id, String(existing.created_by), mentions)) {
        throw new OrganizationAuthError("Vous ne pouvez pas modifier cette tâche.", 403);
      }
      const status = input.status === "done" ? "done" : input.status === "open" ? "open" : null;
      if (!status) throw new OrganizationAuthError("Statut invalide.", 400);
      updates.status = status;
      updates.completed_at = status === "done" ? new Date().toISOString() : null;
      updates.completed_by = status === "done" ? context.user.id : null;
    }

    const changesContent = ["body", "tags", "mentions", "dueAt", "pinned"].some((key) =>
      Object.prototype.hasOwnProperty.call(input, key),
    );
    if (changesContent && !contentAllowed) {
      throw new OrganizationAuthError("Vous ne pouvez pas modifier cet élément.", 403);
    }

    if (Object.prototype.hasOwnProperty.call(input, "body")) {
      const body = normalizeActivityBody(input.body);
      if (!body) throw new OrganizationAuthError("Texte invalide.", 400);
      updates.body = body;
    }
    if (Object.prototype.hasOwnProperty.call(input, "tags")) {
      updates.tags = normalizeActivityTags(input.tags);
    }
    if (Object.prototype.hasOwnProperty.call(input, "mentions")) {
      const nextMentions = normalizeMentionIds(input.mentions);
      await validateMentions(context, nextMentions);
      updates.mentions = nextMentions;
    }
    if (Object.prototype.hasOwnProperty.call(input, "dueAt")) {
      if (existing.kind !== "task") throw new OrganizationAuthError("Une note n’a pas d’échéance.", 400);
      updates.due_at = normalizeDueAt(input.dueAt);
    }
    if (Object.prototype.hasOwnProperty.call(input, "pinned")) {
      updates.pinned = Boolean(input.pinned);
    }

    if (!Object.keys(updates).length) throw new OrganizationAuthError("Aucune modification à appliquer.", 400);

    const { data, error } = await context.admin
      .from("project_notes")
      .update(updates)
      .eq("organization_id", context.organizationId)
      .eq("id", id)
      .select(noteColumns)
      .single();
    if (error) throw new OrganizationAuthError("Impossible de modifier l’élément.", 503);

    return NextResponse.json({ item: data });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireOrganization(request);
    const input = await request.json() as Record<string, unknown>;
    const id = requireUuid(input.id, "Élément");
    const existing = await fetchItem(context, id);
    if (!canManageActivityContent(context.role, context.user.id, String(existing.created_by))) {
      throw new OrganizationAuthError("Vous ne pouvez pas supprimer cet élément.", 403);
    }

    const { data: attachments, error: attachmentError } = await context.admin
      .from("project_note_attachments")
      .select("storage_path")
      .eq("organization_id", context.organizationId)
      .eq("note_id", id);
    if (attachmentError) throw new OrganizationAuthError("Impossible de préparer la suppression.", 503);

    const paths = (attachments ?? []).map((row) => String(row.storage_path)).filter(Boolean);
    if (paths.length) {
      const { error: storageError } = await context.admin.storage.from(PROJECT_ACTIVITY_BUCKET).remove(paths);
      if (storageError) throw new OrganizationAuthError("Impossible de supprimer les fichiers liés.", 503);
    }

    const { error } = await context.admin
      .from("project_notes")
      .delete()
      .eq("organization_id", context.organizationId)
      .eq("id", id);
    if (error) throw new OrganizationAuthError("Impossible de supprimer l’élément.", 503);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
