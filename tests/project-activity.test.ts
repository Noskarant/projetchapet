import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_ACTIVITY_ATTACHMENTS,
  MAX_ACTIVITY_ATTACHMENT_BYTES,
  canCompleteActivityTask,
  canManageActivityContent,
  isAllowedActivityAttachment,
  normalizeActivityBody,
  normalizeActivityTags,
  normalizeMentionIds,
  resolveActivityAttachmentMime,
  sanitizeAttachmentName,
} from "../lib/project-activity";

const migration = readFileSync("supabase/migrations/20260914130000_project_activity_feed.sql", "utf8");
const activityRoute = readFileSync("app/api/project-activity/route.ts", "utf8");
const attachmentRoute = readFileSync("app/api/project-activity/attachments/route.ts", "utf8");
const activityUi = readFileSync("app/project-activity-feed.tsx", "utf8");

test("normalise le contenu et les tags du journal", () => {
  assert.equal(normalizeActivityBody("  Passage client demain  "), "Passage client demain");
  assert.equal(normalizeActivityBody("   "), null);
  assert.deepEqual(
    normalizeActivityTags([" Urgent ", "#urgent", "Matériel", "  matériel  "]),
    ["urgent", "matériel"],
  );
  assert.equal(normalizeActivityTags(Array.from({ length: 20 }, (_, index) => `tag-${index}`)).length, 8);
});

test("filtre les mentions invalides et dupliquées", () => {
  const first = "11111111-2222-4333-8444-555555555555";
  const second = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  assert.deepEqual(normalizeMentionIds([first, "n'importe quoi", first, second]), [first, second]);
});

test("applique les droits d’édition et d’exécution des tâches", () => {
  const author = "11111111-2222-4333-8444-555555555555";
  const worker = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  assert.equal(canManageActivityContent("worker", author, author), true);
  assert.equal(canManageActivityContent("worker", worker, author), false);
  assert.equal(canManageActivityContent("manager", worker, author), true);
  assert.equal(canCompleteActivityTask("worker", worker, author, [worker]), true);
  assert.equal(canCompleteActivityTask("worker", worker, author, []), false);
});

test("sécurise les noms et formats de pièces jointes", () => {
  assert.equal(sanitizeAttachmentName("../../Photo chantier été.jpg"), "..-..-Photo-chantier-ete.jpg");
  assert.equal(resolveActivityAttachmentMime("", "preuve.PDF"), "application/pdf");
  assert.equal(isAllowedActivityAttachment("image/png", "photo.png"), true);
  assert.equal(isAllowedActivityAttachment("application/x-msdownload", "virus.exe"), false);
  assert.equal(MAX_ACTIVITY_ATTACHMENTS, 8);
  assert.equal(MAX_ACTIVITY_ATTACHMENT_BYTES, 15 * 1024 * 1024);
});

test("la migration garde les fichiers privés et étend project_notes sans casser les anciennes notes", () => {
  assert.match(migration, /add column if not exists kind text not null default 'note'/i);
  assert.match(migration, /add column if not exists status text not null default 'open'/i);
  assert.match(migration, /create table if not exists public\.project_note_attachments/i);
  assert.match(migration, /'project-activity'[\s\S]*false,[\s\S]*15728640/i);
  assert.match(migration, /revoke all on table public\.project_note_attachments from anon, authenticated/i);
  assert.match(migration, /grant select on table public\.project_note_attachments to authenticated/i);
});

test("les mutations du journal passent par un contrôle serveur d’organisation", () => {
  assert.match(activityRoute, /requireOrganization\(request\)/);
  assert.match(activityRoute, /canManageActivityContent/);
  assert.match(activityRoute, /canCompleteActivityTask/);
  assert.match(activityRoute, /createSignedUrls\(paths, 20 \* 60\)/);
  assert.match(attachmentRoute, /requireOrganization\(request\)/);
  assert.match(attachmentRoute, /MAX_ACTIVITY_ATTACHMENT_BYTES/);
  assert.match(attachmentRoute, /PROJECT_ACTIVITY_BUCKET/);
});

test("l’interface expose notes, tâches, mentions, vocal et pièces jointes", () => {
  assert.match(activityUi, /Notes, tâches, photos et vocal au même endroit/);
  assert.match(activityUi, /new MediaRecorder\(stream\)/);
  assert.match(activityUi, /\/api\/transcribe/);
  assert.match(activityUi, /Photos \/ pièces jointes/);
  assert.match(activityUi, /Mentions/);
  assert.match(activityUi, /Ajouter au journal/);
});
