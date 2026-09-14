import type { OrganizationRole } from "./pilot-operations";

export const MAX_ACTIVITY_BODY_LENGTH = 5_000;
export const MAX_ACTIVITY_TAGS = 8;
export const MAX_ACTIVITY_TAG_LENGTH = 32;
export const MAX_ACTIVITY_MENTIONS = 20;
export const MAX_ACTIVITY_ATTACHMENTS = 8;
export const MAX_ACTIVITY_ATTACHMENT_BYTES = 15 * 1024 * 1024;

export const PROJECT_ACTIVITY_BUCKET = "project-activity";

export const ACTIVITY_ATTACHMENT_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
] as const;

const attachmentMimeSet = new Set<string>(ACTIVITY_ATTACHMENT_MIME_TYPES);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const extensionMime = new Map<string, string>([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["heic", "image/heic"],
  ["pdf", "application/pdf"],
  ["txt", "text/plain"],
  ["csv", "text/csv"],
  ["doc", "application/msword"],
  ["xls", "application/vnd.ms-excel"],
  ["docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["webm", "audio/webm"],
  ["ogg", "audio/ogg"],
  ["mp3", "audio/mpeg"],
  ["m4a", "audio/mp4"],
  ["mp4", "audio/mp4"],
  ["wav", "audio/wav"],
]);

export function normalizeActivityBody(value: unknown) {
  const body = String(value ?? "").trim();
  if (!body || body.length > MAX_ACTIVITY_BODY_LENGTH) return null;
  return body;
}

export function normalizeActivityTags(value: unknown) {
  const source = Array.isArray(value) ? value : String(value ?? "").split(",");
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of source) {
    const tag = String(raw ?? "")
      .trim()
      .replace(/^#+/, "")
      .replace(/\s+/g, " ")
      .slice(0, MAX_ACTIVITY_TAG_LENGTH)
      .toLocaleLowerCase("fr-FR");
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    result.push(tag);
    if (result.length >= MAX_ACTIVITY_TAGS) break;
  }

  return result;
}

export function normalizeMentionIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    const id = String(raw ?? "").trim();
    if (!uuidPattern.test(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= MAX_ACTIVITY_MENTIONS) break;
  }
  return result;
}

export function canManageActivityContent(
  role: OrganizationRole,
  currentUserId: string,
  createdBy: string,
) {
  return currentUserId === createdBy || role === "owner" || role === "admin" || role === "manager";
}

export function canCompleteActivityTask(
  role: OrganizationRole,
  currentUserId: string,
  createdBy: string,
  mentions: string[],
) {
  return canManageActivityContent(role, currentUserId, createdBy) || mentions.includes(currentUserId);
}

export function sanitizeAttachmentName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return normalized || "fichier";
}

export function resolveActivityAttachmentMime(type: string | null | undefined, fileName: string) {
  const declared = String(type ?? "").trim().toLowerCase();
  if (attachmentMimeSet.has(declared)) return declared;
  const extension = fileName.split(".").pop()?.trim().toLowerCase() ?? "";
  return extensionMime.get(extension) ?? null;
}

export function isAllowedActivityAttachment(type: string | null | undefined, fileName: string) {
  return Boolean(resolveActivityAttachmentMime(type, fileName));
}
