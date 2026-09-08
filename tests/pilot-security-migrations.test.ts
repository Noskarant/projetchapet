import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";

function migration(name: string) {
  return readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");
}

test("le snapshot pilote est RLS et inaccessible au rôle anon", () => {
  const sql = migration("20260908160000_pilot_workspace_foundation.sql");
  assert.match(sql, /alter table public\.pilot_workspace_snapshots enable row level security/i);
  assert.match(sql, /revoke all privileges on table public\.pilot_workspace_snapshots from public, anon/i);
  assert.match(sql, /to authenticated\s+using \(private\.is_org_member\(organization_id\)\)/i);
  assert.match(sql, /updated_by = auth\.uid\(\)/i);
  assert.doesNotMatch(sql, /to anon/i);
});

test("le cutover retire policies, tables et RPC du mode démo anonyme", () => {
  const sql = migration("20260908161000_disable_demo_anon_access.sql");
  for (const table of ["customers", "quotes", "quote_items", "invoices", "invoice_items", "payments", "organizations"]) {
    assert.match(sql, new RegExp(`revoke all privileges on table public\\.${table} from anon`, "i"));
  }
  assert.match(sql, /drop policy if exists "demo manage customers"/i);
  assert.match(sql, /drop policy if exists "demo read organization"/i);
  assert.match(sql, /revoke execute on function public\.save_quote_document/i);
  assert.match(sql, /revoke usage on schema private from anon/i);
});

test("le helper de trigger n'est plus exécutable par PUBLIC ou anon", () => {
  const sql = migration("20260908205500_revoke_public_trigger_execute.sql");
  assert.match(sql, /revoke execute on function public\.set_updated_at\(\) from public/i);
  assert.match(sql, /revoke execute on function public\.set_updated_at\(\) from anon/i);
  assert.match(sql, /grant execute on function public\.set_updated_at\(\) to authenticated/i);
});
