import { roundCopilot } from "./business-engine";

export type ProjectCostKind = "labour" | "material" | "travel" | "subcontract" | "other";

export type ProjectCostEntry = {
  id: string;
  kind: ProjectCostKind;
  description: string;
  amount: number;
  labourHours?: number;
  occurredAt?: string;
};

export type ProjectProfitabilityInput = {
  revenueHt: number;
  estimatedCost?: number;
  estimatedLabourHours?: number;
  entries: ProjectCostEntry[];
};

export type ProjectProfitability = {
  revenueHt: number;
  labourHours: number;
  labourCost: number;
  materialCost: number;
  travelCost: number;
  subcontractCost: number;
  otherCost: number;
  actualCost: number;
  actualMargin: number;
  actualMarginRate: number;
  estimatedCost: number | null;
  costVariance: number | null;
  costVarianceRate: number | null;
  estimatedLabourHours: number | null;
  labourHoursVariance: number | null;
};

function boundedMoney(value: number) {
  return Number.isFinite(value) && value >= 0 ? roundCopilot(value) : 0;
}

function boundedHours(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? roundCopilot(value, 2) : 0;
}

export function calculateProjectProfitability(input: ProjectProfitabilityInput): ProjectProfitability {
  const revenueHt = boundedMoney(input.revenueHt);
  const totals = input.entries.reduce(
    (acc, entry) => {
      const amount = boundedMoney(entry.amount);
      const hours = boundedHours(entry.labourHours);
      acc.labourHours += hours;
      if (entry.kind === "labour") acc.labourCost += amount;
      if (entry.kind === "material") acc.materialCost += amount;
      if (entry.kind === "travel") acc.travelCost += amount;
      if (entry.kind === "subcontract") acc.subcontractCost += amount;
      if (entry.kind === "other") acc.otherCost += amount;
      return acc;
    },
    { labourHours: 0, labourCost: 0, materialCost: 0, travelCost: 0, subcontractCost: 0, otherCost: 0 },
  );

  const actualCost = roundCopilot(
    totals.labourCost + totals.materialCost + totals.travelCost + totals.subcontractCost + totals.otherCost,
  );
  const actualMargin = roundCopilot(revenueHt - actualCost);
  const actualMarginRate = revenueHt > 0 ? roundCopilot((actualMargin / revenueHt) * 100, 1) : 0;

  const estimatedCost = typeof input.estimatedCost === "number" && Number.isFinite(input.estimatedCost) && input.estimatedCost >= 0
    ? roundCopilot(input.estimatedCost)
    : null;
  const costVariance = estimatedCost === null ? null : roundCopilot(actualCost - estimatedCost);
  const costVarianceRate = estimatedCost !== null && estimatedCost > 0 && costVariance !== null
    ? roundCopilot((costVariance / estimatedCost) * 100, 1)
    : estimatedCost === 0 && actualCost === 0
      ? 0
      : null;

  const estimatedLabourHours = typeof input.estimatedLabourHours === "number"
    && Number.isFinite(input.estimatedLabourHours)
    && input.estimatedLabourHours >= 0
    ? roundCopilot(input.estimatedLabourHours, 2)
    : null;
  const labourHours = roundCopilot(totals.labourHours, 2);
  const labourHoursVariance = estimatedLabourHours === null
    ? null
    : roundCopilot(labourHours - estimatedLabourHours, 2);

  return {
    revenueHt,
    labourHours,
    labourCost: roundCopilot(totals.labourCost),
    materialCost: roundCopilot(totals.materialCost),
    travelCost: roundCopilot(totals.travelCost),
    subcontractCost: roundCopilot(totals.subcontractCost),
    otherCost: roundCopilot(totals.otherCost),
    actualCost,
    actualMargin,
    actualMarginRate,
    estimatedCost,
    costVariance,
    costVarianceRate,
    estimatedLabourHours,
    labourHoursVariance,
  };
}

export function profitabilitySignal(result: ProjectProfitability, targetMarginRate: number) {
  const target = Number.isFinite(targetMarginRate) ? Math.max(0, Math.min(100, targetMarginRate)) : 0;
  if (result.revenueHt <= 0) return "unknown" as const;
  if (result.actualMarginRate < 0) return "loss" as const;
  if (result.actualMarginRate < target) return "below_target" as const;
  return "on_target" as const;
}
