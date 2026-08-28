import assert from "node:assert/strict";
import test from "node:test";
import {
  changePrimaryTrade,
  createDefaultForgeoBusinessProfile,
  getTradeProfile,
  normalizeForgeoBusinessProfile,
  readForgeoBusinessProfile,
  upsertTradeProfile,
  writeForgeoBusinessProfile,
} from "../lib/copilot/business-profile";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test("le profil par défaut reste peinture pour préserver le prototype", () => {
  const profile = createDefaultForgeoBusinessProfile();
  assert.equal(profile.primaryTrade, "interior_painting");
  assert.deepEqual(profile.enabledTrades, ["interior_painting"]);
});

test("la préférence historique est migrée vers le profil métier", () => {
  const storage = new MemoryStorage();
  storage.setItem("forgeo:primary-trade", "upholstery_decorator");
  const profile = readForgeoBusinessProfile(storage);
  assert.equal(profile.primaryTrade, "upholstery_decorator");
});

test("un deuxième métier est activé sans perdre le premier", () => {
  const initial = createDefaultForgeoBusinessProfile();
  const next = changePrimaryTrade(initial, "upholstery_decorator");
  assert.equal(next.primaryTrade, "upholstery_decorator");
  assert.deepEqual(next.enabledTrades.sort(), ["interior_painting", "upholstery_decorator"].sort());
});

test("les tarifs entreprise sont conservés par métier", () => {
  const initial = changePrimaryTrade(createDefaultForgeoBusinessProfile(), "upholstery_decorator");
  const next = upsertTradeProfile(initial, "upholstery_decorator", {
    settings: { hourlyCost: 38, targetMarginRate: 42, defaultTaxRate: 20, includeTravelFee: true },
    catalog: [{
      code: "upholstery_stripping",
      label: "Dégarnissage atelier",
      description: "Dégarnissage complet",
      unit: "unite",
      unitPriceHt: 185,
      materialCostPerUnit: 8,
      labourHoursPerUnit: 2.5,
      taxRate: 20,
      source: "company_catalog",
    }],
  });

  const trade = getTradeProfile(next, "upholstery_decorator");
  assert.equal(trade.settings.hourlyCost, 38);
  assert.equal(trade.catalog[0]?.unitPriceHt, 185);
  assert.equal(trade.catalog[0]?.source, "company_catalog");
});

test("les données invalides sont bornées et les services inconnus rejetés", () => {
  const normalized = normalizeForgeoBusinessProfile({
    primaryTrade: "upholstery_decorator",
    enabledTrades: ["upholstery_decorator", "unknown_trade"],
    trades: {
      upholstery_decorator: {
        settings: { hourlyCost: -10, targetMarginRate: 300, defaultTaxRate: 7 },
        catalog: [
          { code: "unknown_service", unitPriceHt: 999 },
          { code: "upholstery_stripping", unitPriceHt: 220, materialCostPerUnit: 10, labourHoursPerUnit: 3, taxRate: 20 },
        ],
      },
    },
  });

  const trade = getTradeProfile(normalized, "upholstery_decorator");
  assert.deepEqual(trade.settings, {});
  assert.equal(trade.catalog.length, 1);
  assert.equal(trade.catalog[0]?.code, "upholstery_stripping");
});

test("lecture et écriture storage restent rétrocompatibles", () => {
  const storage = new MemoryStorage();
  const profile = changePrimaryTrade(createDefaultForgeoBusinessProfile(), "upholstery_decorator");
  writeForgeoBusinessProfile(profile, storage);
  const reloaded = readForgeoBusinessProfile(storage);
  assert.equal(reloaded.primaryTrade, "upholstery_decorator");
  assert.equal(storage.getItem("forgeo:primary-trade"), "upholstery_decorator");
});
