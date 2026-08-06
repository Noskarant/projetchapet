import type {
  CopilotCatalogService,
  CopilotCompanySettings,
  CopilotInterpretation,
  CopilotProposal,
  CopilotProposalLine,
  InteriorPaintingFacts,
} from "./types";

const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
};

const FRENCH_NUMBERS: Record<string, number> = {
  zero: 0,
  un: 1,
  une: 1,
  deux: 2,
  trois: 3,
  quatre: 4,
  cinq: 5,
  six: 6,
  sept: 7,
  huit: 8,
  neuf: 9,
  dix: 10,
  onze: 11,
  douze: 12,
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/m²/g, "m2")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSpokenNumber(value: string | undefined) {
  if (!value) return null;
  const numeric = Number(value.replace(",", "."));
  if (Number.isFinite(numeric)) return numeric;
  return FRENCH_NUMBERS[normalizeText(value)] ?? null;
}

function extractArea(text: string, labels: string[]) {
  const joined = labels.join("|");
  const before = text.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*m2\\s*(?:de\\s*)?(?:${joined})`, "i"));
  if (before?.[1]) return round(Number(before[1].replace(",", ".")), 2);
  const after = text.match(new RegExp(`(?:${joined})[^\\d]{0,40}(\\d+(?:[.,]\\d+)?)\\s*m2`, "i"));
  if (after?.[1]) return round(Number(after[1].replace(",", ".")), 2);
  return null;
}

function extractFloorArea(text: string) {
  const explicit = extractArea(text, ["surface(?: au sol)?", "appartement", "logement", "maison", "piece", "sejour"]);
  if (explicit !== null) return explicit;

  const generic = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*m2/g)]
    .map((match) => ({ value: Number(match[1].replace(",", ".")), index: match.index ?? 0 }))
    .find((entry) => {
      const context = text.slice(Math.max(0, entry.index - 35), entry.index + 35);
      return !/mur|plafond|porte|facade|sol a peindre/.test(context);
    });
  return generic ? round(generic.value, 2) : null;
}

function extractDoorCount(text: string) {
  const numeric = text.match(/(\d+|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)\s+portes?/i);
  return Math.max(0, Math.round(parseSpokenNumber(numeric?.[1]) ?? 0));
}

function customerHintFromText(raw: string) {
  const prepared = raw
    .replace(/\bM\.\s*/g, "Monsieur ")
    .replace(/\bMme\.?\s*/gi, "Madame ");
  const match = prepared.match(/(?:chez|client(?:e)?\s+)([^,.;]+?)(?=\s+(?:pour|dans|avec|sur|debut|début|a\s+peindre|à\s+peindre)\b|[,.;]|$)/i);
  return match?.[1]?.trim().replace(/^(?:monsieur|madame)\s+/i, "") ?? "";
}

export function interpretInteriorPaintingDescription(description: string): CopilotInterpretation {
  const text = normalizeText(description);
  const assumptions: string[] = [];
  const missingInformation: string[] = [];
  const understoodData: string[] = [];
  const potentialOmissions: string[] = [];

  const floorAreaM2 = extractFloorArea(text);
  let wallAreaM2 = extractArea(text, ["murs?", "parois?"]);
  let ceilingAreaM2 = extractArea(text, ["plafonds?"]);
  const doorCount = extractDoorCount(text);

  const includeWalls = /mur|paroi|appartement|logement|piece|sejour|repeindre|peinture/.test(text)
    && !/(sans|hors)\s+(?:les\s+)?murs?/.test(text);
  const includeCeilings = /plafond/.test(text) && !/(sans|hors)\s+(?:les\s+)?plafonds?/.test(text);
  const includeDoors = doorCount > 0 || (/porte/.test(text) && !/(sans|hors)\s+(?:les\s+)?portes?/.test(text));
  const hasCracks = /fissure|microfissure|rebouchage/.test(text);
  const finishLevel = /premium|haut de gamme|lessivable|velours superieur|velours supérieur/.test(description.toLowerCase())
    ? "premium"
    : "standard";

  if (floorAreaM2 !== null) understoodData.push(`Surface au sol comprise : ${floorAreaM2} m².`);
  if (wallAreaM2 !== null) understoodData.push(`Surface de murs comprise : ${wallAreaM2} m².`);
  if (ceilingAreaM2 !== null) understoodData.push(`Surface de plafonds comprise : ${ceilingAreaM2} m².`);
  if (doorCount > 0) understoodData.push(`${doorCount} porte${doorCount > 1 ? "s" : ""} à peindre.`);
  if (hasCracks) understoodData.push("Présence de fissures ou reprises à traiter.");

  if (includeWalls && wallAreaM2 === null && floorAreaM2 !== null) {
    wallAreaM2 = round(floorAreaM2 * 2.4, 2);
    assumptions.push(`Surface de murs estimée à ${wallAreaM2} m² à partir de ${floorAreaM2} m² au sol (coefficient 2,4).`);
  }
  if (includeCeilings && ceilingAreaM2 === null && floorAreaM2 !== null) {
    ceilingAreaM2 = floorAreaM2;
    assumptions.push(`Surface de plafonds estimée à ${ceilingAreaM2} m², égale à la surface au sol.`);
  }

  if (includeWalls && wallAreaM2 === null) missingInformation.push("Indiquer la surface de murs à peindre.");
  if (includeCeilings && ceilingAreaM2 === null) missingInformation.push("Indiquer la surface de plafonds à peindre.");
  if (!includeWalls && !includeCeilings && !includeDoors) {
    missingInformation.push("Préciser les éléments à peindre : murs, plafonds ou portes.");
  }

  if (!/protection/.test(text)) potentialOmissions.push("Protection des sols, meubles et parties communes.");
  if (!/nettoyage|evacuation|évacuation/.test(description.toLowerCase())) potentialOmissions.push("Nettoyage de fin de chantier et évacuation des consommables.");
  if (!/deplacement|déplacement/.test(description.toLowerCase())) potentialOmissions.push("Frais de déplacement éventuels.");
  if (!/sous-couche|sous couche|impression|primaire/.test(description.toLowerCase())) potentialOmissions.push("Sous-couche ou impression selon l’état du support.");

  const facts: InteriorPaintingFacts = {
    floorAreaM2,
    wallAreaM2,
    ceilingAreaM2,
    doorCount,
    hasCracks,
    includeWalls,
    includeCeilings,
    includeDoors,
    includeProtection: true,
    includeCleaning: true,
    finishLevel,
  };

  const confidenceBase = 0.58
    + (wallAreaM2 !== null ? 0.12 : 0)
    + (ceilingAreaM2 !== null ? 0.08 : 0)
    + (doorCount > 0 ? 0.06 : 0)
    + (floorAreaM2 !== null ? 0.06 : 0)
    - assumptions.length * 0.04
    - missingInformation.length * 0.12;

  return {
    trade: "interior_painting",
    jobType: "interior_painting_apartment",
    customerHint: customerHintFromText(description),
    title: "Travaux de peinture intérieure",
    facts,
    understoodData,
    assumptions,
    missingInformation,
    potentialOmissions,
    confidence: Math.max(0.1, Math.min(0.99, round(confidenceBase, 2))),
  };
}

export const DEFAULT_INTERIOR_PAINTING_CATALOG: CopilotCatalogService[] = [
  {
    code: "site_protection",
    label: "Protection du chantier",
    description: "Protection des sols, meubles et zones de passage avant travaux.",
    unit: "forfait",
    unitPriceHt: 160,
    materialCostPerUnit: 35,
    labourHoursPerUnit: 3,
    taxRate: 10,
    source: "template_default",
  },
  {
    code: "support_preparation",
    label: "Préparation des supports",
    description: "Lessivage léger, grattage, rebouchage courant et ponçage avant mise en peinture.",
    unit: "m2",
    unitPriceHt: 8.5,
    materialCostPerUnit: 1.2,
    labourHoursPerUnit: 0.11,
    taxRate: 10,
    source: "template_default",
  },
  {
    code: "crack_repair",
    label: "Traitement des fissures",
    description: "Ouverture, rebouchage, ponçage et reprise locale des fissures signalées.",
    unit: "forfait",
    unitPriceHt: 180,
    materialCostPerUnit: 25,
    labourHoursPerUnit: 4,
    taxRate: 10,
    source: "template_default",
  },
  {
    code: "primer",
    label: "Impression ou sous-couche",
    description: "Application d’une impression adaptée avant les couches de finition.",
    unit: "m2",
    unitPriceHt: 7.5,
    materialCostPerUnit: 1.8,
    labourHoursPerUnit: 0.07,
    taxRate: 10,
    source: "template_default",
  },
  {
    code: "wall_paint_2_coats",
    label: "Peinture des murs – deux couches",
    description: "Application de deux couches de peinture de finition sur murs préparés.",
    unit: "m2",
    unitPriceHt: 24,
    materialCostPerUnit: 4.8,
    labourHoursPerUnit: 0.18,
    taxRate: 10,
    source: "template_default",
  },
  {
    code: "ceiling_paint_2_coats",
    label: "Peinture des plafonds – deux couches",
    description: "Application de deux couches de peinture de finition sur plafonds préparés.",
    unit: "m2",
    unitPriceHt: 27,
    materialCostPerUnit: 5.2,
    labourHoursPerUnit: 0.22,
    taxRate: 10,
    source: "template_default",
  },
  {
    code: "door_paint",
    label: "Peinture des portes",
    description: "Préparation et mise en peinture d’une porte sur ses faces accessibles.",
    unit: "unite",
    unitPriceHt: 95,
    materialCostPerUnit: 18,
    labourHoursPerUnit: 1.6,
    taxRate: 10,
    source: "template_default",
  },
  {
    code: "final_cleaning",
    label: "Nettoyage de fin de chantier",
    description: "Retrait des protections et nettoyage courant de la zone de travail.",
    unit: "forfait",
    unitPriceHt: 90,
    materialCostPerUnit: 15,
    labourHoursPerUnit: 1.5,
    taxRate: 10,
    source: "template_default",
  },
  {
    code: "travel",
    label: "Déplacement",
    description: "Déplacement local de l’équipe et acheminement courant du petit matériel.",
    unit: "forfait",
    unitPriceHt: 45,
    materialCostPerUnit: 20,
    labourHoursPerUnit: 0.5,
    taxRate: 10,
    source: "template_default",
  },
];

export const DEFAULT_COMPANY_SETTINGS: CopilotCompanySettings = {
  hourlyCost: 28,
  targetMarginRate: 30,
  defaultTaxRate: 10,
  includeTravelFee: true,
};

function mergeCatalog(overrides: CopilotCatalogService[]) {
  const merged = new Map(DEFAULT_INTERIOR_PAINTING_CATALOG.map((item) => [item.code, item]));
  for (const override of overrides) merged.set(override.code, { ...override, source: "company_catalog" });
  return merged;
}

function createLine(
  catalog: Map<string, CopilotCatalogService>,
  code: string,
  quantity: number,
  settings: CopilotCompanySettings,
): CopilotProposalLine | null {
  const service = catalog.get(code);
  if (!service || quantity <= 0) return null;
  const saleTotalHt = round(quantity * service.unitPriceHt);
  const materialCost = round(quantity * service.materialCostPerUnit);
  const labourHours = round(quantity * service.labourHoursPerUnit, 2);
  const labourCost = round(labourHours * settings.hourlyCost);
  const estimatedCost = round(materialCost + labourCost);
  const estimatedMargin = round(saleTotalHt - estimatedCost);
  const marginRate = saleTotalHt > 0 ? round((estimatedMargin / saleTotalHt) * 100, 1) : 0;
  return {
    code,
    label: service.label,
    description: service.description,
    quantity: round(quantity, 2),
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
      : "Estimation générique à confirmer",
  };
}

export function buildInteriorPaintingProposal(
  interpretation: CopilotInterpretation,
  options?: {
    catalog?: CopilotCatalogService[];
    settings?: Partial<CopilotCompanySettings>;
  },
): CopilotProposal {
  const settings = { ...DEFAULT_COMPANY_SETTINGS, ...(options?.settings ?? {}) };
  const catalog = mergeCatalog(options?.catalog ?? []);
  const facts = interpretation.facts;
  const lines: CopilotProposalLine[] = [];
  const paintedArea = round((facts.wallAreaM2 ?? 0) + (facts.ceilingAreaM2 ?? 0), 2);

  const append = (code: string, quantity: number) => {
    const line = createLine(catalog, code, quantity, settings);
    if (line) lines.push(line);
  };

  if (facts.includeProtection && paintedArea > 0) append("site_protection", 1);
  if (paintedArea > 0) append("support_preparation", paintedArea);
  if (facts.hasCracks && paintedArea > 0) append("crack_repair", 1);
  if (paintedArea > 0) append("primer", paintedArea);
  if (facts.includeWalls && facts.wallAreaM2) append("wall_paint_2_coats", facts.wallAreaM2);
  if (facts.includeCeilings && facts.ceilingAreaM2) append("ceiling_paint_2_coats", facts.ceilingAreaM2);
  if (facts.includeDoors && facts.doorCount > 0) append("door_paint", facts.doorCount);
  if (facts.includeCleaning && lines.length > 0) append("final_cleaning", 1);
  if (settings.includeTravelFee && lines.length > 0) append("travel", 1);

  const totals = lines.reduce(
    (acc, line) => ({
      saleTotalHt: acc.saleTotalHt + line.saleTotalHt,
      materialCost: acc.materialCost + line.materialCost,
      labourHours: acc.labourHours + line.labourHours,
      labourCost: acc.labourCost + line.labourCost,
      estimatedCost: acc.estimatedCost + line.estimatedCost,
      estimatedMargin: acc.estimatedMargin + line.estimatedMargin,
    }),
    { saleTotalHt: 0, materialCost: 0, labourHours: 0, labourCost: 0, estimatedCost: 0, estimatedMargin: 0 },
  );

  const saleTotalHt = round(totals.saleTotalHt);
  const estimatedMargin = round(totals.estimatedMargin);
  const marginRate = saleTotalHt > 0 ? round((estimatedMargin / saleTotalHt) * 100, 1) : 0;
  const questions = [...interpretation.missingInformation];
  if (lines.some((line) => line.source === "template_default")) {
    questions.push("Confirmer ou remplacer les tarifs génériques par le catalogue réel de l’entreprise.");
  }

  return {
    status: interpretation.missingInformation.length > 0 || lines.length === 0 ? "needs_information" : "ready_for_review",
    interpretation,
    lines,
    questions,
    metrics: {
      saleTotalHt,
      materialCost: round(totals.materialCost),
      labourHours: round(totals.labourHours, 2),
      labourCost: round(totals.labourCost),
      estimatedCost: round(totals.estimatedCost),
      estimatedMargin,
      marginRate,
      targetMarginRate: settings.targetMarginRate,
      marginAlert: saleTotalHt > 0 && marginRate < settings.targetMarginRate
        ? `Marge estimée à ${marginRate} %, sous l’objectif de ${settings.targetMarginRate} %.`
        : null,
    },
  };
}
