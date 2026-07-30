import { describe, expect, it } from "vitest";
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
} from "@/lib/mobile-commercial-demo";
import { seedMobileWorkspace } from "@/lib/mobile-prototype";
import { QUOTE_META_STORAGE_KEY } from "@/lib/mobile-quote-preview";
import { MOBILE_WORKSPACE_STORAGE_KEY } from "@/lib/mobile-workspace-storage";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("commercial demo", () => {
  it("calcule l’avancement et permet de terminer une étape", () => {
    const state = seedCommercialDemoState();
    const project = state.projects[0];
    expect(calculateProjectProgress(project)).toBe(50);

    const next = toggleProjectStep(state, project.id, project.steps[2].id);
    expect(calculateProjectProgress(next.projects[0])).toBe(75);
  });

  it("filtre les documents par client, statut, date et montant", () => {
    const workspace = seedMobileWorkspace();
    const result = filterBusinessDocuments(workspace.quotes, {
      customerId: "C-002",
      status: "En attente",
      dateFrom: "2026-07-01",
      dateTo: "2026-07-31",
      minAmount: "1000",
      maxAmount: "3000",
    });

    expect(result).toHaveLength(1);
    expect(result[0].number).toBe("D-2026-376");
  });

  it("fait passer un chantier en bloqué lors d’un incident bloquant", () => {
    const state = seedCommercialDemoState();
    const project = state.projects[0];
    const next = addProjectIssue(state, project.id, {
      title: "Support humide",
      detail: "Impossible de peindre aujourd’hui.",
      severity: "Bloquant",
    });

    expect(next.projects[0].status).toBe("Bloqué");
    expect(next.projects[0].issues[0].title).toBe("Support humide");
  });

  it("conserve un journal limité et ordonné", () => {
    let state = seedCommercialDemoState();
    for (let index = 0; index < 100; index += 1) {
      state = appendActivity(state, { kind: "document", message: `Action ${index}` });
    }
    expect(state.activity).toHaveLength(80);
    expect(state.activity[0].message).toBe("Action 99");
  });

  it("génère des notifications métier", () => {
    const workspace = seedMobileWorkspace();
    workspace.quotes[0].expiryDate = new Date().toISOString().slice(0, 10);
    const notifications = buildCommercialNotifications(workspace, seedCommercialDemoState());
    expect(notifications.some((item) => item.documentNumber === workspace.quotes[0].number)).toBe(true);
  });

  it("exporte et restaure toutes les données locales", () => {
    const source = new MemoryStorage();
    const target = new MemoryStorage();
    const workspace = seedMobileWorkspace();
    source.setItem(MOBILE_WORKSPACE_STORAGE_KEY, JSON.stringify(workspace));
    source.setItem(QUOTE_META_STORAGE_KEY, JSON.stringify({ "D-2026-378": { discountPercent: 5, internalNotes: "Interne" } }));

    const backup = exportCommercialBackup(source as unknown as Storage);
    importCommercialBackup(target as unknown as Storage, backup);

    expect(JSON.parse(target.getItem(MOBILE_WORKSPACE_STORAGE_KEY) || "{}").quotes).toHaveLength(workspace.quotes.length);
    expect(JSON.parse(target.getItem(QUOTE_META_STORAGE_KEY) || "{}")["D-2026-378"].discountPercent).toBe(5);
  });
});
