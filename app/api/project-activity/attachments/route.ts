import { NextResponse } from "next/server";
import {
  MAX_ACTIVITY_ATTACHMENTS,
  MAX_ACTIVITY_ATTACHMENT_BYTES,
  PROJECT_ACTIVITY_BUCKET,
  canManageActivityContent,
  resolveActivityAttachmentMime,
  sanitizeAttachmentName,
} from "@/lib/project-activity";
import {
  OrganizationAuthError,
  organizationErrorResponse,
  requireOrganization,
} from "@/lib/server-organization";

export const runtime = "nodejs";
export const maxDuration = 60;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireUuid(value: unknown, label: string) {
  const id = String(value ?? "").trim();
  if (!uuidPattern.test(id)) throw new OrganizationAuthError(`${label} invalide.`, 400);
  return id;
}

async function loadNote(
  context: Awaited<ReturnType<typeof requireOrganization>>,
  noteId: string,
) {
  const { data, error } = await context.admin
    .from("project_notes")
    .select("id,project_id,created_by")
    .eq("organization_id", context.organizationId)
    .eq("id", noteId)
    .maybeSingle();
  if (error) throw new OrganizationAuthError("Impossible de vérifier l’élément.", 503);
  if (!data) throw new OrganizationAuthError("Élément introuvable.", 404);
  return data;
}

function safePathPart(value: string) {
  return sanitizeAttachmentName(value).replace(/\.+/g, "-").slice(0, 100);
}

export async function POST(request: Request) {
  try {
    const context = await requireOrganization(request);
    const form = await request.formData();
    const noteId = requireUuid(form.get("noteId"), "Élément");
    const file = form.get("file");
    if (!(file instanceof File)) throw new OrganizationAuthError("Fichier manquant.", 400);
    if (!file.size || file.size > MAX_ACTIVITY_ATTACHMENT_BYTES) {
      throw new OrganizationAuthError("Le fichier doit faire moins de 15 Mo.", 413);
    }

    const mimeType = resolveActivityAttachmentMime(file.type, file.name);
    if (!mimeType) {
      throw new OrganizationAuthError("Format non pris en charge. Utilisez une image, un PDF, un document Office, un CSV/TXT ou un fichier audio.", 400);
    }

    const note = await loadNote(context, noteId);
    const { count, error: countError } = await context.admin
      .from("project_note_attachments")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", context.organizationId)
      .eq("note_id", noteId);
    if (countError) throw new OrganizationAuthError("Impossible de vérifier les pièces jointes.", 503);
    if ((count ?? 0) >= MAX_ACTIVITY_ATTACHMENTS) {
      throw new OrganizationAuthError(`Maximum ${MAX_ACTIVITY_ATTACHMENTS} pièces jointes par élément.`, 400);
    }

    const safeFileName = sanitizeAttachmentName(file.name).slice(0, 200);
    const storagePath = [
      context.organizationId,
      safePathPart(String(note.project_id)),
      noteId,
      `${crypto.randomUUID()}-${safeFileName}`,
    ].join("/");
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await context.admin.storage
      .from(PROJECT_ACTIVITY_BUCKET)
      .upload(storagePath, bytes, {
        contentType: mimeType,
        cacheControl: "3600",
        upsert: false,
      });
    if (uploadError) throw new OrganizationAuthError("Impossible d’envoyer le fichier.", 503);

    const { data: attachment, error: insertError } = await context.admin
      .from("project_note_attachments")
      .insert({
        organization_id: context.organizationId,
        note_id: noteId,
        project_id: note.project_id,
        file_name: safeFileName,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: file.size,
        created_by: context.user.id,
      })
      .select("id,note_id,file_name,mime_type,size_bytes,created_by,created_at")
      .single();

    if (insertError) {
      await context.admin.storage.from(PROJECT_ACTIVITY_BUCKET).remove([storagePath]);
      throw new OrganizationAuthError("Impossible d’enregistrer la pièce jointe.", 503);
    }

    const { data: signed, error: signedError } = await context.admin.storage
      .from(PROJECT_ACTIVITY_BUCKET)
      .createSignedUrl(storagePath, 20 * 60);
    if (signedError) throw new OrganizationAuthError("Fichier ajouté, mais son aperçu est indisponible.", 503);

    return NextResponse.json({
      attachment: {
        ...attachment,
        signed_url: signed.signedUrl,
      },
    }, { status: 201 });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireOrganization(request);
    const input = await request.json() as Record<string, unknown>;
    const id = requireUuid(input.id, "Pièce jointe");

    const { data: attachment, error } = await context.admin
      .from("project_note_attachments")
      .select("id,note_id,storage_path,created_by")
      .eq("organization_id", context.organizationId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new OrganizationAuthError("Impossible de vérifier la pièce jointe.", 503);
    if (!attachment) throw new OrganizationAuthError("Pièce jointe introuvable.", 404);

    const note = await loadNote(context, String(attachment.note_id));
    const canDelete = attachment.created_by === context.user.id
      || canManageActivityContent(context.role, context.user.id, String(note.created_by));
    if (!canDelete) throw new OrganizationAuthError("Vous ne pouvez pas supprimer ce fichier.", 403);

    const { error: storageError } = await context.admin.storage
      .from(PROJECT_ACTIVITY_BUCKET)
      .remove([String(attachment.storage_path)]);
    if (storageError) throw new OrganizationAuthError("Impossible de supprimer le fichier.", 503);

    const { error: deleteError } = await context.admin
      .from("project_note_attachments")
      .delete()
      .eq("organization_id", context.organizationId)
      .eq("id", id);
    if (deleteError) throw new OrganizationAuthError("Impossible de supprimer la pièce jointe.", 503);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return organizationErrorResponse(error);
  }
}
