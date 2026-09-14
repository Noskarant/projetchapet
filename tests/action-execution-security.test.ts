import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const server = readFileSync("lib/action-execution-server.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260914154500_action_execution_without_service_role.sql", "utf8");

test("le moteur d’exécution IA ne dépend plus de SUPABASE_SERVICE_ROLE_KEY côté Vercel", () => {
  assert.doesNotMatch(server, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(server, /serviceSupabase\(/);
  assert.match(server, /claimProposal\(context\.client/);
  assert.match(server, /finalizeProposal\(context\.client/);
  assert.match(server, /failProposal\(context\.client/);
});

test("RLS limite les transitions aux membres, auteurs ou owner/admin", () => {
  assert.match(migration, /create policy "members execute action proposals"/i);
  assert.match(migration, /private\.is_org_member\(organization_id\)/);
  assert.match(migration, /created_by = \(select auth\.uid\(\)\) or private\.has_org_role\(organization_id, array\['owner','admin'\]\)/);
});

test("le trigger rend le contenu métier de la proposition immuable pendant l’exécution", () => {
  assert.match(migration, /new\.payload is distinct from old\.payload/);
  assert.match(migration, /new\.intent_type is distinct from old\.intent_type/);
  assert.match(migration, /new\.risk_level is distinct from old\.risk_level/);
  assert.match(migration, /action proposal execution fields are immutable/);
});

test("seules les transitions ready -> confirmed -> executed|failed sont admises", () => {
  assert.match(migration, /old\.status = 'ready' and new\.status = 'confirmed'/);
  assert.match(migration, /old\.status = 'confirmed' and new\.status in \('executed','failed'\)/);
  assert.match(migration, /confirmation must be attributed to current user/);
  assert.match(migration, /only the confirming user can finish this action/);
});

test("l’audit des actions exécutées est généré en base et non par le client", () => {
  assert.match(migration, /create or replace function private\.audit_action_proposal_execution/);
  assert.match(migration, /'ai_' \|\| new\.intent_type \|\| '_executed'/);
  assert.match(migration, /after update on public\.action_proposals/);
  assert.doesNotMatch(server, /from\("audit_log"\)\.insert/);
});
