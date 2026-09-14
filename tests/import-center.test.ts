import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260914070000_import_center_v1.sql", "utf8");
const commitRoute = readFileSync("app/api/import/commit/route.ts", "utf8");
const rollbackRoute = readFileSync("app/api/import/rollback/route.ts", "utf8");
const center = readFileSync("app/import-center.tsx", "utf8");

test("les fonctions de commit et rollback restent serveur-only", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all on function public\.commit_import_job\(uuid, uuid, text\) from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.commit_import_job\(uuid, uuid, text\) to service_role/i);
  assert.match(commitRoute, /requireOrganization\(context, organizationId, \["owner", "admin"\]\)/);
  assert.match(rollbackRoute, /requireOrganization\(context, organizationId, \["owner", "admin"\]\)/);
});

test("le rollback protège les clients modifiés ou référencés", () => {
  assert.match(migration, /from public\.quotes where organization_id = j\.organization_id and customer_id = target/);
  assert.match(migration, /from public\.invoices where organization_id = j\.organization_id and customer_id = target/);
  assert.match(migration, /status = 'rollback_blocked'/);
  assert.match(migration, /c\.emails is distinct from expected_emails/);
});

test("l'interface exige une confirmation et ne prétend pas accepter XLSX", () => {
  assert.match(center, /J’ai vérifié l’aperçu et je confirme l’import/);
  assert.match(center, /exportez le classeur Excel en CSV UTF-8/);
  assert.match(center, /duplicateStrategy/);
  assert.match(center, /rollbackImport/);
});
