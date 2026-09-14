import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveSupabasePublicConfig } from "../lib/supabase-config";

test("la configuration Supabase publique reste disponible sans variables runtime Vercel", () => {
  const config = resolveSupabasePublicConfig({});

  assert.equal(config.url, "https://mdpmpuurdhdmeupqsmal.supabase.co");
  assert.match(config.publishableKey, /^sb_publishable_/);
});

test("les variables runtime Supabase remplacent les valeurs de repli quand elles existent", () => {
  const config = resolveSupabasePublicConfig({
    NEXT_PUBLIC_SUPABASE_URL: " https://example.supabase.co ",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " sb_publishable_test ",
  });

  assert.equal(config.url, "https://example.supabase.co");
  assert.equal(config.publishableKey, "sb_publishable_test");
});

test("le backend d'authentification utilise la configuration partagée au lieu d'exiger les variables Vercel", () => {
  const source = readFileSync(new URL("../lib/server-auth.ts", import.meta.url), "utf8");

  assert.match(source, /supabasePublicConfig/);
  assert.doesNotMatch(source, /process\.env\.NEXT_PUBLIC_SUPABASE_(URL|PUBLISHABLE_KEY)/);
  assert.doesNotMatch(source, /Service d’authentification indisponible/);
});
