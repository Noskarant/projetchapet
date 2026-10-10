import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { nextDocumentNumber, readNextDocumentNumber } from "../lib/document-number";

test("après DEV-2026-043 le nouveau devis propose DEV-2026-044", () => {
  assert.equal(nextDocumentNumber([{ number: "DEV-2026-043" }, { number: "DEV-2026-012" }], "D", 2026), "DEV-2026-044");
});

test("la numérotation reconnaît les anciens préfixes, ignore les autres années et trie les suffixes numériquement", () => {
  const numbers = ["D-2026-040", "DEV-2026-043", "DEV-2025-999", "FAC-2026-300", "DEV-2026-invalide"].map(number => ({ number }));
  assert.equal(nextDocumentNumber(numbers, "D", 2026), "DEV-2026-044");
  assert.equal(nextDocumentNumber([{ number: "DEV-2026-999" }, { number: "DEV-2026-1000" }], "D", 2026), "DEV-2026-1001");
  assert.equal(nextDocumentNumber([{ number: "FAC-2026-043" }, { number: "F-2026-047" }], "F", 2026), "FAC-2026-048");
  assert.equal(nextDocumentNumber([], "D", 2027), "DEV-2027-001");
  assert.equal(nextDocumentNumber([{ number: "A-2026-002" }], "A", 2026), "A-2026-003");
});

test("la proposition consulte toute l’organisation, y compris les archives et les pages suivantes, sans réserver de numéro", async () => {
  const requests: URL[] = [];
  const client = createClient("https://document-number.test", "test-anon-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      assert.equal(init?.method, "GET");
      const url = new URL(String(input)); requests.push(url);
      const rows = requests.length === 1 ? Array.from({ length: 1000 }, (_, i) => ({ number: `DEV-2026-${i + 1}` })) : [{ number: "DEV-2026-1043" }];
      return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } });
    } },
  });
  const pending = [{ number: "DEV-2026-1044" }];
  assert.equal(await readNextDocumentNumber(client, "organisation", "D", pending, 2026), "DEV-2026-1045");
  assert.equal(requests.length, 2);
  for (const url of requests) {
    assert.equal(url.pathname, "/rest/v1/quotes");
    assert.equal(url.searchParams.get("organization_id"), "eq.organisation");
    assert.equal(url.searchParams.get("select"), "number");
    assert.equal(url.searchParams.has("archived_at"), false);
  }
  assert.equal(requests[1].searchParams.get("offset"), "1000");
  assert.deepEqual(pending, [{ number: "DEV-2026-1044" }]);
});
