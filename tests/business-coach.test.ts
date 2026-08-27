import assert from "node:assert/strict";
import test from "node:test";
import { buildBusinessCoachInsights } from "../lib/copilot/business-coach";
import { calculateProjectProfitability } from "../lib/copilot/project-profitability";

test("le coach signale une marge insuffisante et un dépassement de coûts", () => {
  const profitability = calculateProjectProfitability({
    revenueHt: 3000,
    estimatedCost: 1800,
    estimatedLabourHours: 20,
    entries: [
      { id: "1", kind: "labour", description: "MO", amount: 1300, labourHours: 28 },
      { id: "2", kind: "material", description: "Matière", amount: 900 },
    ],
  });
  const insights = buildBusinessCoachInsights({ profitability, targetMarginRate: 35 });
  assert.ok(insights.some((item) => item.code === "margin_below_target"));
  assert.ok(insights.some((item) => item.code === "cost_overrun"));
  assert.ok(insights.some((item) => item.code === "labour_overrun"));
});

test("le coach ne fabrique pas d’analyse sans revenu", () => {
  const profitability = calculateProjectProfitability({ revenueHt: 0, entries: [] });
  const insights = buildBusinessCoachInsights({ profitability, targetMarginRate: 30 });
  assert.deepEqual(insights.map((item) => item.code), ["missing_revenue"]);
});
