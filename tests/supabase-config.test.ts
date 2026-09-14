import assert from "node:assert/strict";
import test from "node:test";
import { resolveSupabasePublicConfig } from "../lib/supabase-config";

test("la configuration Supabase reste disponible sans variables Vercel explicites", () => {
  const config = resolveSupabasePublicConfig({});
  assert.match(config.url, /^https:\/\/.+\.supabase\.co$/);
  assert.ok(config.publishableKey.startsWith("sb_publishable_"));
});

test("les variables d’environnement explicites restent prioritaires", () => {
  const config = resolveSupabasePublicConfig({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  });
  assert.equal(config.url, "https://example.supabase.co");
  assert.equal(config.publishableKey, "sb_publishable_test");
});
