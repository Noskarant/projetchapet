import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("le backend de facturation électronique réutilise la configuration Supabase partagée", () => {
  const source = readFileSync(new URL("../lib/einvoice/server.ts", import.meta.url), "utf8");

  assert.match(source, /supabasePublicConfig/);
  assert.doesNotMatch(source, /process\.env\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.doesNotMatch(source, /process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(source, /Service d’authentification indisponible/);
});
