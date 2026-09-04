import assert from "node:assert/strict";
import test from "node:test";
import { prepareFreshArtisanStart } from "../lib/mobile-fresh-start";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "../lib/mobile-workspace-storage";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("sauvegarde puis remet le workspace à zéro une seule fois", () => {
  const storage = new MemoryStorage();
  storage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify({ customers: [{ id: "c1" }], quotes: [{ id: "q1" }], invoices: [], agenda: [] }));
  storage.setItem("forgeo:project-actuals:v1", "{\"q1\":{}}");

  assert.equal(prepareFreshArtisanStart(storage as unknown as Storage, 1234), "reset");
  assert.deepEqual(JSON.parse(storage.getItem(MOBILE_WORKSPACE_STORAGE_KEY)!), { customers: [], quotes: [], invoices: [], agenda: [] });
  assert.ok(storage.getItem("projetchapet:backup-before-fresh-start-1234"));
  assert.equal(storage.getItem("forgeo:project-actuals:v1"), null);

  storage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify({ customers: [], quotes: [{ id: "new" }], invoices: [], agenda: [] }));
  assert.equal(prepareFreshArtisanStart(storage as unknown as Storage, 5678), "already_applied");
  assert.equal(JSON.parse(storage.getItem(MOBILE_WORKSPACE_STORAGE_KEY)!).quotes[0].id, "new");
});
