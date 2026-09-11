import assert from "node:assert/strict";
import test from "node:test";
import { COMPANY_PROFILE_STORAGE_KEY } from "../lib/company-profile";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "../lib/mobile-workspace-storage";
import {
  PILOT_SYNC_STATE_KEY,
  clearPilotLocalSnapshot,
  markPilotSnapshotDirty,
  markPilotSnapshotSynced,
  pilotStorageSignature,
  readPilotLocalSnapshot,
  readPilotSyncState,
  shouldPreferLocalPilotSnapshot,
  writePilotLocalSnapshot,
} from "../lib/pilot-cloud-workspace";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

test("le snapshot pilote conserve strictement les valeurs inconnues du devis", () => {
  const storage = new MemoryStorage();
  storage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify({
    customers: [],
    invoices: [],
    agenda: [],
    quotes: [{
      id: "quote-1",
      number: "D-2026-001",
      customerId: "customer-1",
      customerName: "Client test",
      title: "Peinture",
      issueDate: "2026-09-08",
      expiryDate: "2026-11-08",
      status: "En attente",
      notes: "",
      subtotal: 0,
      taxTotal: 0,
      total: 0,
      items: [{
        id: "line-1",
        label: "Protection du chantier",
        description: "",
        quantity: null,
        unit: null,
        unitPrice: null,
        taxRate: null,
        incomplete: true,
        provenance: "unknown",
      }],
    }],
  }));

  const snapshot = readPilotLocalSnapshot(storage as unknown as Storage);
  const line = snapshot.workspace.quotes[0]?.items[0];
  assert.equal(line?.quantity, null);
  assert.equal(line?.unit, null);
  assert.equal(line?.unitPrice, null);
  assert.equal(line?.taxRate, null);
  assert.equal(line?.incomplete, true);
});

test("un snapshot cloud réhydrate workspace et profil entreprise sans perte", () => {
  const storage = new MemoryStorage();
  const snapshot = {
    workspace: {
      customers: [],
      quotes: [],
      invoices: [],
      agenda: [],
    },
    companyProfile: {
      version: 1 as const,
      legalName: "Atelier Martin SARL",
      displayName: "Atelier Martin",
      siret: "12345678901234",
      vatNumber: "FR00123456789",
      email: "contact@atelier.test",
      accountingEmail: "compta@atelier.test",
      phone: "0400000000",
      address: "1 rue du Test",
      postalCode: "69000",
      city: "Lyon",
      primaryTradeId: "",
      accountingStart: "01-01",
      accountingEnd: "12-31",
      logoDataUrl: "",
      emailIntro: "Veuillez trouver ci-joint votre document.",
      emailSignature: "Cordialement,",
      onboardingCompletedAt: "",
      tutorialCompletedAt: "",
      updatedAt: "2026-09-08T12:00:00.000Z",
    },
  };

  writePilotLocalSnapshot(storage as unknown as Storage, snapshot);
  const restored = readPilotLocalSnapshot(storage as unknown as Storage);
  assert.equal(restored.companyProfile.legalName, "Atelier Martin SARL");
  assert.equal(restored.companyProfile.siret, "12345678901234");
  assert.deepEqual(restored.workspace, snapshot.workspace);
});

test("un état local sale ne prend priorité que pour la même entreprise", () => {
  const storage = new MemoryStorage();
  const signature = pilotStorageSignature(storage as unknown as Storage);
  markPilotSnapshotDirty(storage as unknown as Storage, "org-a", signature);
  const dirty = readPilotSyncState(storage as unknown as Storage);

  assert.equal(shouldPreferLocalPilotSnapshot(dirty, "org-a"), true);
  assert.equal(shouldPreferLocalPilotSnapshot(dirty, "org-b"), false);

  markPilotSnapshotSynced(storage as unknown as Storage, "org-a", signature);
  assert.equal(shouldPreferLocalPilotSnapshot(readPilotSyncState(storage as unknown as Storage), "org-a"), false);
});

test("la déconnexion efface uniquement le cache sensible du pilote", () => {
  const storage = new MemoryStorage();
  storage.setItem(MOBILE_WORKSPACE_STORAGE_KEY, "{}");
  storage.setItem(COMPANY_PROFILE_STORAGE_KEY, "{}");
  storage.setItem(PILOT_SYNC_STATE_KEY, "{}");
  storage.setItem("forgeo:keep-me", "ok");

  clearPilotLocalSnapshot(storage as unknown as Storage);
  assert.equal(storage.getItem(MOBILE_WORKSPACE_STORAGE_KEY), null);
  assert.equal(storage.getItem(COMPANY_PROFILE_STORAGE_KEY), null);
  assert.equal(storage.getItem(PILOT_SYNC_STATE_KEY), null);
  assert.equal(storage.getItem("forgeo:keep-me"), "ok");
});
