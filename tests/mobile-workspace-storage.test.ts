import assert from "node:assert/strict";
import test from "node:test";
import { seedMobileWorkspace } from "../lib/mobile-prototype";
import {
  MOBILE_WORKSPACE_STORAGE_KEY,
  prepareMobileWorkspaceStorage,
} from "../lib/mobile-workspace-storage";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  entries() {
    return [...this.values.entries()];
  }
}

test("initialise le prototype avec les données de démonstration", () => {
  const storage = new MemoryStorage();
  const fallback = seedMobileWorkspace();

  const status = prepareMobileWorkspaceStorage(storage, fallback);

  assert.equal(status, "seeded");
  assert.deepEqual(JSON.parse(storage.getItem(MOBILE_WORKSPACE_STORAGE_KEY) ?? "null"), fallback);
});

test("conserve un workspace déjà valide sans le réécrire", () => {
  const storage = new MemoryStorage();
  const workspace = seedMobileWorkspace();
  const raw = JSON.stringify(workspace);
  storage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, raw);

  const status = prepareMobileWorkspaceStorage(storage, workspace);

  assert.equal(status, "unchanged");
  assert.equal(storage.getItem(MOBILE_WORKSPACE_STORAGE_KEY), raw);
});

test("normalise un ancien format sans perdre les documents", () => {
  const storage = new MemoryStorage();
  const fallback = seedMobileWorkspace();
  const legacy = structuredClone(fallback) as unknown as {
    invoices: Array<Record<string, unknown>>;
  };
  delete legacy.invoices[0].accountantSent;
  legacy.invoices[0].subtotal = 999999;
  storage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify(legacy));

  const status = prepareMobileWorkspaceStorage(storage, fallback);
  const normalized = JSON.parse(storage.getItem(MOBILE_WORKSPACE_STORAGE_KEY) ?? "null") as typeof fallback;

  assert.equal(status, "normalized");
  assert.equal(normalized.invoices.length, fallback.invoices.length);
  assert.equal(normalized.invoices[0].accountantSent, false);
  assert.notEqual(normalized.invoices[0].subtotal, 999999);
});

test("sauvegarde le JSON corrompu avant restauration", () => {
  const storage = new MemoryStorage();
  const fallback = seedMobileWorkspace();
  storage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, "{json-invalide");

  const status = prepareMobileWorkspaceStorage(storage, fallback);
  const backup = storage.entries().find(([key]) => key.startsWith("projetchapet-mobile-workspace-corrupt-"));

  assert.equal(status, "recovered");
  assert.equal(backup?.[1], "{json-invalide");
  assert.deepEqual(JSON.parse(storage.getItem(MOBILE_WORKSPACE_STORAGE_KEY) ?? "null"), fallback);
});
