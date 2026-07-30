import assert from "node:assert/strict";
import test from "node:test";
import {
  addProjectIssue,
  appendActivity,
  buildCommercialNotifications,
  calculateProjectProgress,
  exportCommercialBackup,
  filterBusinessDocuments,
  importCommercialBackup,
  seedCommercialDemoState,
  toggleProjectStep,
} from "../lib/mobile-commercial-demo";
import { seedMobileWorkspace } from "../lib/mobile-prototype";
import { QUOTE_META_STORAGE_KEY } from "../lib/mobile-quote-preview";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "../lib/mobile-workspace-storage";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

test("calcule l’avancement et permet de terminer une étape", () => {
  const state = seedCommercialDemoState();
  const project = state.projects[0];
  assert.equal(calculateProjectProgress(project), 50);

  const next = toggleProjectStep(state, project.id, project.steps[2].id);
  assert.equal(calculateProjectProgress(next.projects[0]), 75);
});

test("filtre les documents par client, statut, date et montant", () => {
  const workspace = seedMobileWorkspace();
  const result = filterBusinessDocuments(workspace.quotes, {
    customerId: "C-002",
    status: "En attente",
    dateFrom: "2026-07-01",
    dateTo: "2026-07-31",
    minAmount: "1000",
    maxAmount: "3000",
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].number, "D-2026-376");
});

test("fait passer un chantier en bloqué lors d’un incident bloquant", () => {
  const state = seedCommercialDemoState();
  const project = state.projects[0];
  const next = addProjectIssue(state, project.id, {
    title: "Support humide",
    detail: "Impossible de peindre aujourd’hui.",
    severity: "Bloquant",
  });

  assert.equal(next.projects[0].status, "Bloqué");
  assert.equal(next.projects[0].issues[0].title, "Support humide");
});

test("conserve un journal limité et ordonné", () => {
  let state = seedCommercialDemoState();
  for (let index = 0; index < 100; index += 1) {
    state = appendActivity(state, { kind: "document", message: `Action ${index}` });
  }
  assert.equal(state.activity.length, 80);
  assert.equal(state.activity[0].message, "Action 99");
});

test("génère des notifications métier", () => {
  const workspace = seedMobileWorkspace();
  workspace.quotes[0].expiryDate = new Date().toISOString().slice(0, 10);
  const notifications = buildCommercialNotifications(workspace, seedCommercialDemoState());
  assert.ok(notifications.some((item) => item.documentNumber === workspace.quotes[0].number));
});

test("exporte et restaure toutes les données locales", () => {
  const source = new MemoryStorage();
  const target = new MemoryStorage();
  const workspace = seedMobileWorkspace();
  source.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
  source.setItem(
    QUOTE_META_STORAGE_KEY,
    JSON.stringify({
      "D-2026-378": { discountPercent: 5, internalNotes: "Interne" },
    }),
  );

  const backup = exportCommercialBackup(source as unknown as Storage);
  importCommercialBackup(target as unknown as Storage, backup);

  const restoredWorkspace = JSON.parse(target.getItem(MOBILE_WORKSPACE_STORAGE_KEY) || "{}") as {
    quotes: unknown[];
  };
  const restoredMeta = JSON.parse(target.getItem(QUOTE_META_STORAGE_KEY) || "{}") as Record<
    string,
    { discountPercent: number }
  >;
  assert.equal(restoredWorkspace.quotes.length, workspace.quotes.length);
  assert.equal(restoredMeta["D-2026-378"].discountPercent, 5);
});
