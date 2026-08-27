import type {
  CopilotCatalogService,
  CopilotCompanySettings,
  CopilotProposalLine,
  CopilotProposalMetrics,
} from "./types";

export const DEFAULT_COPILOT_COMPANY_SETTINGS: CopilotCompanySettings = {
  hourlyCost: 28,
  targetMarginRate: 30,
  defaultTaxRate: 20,
  includeTravelFee: true,
};

export function roundCopilot(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

export function mergeCopilotCatalog(
  defaults: CopilotCatalogService[],
  overrides: CopilotCatalogService[] = [],
) {
  const merged = new Map(defaults.map((item) => [item.code, item]));
  for (const override of overrides) {
    merged.set(override.code, { ...override, source: "company_catalog" });
  }
  return merged;
}

export function createCopilotProposalLine(
  catalog: Map<string, CopilotCatalogService>,
  code: string,
  quantity: number,
  settings: CopilotCompanySettings,
): CopilotProposalLine | null {
  const service = catalog.get(code);
  if (!service || quantity <= 0) return null;

  const normalizedQuantity = roundCopilot(quantity, 2);
  const saleTotalHt = roundCopilot(normalizedQuantity * service.unitPriceHt);
  const materialCost = roundCopilot(normalizedQuantity * service.materialCostPerUnit);
  const labourHours = roundCopilot(normalizedQuantity * service.labourHoursPerUnit, 2);
  const labourCost = roundCopilot(labourHours * settings.hourlyCost);
  const estimatedCost = roundCopilot(materialCost + labourCost);
  const estimatedMargin = roundCopilot(saleTotalHt - estimatedCost);
  const marginRate = saleTotalHt > 0
    ? roundCopilot((estimatedMargin / saleTotalHt) * 100, 1)
    : 0;

  return {
    code,
    label: service.label,
    description: service.description,
    quantity: normalizedQuantity,
    unit: service.unit,
    unitPriceHt: service.unitPriceHt,
    taxRate: service.taxRate || settings.defaultTaxRate,
    saleTotalHt,
    materialCost,
    labourHours,
    labourCost,
    estimatedCost,
    estimatedMargin,
    marginRate,
    source: service.source,
    sourceLabel: service.source === "company_catalog"
      ? "Tarif du catalogue de l’entreprise"
      : "Modèle métier à confirmer",
  };
}

export function calculateCopilotProposalMetrics(
  lines: CopilotProposalLine[],
  settings: CopilotCompanySettings,
): CopilotProposalMetrics {
  const totals = lines.reduce(
    (acc, line) => ({
      saleTotalHt: acc.saleTotalHt + line.saleTotalHt,
      materialCost: acc.materialCost + line.materialCost,
      labourHours: acc.labourHours + line.labourHours,
      labourCost: acc.labourCost + line.labourCost,
      estimatedCost: acc.estimatedCost + line.estimatedCost,
      estimatedMargin: acc.estimatedMargin + line.estimatedMargin,
    }),
    {
      saleTotalHt: 0,
      materialCost: 0,
      labourHours: 0,
      labourCost: 0,
      estimatedCost: 0,
      estimatedMargin: 0,
    },
  );

  const saleTotalHt = roundCopilot(totals.saleTotalHt);
  const estimatedMargin = roundCopilot(totals.estimatedMargin);
  const marginRate = saleTotalHt > 0
    ? roundCopilot((estimatedMargin / saleTotalHt) * 100, 1)
    : 0;

  return {
    saleTotalHt,
    materialCost: roundCopilot(totals.materialCost),
    labourHours: roundCopilot(totals.labourHours, 2),
    labourCost: roundCopilot(totals.labourCost),
    estimatedCost: roundCopilot(totals.estimatedCost),
    estimatedMargin,
    marginRate,
    targetMarginRate: settings.targetMarginRate,
    marginAlert: saleTotalHt > 0 && marginRate < settings.targetMarginRate
      ? `Marge estimée à ${marginRate} %, sous l’objectif de ${settings.targetMarginRate} %.`
      : null,
  };
}
