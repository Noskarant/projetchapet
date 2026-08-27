import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync("supabase/migrations/20260827150000_pre_auth_commercial_foundation.sql", "utf8");

test("la migration commerciale supporte toutes les unités du copilote", () => {
  for (const unit of ["m2", "m", "ml", "l", "h", "jour", "unite", "forfait"]) {
    assert.match(sql, new RegExp(`'${unit}'`));
  }
});

test("les tarifs peuvent être séparés par métier", () => {
  assert.match(sql, /catalog_services_org_trade_code_uidx/);
  assert.match(sql, /company_trade_pricing_settings/);
  assert.match(sql, /primary key \(organization_id, trade\)/i);
});

test("les nouvelles données sensibles n’ouvrent aucun accès anon", () => {
  assert.doesNotMatch(sql, /\bto\s+anon\b/i);
  assert.match(sql, /to authenticated/gi);
  assert.match(sql, /company_copilot_rules/);
  assert.match(sql, /project_cost_entries/);
});
