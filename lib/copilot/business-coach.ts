import type { ProjectProfitability } from "./project-profitability";

export type BusinessCoachSeverity = "info" | "warning" | "critical" | "positive";

export type BusinessCoachInsight = {
  code: string;
  severity: BusinessCoachSeverity;
  title: string;
  message: string;
};

export type BusinessCoachInput = {
  profitability: ProjectProfitability;
  targetMarginRate: number;
};

export function buildBusinessCoachInsights(input: BusinessCoachInput): BusinessCoachInsight[] {
  const { profitability } = input;
  const targetMarginRate = Number.isFinite(input.targetMarginRate)
    ? Math.max(0, Math.min(100, input.targetMarginRate))
    : 0;
  const insights: BusinessCoachInsight[] = [];

  if (profitability.revenueHt <= 0) {
    insights.push({
      code: "missing_revenue",
      severity: "info",
      title: "Revenu à renseigner",
      message: "Renseignez le revenu HT du chantier avant d’analyser sa rentabilité.",
    });
    return insights;
  }

  if (profitability.actualMargin < 0) {
    insights.push({
      code: "project_loss",
      severity: "critical",
      title: "Chantier déficitaire",
      message: `Le chantier perd ${Math.abs(profitability.actualMargin).toFixed(2)} € HT sur les coûts enregistrés.`,
    });
  } else if (profitability.actualMarginRate < targetMarginRate) {
    insights.push({
      code: "margin_below_target",
      severity: "warning",
      title: "Marge sous l’objectif",
      message: `La marge réelle est de ${profitability.actualMarginRate} %, sous l’objectif de ${targetMarginRate} %.`,
    });
  } else {
    insights.push({
      code: "margin_on_target",
      severity: "positive",
      title: "Marge conforme",
      message: `La marge réelle atteint ${profitability.actualMarginRate} %, au-dessus de l’objectif de ${targetMarginRate} %.`,
    });
  }

  if (profitability.costVariance !== null && profitability.costVariance > 0) {
    insights.push({
      code: "cost_overrun",
      severity: profitability.costVarianceRate !== null && profitability.costVarianceRate >= 20 ? "critical" : "warning",
      title: "Dépassement de coûts",
      message: `Les coûts réels dépassent le prévu de ${profitability.costVariance.toFixed(2)} €${profitability.costVarianceRate === null ? "" : ` (${profitability.costVarianceRate} %)`}.`,
    });
  }

  if (profitability.labourHoursVariance !== null && profitability.labourHoursVariance > 0) {
    insights.push({
      code: "labour_overrun",
      severity: "warning",
      title: "Temps de travail supérieur au prévu",
      message: `Le chantier a demandé ${profitability.labourHoursVariance} h de plus que l’estimation.`,
    });
  }

  const mainCost = [
    ["main-d’œuvre", profitability.labourCost],
    ["matières", profitability.materialCost],
    ["déplacements", profitability.travelCost],
    ["sous-traitance", profitability.subcontractCost],
    ["autres coûts", profitability.otherCost],
  ] as const;
  const largest = mainCost.reduce((best, item) => item[1] > best[1] ? item : best, mainCost[0]);
  if (profitability.actualCost > 0 && largest[1] / profitability.actualCost >= 0.55) {
    insights.push({
      code: "cost_concentration",
      severity: "info",
      title: "Poste de coût dominant",
      message: `Le poste « ${largest[0]} » représente la majorité du coût réel du chantier.`,
    });
  }

  return insights;
}
