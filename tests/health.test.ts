import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/health/route";
import { supabasePublicConfig } from "../lib/supabase-config";

test("la sonde publique de santé n’exige aucun secret et ne masque pas les pannes", async () => {
  const previous = globalThis.fetch;
  try {
    for (const status of [200, 503]) {
      globalThis.fetch = async (input, options) => {
        assert.equal(String(input), `${supabasePublicConfig.url}/auth/v1/health`);
        assert.deepEqual(options?.headers, { apikey: supabasePublicConfig.publishableKey });
        assert.equal(options?.cache, "no-store");
        assert.ok(options?.signal instanceof AbortSignal);
        return Response.json({ version: "fixture" }, { status });
      };
      const response = await GET();
      assert.equal(response.status, status);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const body = await response.json();
      assert.equal(body.probe, "auth");
      assert.equal(body.supabaseReachable, status === 200);
      assert.equal(body.status, status === 200 ? "ok" : "degraded");
      assert.equal(body.version, undefined);
    }
    globalThis.fetch = async () => { throw new Error("private upstream details"); };
    const failed = await GET();
    assert.equal(failed.status, 503);
    assert.equal(failed.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await failed.text(), /private upstream details/);
  } finally {
    globalThis.fetch = previous;
  }
});
