import {
  calculateCopilotProposalMetrics,
  createCopilotProposalLine,
  DEFAULT_COPILOT_COMPANY_SETTINGS,
  mergeCopilotCatalog,
  roundCopilot,
} from "./business-engine";
import type {
  CopilotCatalogService,
  CopilotCompanySettings,
  CopilotProposal,
  CopilotProposalLine,
  UpholsteryDecoratorFacts,
  UpholsteryDecoratorInterpretation,
} from "./types";

type UnknownRecord = Record<string, unknown>;

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

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseSpokenNumber(value: string | undefined) {
  if (!value) return null;
  const numeric = Number(value.replace(",", "."));
  if (Number.isFinite(numeric)) return numeric;
  return FRENCH_NUMBERS[normalizeText(value)] ?? null;
}

function finiteNumber(value: unknown, minimum: number, maximum: number) {
  const parsed = typeof value === "number"
    ? value
    : typeof value === "string"
      ? Number(value.replace(",", "."))
      : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) return null;
  return roundCopilot(parsed, 2);
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function customerHintFromText(raw: string) {
  const prepared = raw
    .replace(/\bM\.\s*/g, "Monsieur ")
    .replace(/\bMme\.?\s*/gi, "Madame ");
  const match = prepared.match(/(?:chez|client(?:e)?\s+)([^,.;]+?)(?=\s+(?:pour|avec|sur|je|on)\b|[,.;]|$)/i);
  return match?.[1]?.trim().replace(/^(?:monsieur|madame)\s+/i, "") ?? "";
}

function detectItemKind(text: string): UpholsteryDecoratorFacts["itemKind"] {
  if (/fauteuil|bergere|crapaud|voltaire|cabriolet/.test(text)) return "fauteuil";
  if (/canape|banquette/.test(text)) return "canape";
  if (/chaise/.test(text)) return "chaise";
  if (/rideau|voilage|double rideau/.test(text)) return "rideau";
  if (/tenture/.test(text)) return "tenture";
  if (/siege|mobilier|coussin|tete de lit/.test(text)) return "autre";
  return null;
}

function detectItemLabel(raw: string, kind: UpholsteryDecoratorFacts["itemKind"]) {
  const text = normalizeText(raw);
  const knownStyles = ["voltaire", "crapaud", "bergere", "cabriolet"];
  const style = knownStyles.find((candidate) => text.includes(candidate));
  if (style) return `${kind === "fauteuil" ? "Fauteuil" : "Siège"} ${style[0].toUpperCase()}${style.slice(1)}`;
  if (kind === "canape") return "Canapé";
  if (kind === "chaise") return "Chaise";
  if (kind === "rideau") return "Rideau";
  if (kind === "tenture") return "Tenture";
  if (kind === "fauteuil") return "Fauteuil";
  return "";
}

function detectItemCount(text: string) {
  const itemPattern = "(?:fauteuils?|voltaire|crapauds?|bergeres?|cabriolets?|canapes?|banquettes?|chaises?|rideaux?|tentures?|sieges?|coussins?)";
  const match = text.match(new RegExp(`(\\d+|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze)\\s+${itemPattern}`, "i"));
  const parsed = parseSpokenNumber(match?.[1]);
  if (parsed !== null) return Math.max(0, Math.round(parsed));
  return new RegExp(itemPattern, "i").test(text) ? 1 : 0;
}

function detectFabricMeters(text: string) {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:m|metres?|metre lineaire|ml)\s+(?:de\s+)?tissu/i)
    ?? text.match(/tissu[^\d]{0,30}(\d+(?:[.,]\d+)?)\s*(?:m|metres?|ml)/i);
  return match?.[1] ? roundCopilot(Number(match[1].replace(",", ".")), 2) : null;
}

function detectLabourHours(text: string) {
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*(?:h|heures?)\s+(?:de\s+)?(?:travail|main d oeuvre|atelier)/i)
    ?? text.match(/(?:travail|main d oeuvre|atelier)[^\d]{0,30}(\d+(?:[.,]\d+)?)\s*(?:h|heures?)/i);
  return match?.[1] ? roundCopilot(Number(match[1].replace(",", ".")), 2) : null;
}

export function interpretUpholsteryDecoratorDescription(description: string): UpholsteryDecoratorInterpretation {
  const text = normalizeText(description);
  const itemKind = detectItemKind(text);
  const itemCount = detectItemCount(text);
  const itemLabel = detectItemLabel(description, itemKind);
  const traditional = /traditionnel|crin|ressort|sanglage/.test(text);
  const foam = /mousse|bultex/.test(text);
  const technique: UpholsteryDecoratorFacts["technique"] = traditional && foam
    ? "mixte"
    : traditional
      ? "traditionnelle"
      : foam
        ? "mousse"
        : null;
  const includeStripping = /degarniss|degarni|depose de la garniture|mise a nu/.test(text);
  const includeUpholsteryWork = /garniture|regarnir|refection|refaire|restauration/.test(text);
  const includeCovering = /tissu|recouvr|couverture|houssage/.test(text);
  const fabricProvidedBy: UpholsteryDecoratorFacts["fabricProvidedBy"] =
    /(?:client|cliente)[^.;,]{0,30}(?:fournit|fourni|apporte)[^.;,]{0,20}tissu|tissu[^.;,]{0,30}(?:client|cliente)/.test(text)
      ? "client"
      : /(?:je|nous|artisan)[^.;,]{0,30}(?:fournis|fournit|fournissons)[^.;,]{0,20}tissu|tissu[^.;,]{0,30}(?:artisan|atelier)/.test(text)
        ? "artisan"
        : "unknown";
  const fabricMeters = detectFabricMeters(text);
  const includeTrim = /passementerie|galon|passepoil|clous? decoratifs?|finition cloutee/.test(text);
  const trimProvidedBy: UpholsteryDecoratorFacts["trimProvidedBy"] = includeTrim
    ? /(?:client|cliente)[^.;,]{0,30}(?:fournit|fourni|apporte)[^.;,]{0,30}(?:galon|passementerie|passepoil)|(?:galon|passementerie|passepoil)[^.;,]{0,30}(?:client|cliente)/.test(text)
      ? "client"
      : /(?:je|nous|artisan)[^.;,]{0,30}(?:fournis|fournit|fournissons|change)[^.;,]{0,30}(?:galon|passementerie|passepoil)|(?:galon|passementerie|passepoil)[^.;,]{0,30}(?:artisan|atelier)/.test(text)
        ? "artisan"
        : "unknown"
    : "unknown";
  const includePickup = /recuper|enlev|ramass|collect|viens? chercher/.test(text);
  const includeDelivery = /livr|ramen|rapporte|retour chez|depose chez/.test(text);
  const labourHours = detectLabourHours(text);

  const understoodData: string[] = [];
  const assumptions: string[] = [];
  const missingInformation: string[] = [];
  const potentialOmissions: string[] = [];

  if (itemKind && itemCount > 0) understoodData.push(`${itemCount} ${itemLabel || itemKind}${itemCount > 1 ? "(s)" : ""}.`);
  if (technique === "traditionnelle") understoodData.push("Garniture traditionnelle comprise.");
  if (technique === "mousse") understoodData.push("Garniture mousse comprise.");
  if (technique === "mixte") understoodData.push("Technique mixte traditionnelle / mousse comprise.");
  if (includeStripping) understoodData.push("Dégarnissage ou mise à nu demandé.");
  if (fabricProvidedBy === "client") understoodData.push("Tissu fourni par le client.");
  if (fabricProvidedBy === "artisan") understoodData.push("Tissu fourni par l’artisan.");
  if (fabricMeters !== null) understoodData.push(`Métrage de tissu indiqué : ${fabricMeters} m.`);
  if (includeTrim) understoodData.push("Finition de passementerie / galon comprise.");
  if (includeDelivery) understoodData.push("Livraison ou retour au client demandé.");
  if (labourHours !== null) understoodData.push(`Temps d’atelier indiqué : ${labourHours} h.`);

  if (!itemKind || itemCount <= 0) missingInformation.push("Préciser le type de pièce à tapisser et la quantité.");
  if (!includeStripping && !includeUpholsteryWork && !includeCovering && !includeTrim) {
    missingInformation.push("Préciser les travaux à réaliser : dégarnissage, garniture, couverture ou finition.");
  }
  if (includeUpholsteryWork && technique === null) {
    missingInformation.push("Préciser la technique de garniture : traditionnelle, mousse ou autre méthode d’atelier.");
  }
  if (includeCovering && fabricProvidedBy === "unknown") {
    missingInformation.push("Préciser si le tissu est fourni par le client ou par l’artisan.");
  }
  if (includeCovering && fabricProvidedBy === "artisan" && fabricMeters === null) {
    missingInformation.push("Indiquer le métrage de tissu à fournir ou utiliser un ouvrage entreprise avec métrage validé.");
  }
  if (includeTrim && trimProvidedBy === "unknown") {
    missingInformation.push("Préciser qui fournit la passementerie, le galon ou le passepoil.");
  }

  if (!includePickup && !includeDelivery) potentialOmissions.push("Enlèvement et livraison éventuels du mobilier.");
  if (!/etat|abime|structure|bois|carcasse/.test(text)) potentialOmissions.push("État de la carcasse et réparations éventuelles après dégarnissage.");
  if (includeCovering && fabricMeters === null) potentialOmissions.push("Métrage réel du tissu, raccords et sens du motif à confirmer.");

  const facts: UpholsteryDecoratorFacts = {
    itemKind,
    itemLabel,
    itemCount,
    technique,
    includeStripping,
    includeUpholsteryWork,
    includeCovering,
    fabricProvidedBy,
    fabricMeters,
    includeTrim,
    trimProvidedBy,
    includePickup,
    includeDelivery,
    labourHours,
  };

  const confidenceBase = 0.5
    + (itemKind ? 0.12 : 0)
    + (itemCount > 0 ? 0.08 : 0)
    + (technique ? 0.08 : 0)
    + (fabricProvidedBy !== "unknown" ? 0.08 : 0)
    + (includeStripping || includeUpholsteryWork || includeCovering ? 0.08 : 0)
    - missingInformation.length * 0.08;

  return {
    trade: "upholstery_decorator",
    jobType: "upholstery_furniture",
    customerHint: customerHintFromText(description),
    title: itemLabel ? `Tapisserie – ${itemLabel}` : "Travaux de tapisserie et décoration",
    facts,
    understoodData,
    assumptions,
    missingInformation,
    potentialOmissions,
    confidence: Math.max(0.1, Math.min(0.99, roundCopilot(confidenceBase, 2))),
  };
}

export function normalizeUpholsteryDecoratorAiInterpretation(
  description: string,
  raw: unknown,
): UpholsteryDecoratorInterpretation {
  const fallback = interpretUpholsteryDecoratorDescription(description);
  if (!isRecord(raw)) return fallback;
  const rawFacts = isRecord(raw.facts) ? raw.facts : raw;

  const itemKinds = new Set(["fauteuil", "canape", "chaise", "rideau", "tenture", "autre"]);
  const techniques = new Set(["traditionnelle", "mousse", "mixte"]);
  const providers = new Set(["client", "artisan", "unknown"]);

  const itemKindValue = cleanText(rawFacts.item_kind ?? rawFacts.itemKind, 40);
  const techniqueValue = cleanText(rawFacts.technique, 40);
  const fabricProviderValue = cleanText(rawFacts.fabric_provided_by ?? rawFacts.fabricProvidedBy, 40);
  const trimProviderValue = cleanText(rawFacts.trim_provided_by ?? rawFacts.trimProvidedBy, 40);

  const itemKind = itemKinds.has(itemKindValue)
    ? itemKindValue as UpholsteryDecoratorFacts["itemKind"]
    : fallback.facts.itemKind;
  const itemCount = Math.round(finiteNumber(rawFacts.item_count ?? rawFacts.itemCount, 0, 500) ?? fallback.facts.itemCount);
  const technique = techniques.has(techniqueValue)
    ? techniqueValue as UpholsteryDecoratorFacts["technique"]
    : fallback.facts.technique;
  const fabricProvidedBy = providers.has(fabricProviderValue)
    ? fabricProviderValue as UpholsteryDecoratorFacts["fabricProvidedBy"]
    : fallback.facts.fabricProvidedBy;
  const trimProvidedBy = providers.has(trimProviderValue)
    ? trimProviderValue as UpholsteryDecoratorFacts["trimProvidedBy"]
    : fallback.facts.trimProvidedBy;

  const facts: UpholsteryDecoratorFacts = {
    itemKind,
    itemLabel: cleanText(rawFacts.item_label ?? rawFacts.itemLabel, 160) || fallback.facts.itemLabel,
    itemCount,
    technique,
    includeStripping: optionalBoolean(rawFacts.include_stripping ?? rawFacts.includeStripping) ?? fallback.facts.includeStripping,
    includeUpholsteryWork: optionalBoolean(rawFacts.include_upholstery_work ?? rawFacts.includeUpholsteryWork) ?? fallback.facts.includeUpholsteryWork,
    includeCovering: optionalBoolean(rawFacts.include_covering ?? rawFacts.includeCovering) ?? fallback.facts.includeCovering,
    fabricProvidedBy,
    fabricMeters: finiteNumber(rawFacts.fabric_meters ?? rawFacts.fabricMeters, 0.01, 10_000) ?? fallback.facts.fabricMeters,
    includeTrim: optionalBoolean(rawFacts.include_trim ?? rawFacts.includeTrim) ?? fallback.facts.includeTrim,
    trimProvidedBy,
    includePickup: optionalBoolean(rawFacts.include_pickup ?? rawFacts.includePickup) ?? fallback.facts.includePickup,
    includeDelivery: optionalBoolean(rawFacts.include_delivery ?? rawFacts.includeDelivery) ?? fallback.facts.includeDelivery,
    labourHours: finiteNumber(rawFacts.labour_hours ?? rawFacts.labourHours, 0.01, 10_000) ?? fallback.facts.labourHours,
  };

  const normalized = interpretUpholsteryDecoratorDescription(description);
  const mergedDescription = [
    facts.itemKind && facts.itemCount > 0 ? `${facts.itemCount} ${facts.itemLabel || facts.itemKind}` : "",
    facts.technique ? `garniture ${facts.technique}` : "",
    facts.includeStripping ? "dégarnissage" : "",
    facts.includeCovering ? `couverture tissu ${facts.fabricProvidedBy}` : "",
    facts.includeTrim ? `passementerie ${facts.trimProvidedBy}` : "",
    facts.includeDelivery ? "livraison" : "",
  ].filter(Boolean).join(", ");
  const rebuilt = mergedDescription
    ? interpretUpholsteryDecoratorDescription(`${description}. Données structurées confirmées : ${mergedDescription}.`)
    : normalized;

  return {
    ...rebuilt,
    customerHint: cleanText(raw.customer_hint ?? raw.customerHint, 160) || fallback.customerHint,
    title: cleanText(raw.title, 180) || rebuilt.title,
    facts,
    confidence: finiteNumber(raw.confidence, 0, 1) ?? rebuilt.confidence,
  };
}

export const DEFAULT_UPHOLSTERY_DECORATOR_CATALOG: CopilotCatalogService[] = [
  {
    code: "upholstery_stripping",
    label: "Dégarnissage",
    description: "Dégarnissage et mise à nu de la pièce avant réfection.",
    unit: "unite",
    unitPriceHt: 0,
    materialCostPerUnit: 0,
    labourHoursPerUnit: 0,
    taxRate: 20,
    source: "template_default",
  },
  {
    code: "upholstery_traditional_rebuild",
    label: "Garniture traditionnelle",
    description: "Réfection de la garniture selon la méthode traditionnelle validée par l’atelier.",
    unit: "unite",
    unitPriceHt: 0,
    materialCostPerUnit: 0,
    labourHoursPerUnit: 0,
    taxRate: 20,
    source: "template_default",
  },
  {
    code: "upholstery_foam_rebuild",
    label: "Garniture mousse",
    description: "Réfection de la garniture mousse selon la méthode de l’atelier.",
    unit: "unite",
    unitPriceHt: 0,
    materialCostPerUnit: 0,
    labourHoursPerUnit: 0,
    taxRate: 20,
    source: "template_default",
  },
  {
    code: "upholstery_mixed_rebuild",
    label: "Garniture mixte",
    description: "Réfection combinant techniques traditionnelles et mousse selon le besoin.",
    unit: "unite",
    unitPriceHt: 0,
    materialCostPerUnit: 0,
    labourHoursPerUnit: 0,
    taxRate: 20,
    source: "template_default",
  },
  {
    code: "upholstery_covering",
    label: "Couverture et finition tissu",
    description: "Pose, tension et finition du tissu sur la pièce préparée.",
    unit: "unite",
    unitPriceHt: 0,
    materialCostPerUnit: 0,
    labourHoursPerUnit: 0,
    taxRate: 20,
    source: "template_default",
  },
  {
    code: "upholstery_fabric_supply",
    label: "Fourniture de tissu",
    description: "Fourniture du tissu par l’atelier selon le métrage confirmé.",
    unit: "ml",
    unitPriceHt: 0,
    materialCostPerUnit: 0,
    labourHoursPerUnit: 0,
    taxRate: 20,
    source: "template_default",
  },
  {
    code: "upholstery_trim_finish",
    label: "Passementerie et finition",
    description: "Pose de galon, passementerie ou passepoil selon la finition demandée.",
    unit: "unite",
    unitPriceHt: 0,
    materialCostPerUnit: 0,
    labourHoursPerUnit: 0,
    taxRate: 20,
    source: "template_default",
  },
  {
    code: "upholstery_transport",
    label: "Enlèvement / livraison",
    description: "Transport du mobilier selon les modalités convenues avec le client.",
    unit: "forfait",
    unitPriceHt: 0,
    materialCostPerUnit: 0,
    labourHoursPerUnit: 0,
    taxRate: 20,
    source: "template_default",
  },
];

export const DEFAULT_UPHOLSTERY_COMPANY_SETTINGS: CopilotCompanySettings = {
  ...DEFAULT_COPILOT_COMPANY_SETTINGS,
  defaultTaxRate: 20,
};

export function buildUpholsteryDecoratorProposal(
  interpretation: UpholsteryDecoratorInterpretation,
  options?: {
    catalog?: CopilotCatalogService[];
    settings?: Partial<CopilotCompanySettings>;
  },
): CopilotProposal<UpholsteryDecoratorInterpretation> {
  const settings = { ...DEFAULT_UPHOLSTERY_COMPANY_SETTINGS, ...(options?.settings ?? {}) };
  const catalog = mergeCopilotCatalog(DEFAULT_UPHOLSTERY_DECORATOR_CATALOG, options?.catalog ?? []);
  const facts = interpretation.facts;
  const lines: CopilotProposalLine[] = [];

  const append = (code: string, quantity: number) => {
    const line = createCopilotProposalLine(catalog, code, quantity, settings);
    if (line) lines.push(line);
  };

  if (facts.includeStripping) append("upholstery_stripping", facts.itemCount);
  if (facts.includeUpholsteryWork) {
    if (facts.technique === "traditionnelle") append("upholstery_traditional_rebuild", facts.itemCount);
    if (facts.technique === "mousse") append("upholstery_foam_rebuild", facts.itemCount);
    if (facts.technique === "mixte") append("upholstery_mixed_rebuild", facts.itemCount);
  }
  if (facts.includeCovering) append("upholstery_covering", facts.itemCount);
  if (facts.includeCovering && facts.fabricProvidedBy === "artisan" && facts.fabricMeters !== null) {
    append("upholstery_fabric_supply", facts.fabricMeters);
  }
  if (facts.includeTrim) append("upholstery_trim_finish", facts.itemCount);
  if (facts.includePickup || facts.includeDelivery) append("upholstery_transport", 1);

  const questions = [...interpretation.missingInformation];
  for (const line of lines) {
    if (line.unitPriceHt <= 0) {
      questions.push(`Renseigner le tarif entreprise pour « ${line.label} » avant de créer le devis.`);
    } else if (line.source === "template_default") {
      questions.push(`Confirmer le tarif métier proposé pour « ${line.label} ».`);
    }
  }

  const metrics = calculateCopilotProposalMetrics(lines, settings);
  const hasMissingPricing = lines.some((line) => line.unitPriceHt <= 0);

  return {
    status: interpretation.missingInformation.length > 0 || lines.length === 0 || hasMissingPricing
      ? "needs_information"
      : "ready_for_review",
    interpretation,
    lines,
    questions: [...new Set(questions)],
    metrics,
  };
}
