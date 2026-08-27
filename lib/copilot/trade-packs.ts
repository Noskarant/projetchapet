import { normalizeInteriorPaintingAiInterpretation } from "./ai-normalization";
import {
  buildInteriorPaintingProposal,
  DEFAULT_COMPANY_SETTINGS,
  DEFAULT_INTERIOR_PAINTING_CATALOG,
  interpretInteriorPaintingDescription,
} from "./interior-painting";
import {
  buildUpholsteryDecoratorProposal,
  DEFAULT_UPHOLSTERY_COMPANY_SETTINGS,
  DEFAULT_UPHOLSTERY_DECORATOR_CATALOG,
  interpretUpholsteryDecoratorDescription,
  normalizeUpholsteryDecoratorAiInterpretation,
} from "./upholstery-decorator";
import type {
  AnyCopilotInterpretation,
  AnyCopilotProposal,
  CopilotCatalogService,
  CopilotCompanySettings,
  CopilotInterpretation,
  CopilotTrade,
  UpholsteryDecoratorInterpretation,
} from "./types";

export const DEFAULT_COPILOT_TRADE: CopilotTrade = "interior_painting";

export type CopilotTradePack = {
  trade: CopilotTrade;
  version: number;
  label: string;
  shortLabel: string;
  description: string;
  vocabulary: string[];
  defaultCatalog: CopilotCatalogService[];
  defaultSettings: CopilotCompanySettings;
  aiSystemPrompt: string;
  interpretLocal: (description: string) => AnyCopilotInterpretation;
  normalizeAi: (description: string, raw: unknown) => AnyCopilotInterpretation;
  buildProposal: (
    interpretation: AnyCopilotInterpretation,
    options?: {
      catalog?: CopilotCatalogService[];
      settings?: Partial<CopilotCompanySettings>;
    },
  ) => AnyCopilotProposal;
};

const PAINTING_AI_PROMPT = `Tu extrais uniquement des faits d'un chantier de peinture intérieure pour un artisan français.
Tu ne calcules aucun prix, aucune marge et aucun total. Tu n'inventes aucune surface.
Une information absente reste null. Réponds uniquement avec ce JSON strict :
{
  "customer_hint": "",
  "title": "",
  "facts": {
    "floor_area_m2": null,
    "wall_area_m2": null,
    "ceiling_area_m2": null,
    "door_count": 0,
    "has_cracks": false,
    "include_walls": false,
    "include_ceilings": false,
    "include_doors": false
  },
  "confidence": 0
}`;

const UPHOLSTERY_AI_PROMPT = `Tu extrais uniquement des faits explicites d'un travail de tapisserie d'ameublement / décoration pour un artisan français.
Tu connais le vocabulaire métier : fauteuil Voltaire, bergère, crapaud, cabriolet, dégarnissage, sanglage, ressorts, crin, garniture traditionnelle, mousse, couverture, tissu, passementerie, galon, passepoil, rideaux et tentures.
Tu ne calcules aucun prix, aucune marge, aucun total et tu n'inventes jamais un métrage, un temps de travail ou une quantité.
Si une donnée n'est pas exprimée ou certaine, utilise null, false ou "unknown" selon le champ.
Réponds uniquement avec ce JSON strict :
{
  "customer_hint": "",
  "title": "",
  "facts": {
    "item_kind": null,
    "item_label": "",
    "item_count": 0,
    "technique": null,
    "include_stripping": false,
    "include_upholstery_work": false,
    "include_covering": false,
    "fabric_provided_by": "unknown",
    "fabric_meters": null,
    "include_trim": false,
    "trim_provided_by": "unknown",
    "include_pickup": false,
    "include_delivery": false,
    "labour_hours": null
  },
  "confidence": 0
}`;

function paintingBuild(
  interpretation: AnyCopilotInterpretation,
  options?: {
    catalog?: CopilotCatalogService[];
    settings?: Partial<CopilotCompanySettings>;
  },
): AnyCopilotProposal {
  if (interpretation.trade !== "interior_painting") {
    throw new Error("Le pack peinture a reçu une interprétation d’un autre métier.");
  }
  return buildInteriorPaintingProposal(interpretation as CopilotInterpretation, options);
}

function upholsteryBuild(
  interpretation: AnyCopilotInterpretation,
  options?: {
    catalog?: CopilotCatalogService[];
    settings?: Partial<CopilotCompanySettings>;
  },
): AnyCopilotProposal {
  if (interpretation.trade !== "upholstery_decorator") {
    throw new Error("Le pack tapissier a reçu une interprétation d’un autre métier.");
  }
  return buildUpholsteryDecoratorProposal(interpretation as UpholsteryDecoratorInterpretation, options);
}

export const COPILOT_TRADE_PACKS: Record<CopilotTrade, CopilotTradePack> = {
  interior_painting: {
    trade: "interior_painting",
    version: 1,
    label: "Peintre / plâtrier-peintre",
    shortLabel: "Peinture intérieure",
    description: "Préparation des supports, murs, plafonds, portes, protection et fin de chantier.",
    vocabulary: [
      "mur",
      "plafond",
      "support",
      "enduit",
      "fissure",
      "ponçage",
      "impression",
      "sous-couche",
      "velours",
      "mat",
      "satin",
    ],
    defaultCatalog: DEFAULT_INTERIOR_PAINTING_CATALOG,
    defaultSettings: DEFAULT_COMPANY_SETTINGS,
    aiSystemPrompt: PAINTING_AI_PROMPT,
    interpretLocal: interpretInteriorPaintingDescription,
    normalizeAi: normalizeInteriorPaintingAiInterpretation,
    buildProposal: paintingBuild,
  },
  upholstery_decorator: {
    trade: "upholstery_decorator",
    version: 1,
    label: "Tapissier décorateur / tapissier d’ameublement",
    shortLabel: "Tapisserie d’ameublement",
    description: "Sièges, garnitures, tissus, passementerie, rideaux, tentures et transport du mobilier.",
    vocabulary: [
      "fauteuil",
      "Voltaire",
      "bergère",
      "crapaud",
      "cabriolet",
      "dégarnissage",
      "sanglage",
      "ressorts",
      "crin",
      "garniture traditionnelle",
      "mousse",
      "couverture",
      "passementerie",
      "galon",
      "passepoil",
      "rideau",
      "tenture",
    ],
    defaultCatalog: DEFAULT_UPHOLSTERY_DECORATOR_CATALOG,
    defaultSettings: DEFAULT_UPHOLSTERY_COMPANY_SETTINGS,
    aiSystemPrompt: UPHOLSTERY_AI_PROMPT,
    interpretLocal: interpretUpholsteryDecoratorDescription,
    normalizeAi: normalizeUpholsteryDecoratorAiInterpretation,
    buildProposal: upholsteryBuild,
  },
};

const TRADE_ALIASES: Record<string, CopilotTrade> = {
  interior_painting: "interior_painting",
  painting: "interior_painting",
  peintre: "interior_painting",
  platrier_peintre: "interior_painting",
  "plâtrier-peintre": "interior_painting",
  upholstery_decorator: "upholstery_decorator",
  tapissier: "upholstery_decorator",
  tapissier_decorateur: "upholstery_decorator",
  "tapissier-décorateur": "upholstery_decorator",
  tapissier_ameublement: "upholstery_decorator",
};

export function resolveCopilotTrade(value: unknown, fallback: CopilotTrade = DEFAULT_COPILOT_TRADE) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  const normalized = value.trim().toLowerCase();
  return TRADE_ALIASES[normalized] ?? null;
}

export function getCopilotTradePack(trade: CopilotTrade) {
  return COPILOT_TRADE_PACKS[trade];
}

export function listAvailableCopilotTradePacks() {
  return Object.values(COPILOT_TRADE_PACKS).map((pack) => ({
    trade: pack.trade,
    label: pack.label,
    shortLabel: pack.shortLabel,
    description: pack.description,
    version: pack.version,
  }));
}
