import assert from "node:assert/strict";
import test from "node:test";
import { calculateProjectProfitability, profitabilitySignal } from "../lib/copilot/project-profitability";

test("calcule les coûts réels et la marge sans IA", () => {
  const result = calculateProjectProfitability({
    revenueHt: 5000,
    estimatedCost: 3000,
    estimatedLabourHours: 32,
    entries: [
      { id: "1", kind: "labour", description: "Atelier", amount: 1400, labourHours: 35 },
      { id: "2", kind: "material", description: "Fournitures", amount: 900 },
      { id: "3", kind: "travel", description: "Déplacements", amount: 160 },
      { id: "4", kind: "subcontract", description: "Sous-traitance", amount: 250 },
      { id: "5", kind: "other", description: "Divers", amount: 90 },
    ],
  });

  assert.equal(result.actualCost, 2800);
  assert.equal(result.actualMargin, 2200);
  assert.equal(result.actualMarginRate, 44);
  assert.equal(result.costVariance, -200);
  assert.equal(result.costVarianceRate, -6.7);
  assert.equal(result.labourHours, 35);
  assert.equal(result.labourHoursVariance, 3);
  assert.equal(profitabilitySignal(result, 40), "on_target");
});

test("signale un chantier déficitaire", () => {
  const result = calculateProjectProfitability({
    revenueHt: 1000,
    entries: [
      { id: "1", kind: "material", description: "Matière", amount: 1200 },
      { id: "2", kind: "labour", description: "Main-d'œuvre", amount: 300, labourHours: 10 },
    ],
  });
  assert.equal(result.actualMargin, -500);
  assert.equal(result.actualMarginRate, -50);
  assert.equal(profitabilitySignal(result, 30), "loss");
});

test("neutralise les montants invalides plutôt que de fausser le calcul", () => {
  const result = calculateProjectProfitability({
    revenueHt: Number.NaN,
    estimatedCost: -1,
    entries: [
      { id: "1", kind: "material", description: "Erreur", amount: -20 },
      { id: "2", kind: "labour", description: "Erreur", amount: Number.POSITIVE_INFINITY, labourHours: -2 },
    ],
  });
  assert.equal(result.revenueHt, 0);
  assert.equal(result.actualCost, 0);
  assert.equal(result.actualMargin, 0);
  assert.equal(result.estimatedCost, null);
  assert.equal(result.labourHours, 0);
  assert.equal(profitabilitySignal(result, 30), "unknown");
});
