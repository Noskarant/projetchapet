import {
  calculateCopilotProposalMetrics,
  createCopilotProposalLine,
  DEFAULT_COPILOT_COMPANY_SETTINGS,
  mergeCopilotCatalog,
  roundCopilot,
} from "./business-engine";
import type {
  AnyCopilotInterpretation,
  CopilotCatalogService,
  CopilotCompanySettings,
  CopilotProposal,
  CopilotProposalLine,
  CopilotUnit,
  StructuredCopilotTrade,
  StructuredTradeInterpretation,
  StructuredTradeServiceFact,
} from "./types";

type UnknownRecord = Record<string, unknown>;

type StructuredServiceDefinition = CopilotCatalogService & {
  patterns: RegExp[];
  quantityPatterns?: RegExp[];
  requiresExplicitQuantity?: boolean;
  defaultQuantity?: number;
  clarification?: string;
};

export type StructuredTradeDefinition = {
  trade: StructuredCopilotTrade;
  label: string;
  shortLabel: string;
  description: string;
  vocabulary: string[];
  services: StructuredServiceDefinition[];
  potentialOmissions: string[];
};

const NUMBER_WORDS: Record<string, number> = {
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
  treize: 13,
  quatorze: 14,
  quinze: 15,
  seize: 16,
  dixsept: 17,
  dixhuit: 18,
  dixneuf: 19,
  vingt: 20,
};

const NUMBER_TOKEN = "(\\d+(?:[.,]\\d+)?|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix[- ]?sept|dix[- ]?huit|dix[- ]?neuf|vingt)";

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/²/g, "2")
    .replace(/[’']/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseSpokenNumber(value: string | undefined) {
  if (!value) return null;
  const normalized = normalizeText(value).replace(/[ -]/g, "");
  const numeric = Number(normalized.replace(",", "."));
  if (Number.isFinite(numeric)) return numeric;
  return NUMBER_WORDS[normalized] ?? null;
}

function matches(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => new RegExp(pattern.source, pattern.flags.replace("g", "")).test(text));
}

function lastCapturedNumber(text: string, patterns: RegExp[]) {
  let last: number | null = null;
  let lastIndex = -1;
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const regex = new RegExp(pattern.source, flags);
    for (const match of text.matchAll(regex)) {
      const parsed = parseSpokenNumber(match[1]);
      if (parsed !== null && parsed >= 0 && (match.index ?? -1) >= lastIndex) {
        last = parsed;
        lastIndex = match.index ?? lastIndex;
      }
    }
  }
  return last === null ? null : roundCopilot(last, 2);
}

function quantityFor(text: string, service: StructuredServiceDefinition) {
  const explicit = service.quantityPatterns?.length
    ? lastCapturedNumber(text, service.quantityPatterns)
    : null;
  if (explicit !== null && explicit > 0) return explicit;
  if (service.requiresExplicitQuantity) return null;
  return service.defaultQuantity ?? 1;
}

function customerHintFromText(raw: string) {
  const prepared = raw.replace(/\bM\.\s*/g, "Monsieur ").replace(/\bMme\.?\s*/gi, "Madame ");
  const match = prepared.match(/(?:chez|client(?:e)?\s+)([^,.;]+?)(?=\s+(?:pour|avec|sur|je|on|il|elle|nous)\b|[,.;]|$)/i);
  return match?.[1]?.trim().replace(/^(?:monsieur|madame)\s+/i, "") ?? "";
}

function defaultService(
  code: string,
  label: string,
  description: string,
  unit: CopilotUnit,
  patterns: RegExp[],
  options: Partial<Pick<StructuredServiceDefinition, "quantityPatterns" | "requiresExplicitQuantity" | "defaultQuantity" | "clarification">> = {},
): StructuredServiceDefinition {
  return {
    code,
    label,
    description,
    unit,
    unitPriceHt: 0,
    materialCostPerUnit: 0,
    labourHoursPerUnit: 0,
    taxRate: 20,
    source: "template_default",
    patterns,
    ...options,
  };
}

const unitCount = (words: string) => [
  new RegExp(`${NUMBER_TOKEN}\\s*(?:${words})`, "i"),
  new RegExp(`(?:${words})\\s*(?:x\\s*)?${NUMBER_TOKEN}`, "i"),
];
const metres = (words: string) => [
  new RegExp(`${NUMBER_TOKEN}\\s*(?:m|metres?)\\s*(?:de\\s+)?(?:${words})`, "i"),
  new RegExp(`(?:${words})[^\\d]{0,24}${NUMBER_TOKEN}\\s*(?:m|metres?)`, "i"),
];
const squareMetres = (words: string) => [
  new RegExp(`${NUMBER_TOKEN}\\s*(?:m2|metres? carres?)\\s*(?:de\\s+)?(?:${words})`, "i"),
  new RegExp(`(?:${words})[^\\d]{0,24}${NUMBER_TOKEN}\\s*(?:m2|metres? carres?)`, "i"),
];

export const STRUCTURED_TRADE_DEFINITIONS: Record<StructuredCopilotTrade, StructuredTradeDefinition> = {
  plumbing_heating: {
    trade: "plumbing_heating",
    label: "Plombier / chauffagiste / climaticien",
    shortLabel: "Plomberie & chauffage",
    description: "Sanitaires, réseaux, chauffage, chaudière, pompe à chaleur et dépannage.",
    vocabulary: ["PER", "multicouche", "cuivre", "nourrice", "WC", "vasque", "radiateur", "chaudière", "PAC", "climatisation"],
    services: [
      defaultService("plumbing_fixture", "Pose d’équipement sanitaire", "Pose ou remplacement d’un équipement sanitaire.", "unite", [/wc|toilettes?|lavabo|vasque|evier|douche|baignoire|robinet|mitigeur/], { quantityPatterns: unitCount("wc|toilettes?|lavabos?|vasques?|eviers?|douches?|baignoires?|robinets?|mitigeurs?") }),
      defaultService("plumbing_pipe", "Réseau de plomberie", "Création ou remplacement de réseau PER, multicouche ou cuivre.", "m", [/\bper\b|multicouche|cuivre|tuyauterie|canalisation|reseau (?:eau|sanitaire)/], { quantityPatterns: metres("per|multicouche|cuivre|tuyauterie|canalisation|reseau"), requiresExplicitQuantity: true, clarification: "Indiquer la longueur de réseau à poser." }),
      defaultService("heating_radiator", "Pose de radiateur", "Pose ou remplacement d’un radiateur.", "unite", [/radiateurs?|seche[- ]?serviette/], { quantityPatterns: unitCount("radiateurs?|seche[- ]?serviettes?") }),
      defaultService("heating_boiler", "Chaudière", "Pose ou remplacement d’une chaudière avec raccordements à préciser.", "unite", [/chaudiere/], { quantityPatterns: unitCount("chaudieres?") }),
      defaultService("heating_heat_pump", "Pompe à chaleur", "Pose d’une pompe à chaleur ou unité de climatisation.", "unite", [/pompe a chaleur|\bpac\b|climatisation|climatiseur|split/], { quantityPatterns: unitCount("pompes? a chaleur|pac|splits?|climatiseurs?") }),
      defaultService("plumbing_repair", "Dépannage plomberie / chauffage", "Recherche de panne, fuite ou intervention de dépannage.", "forfait", [/depannage|recherche de fuite|fuite|debouchage|panne/]),
    ],
    potentialOmissions: ["Dépose et évacuation de l’existant.", "Percements, rebouchages et reprises de finition.", "Mise en service, essais et réglages éventuels."],
  },
  electrician: {
    trade: "electrician",
    label: "Électricien",
    shortLabel: "Électricité",
    description: "Prises, éclairage, circuits, câblage, tableau et diagnostic électrique.",
    vocabulary: ["2P+T", "DCL", "ICTA", "disjoncteur", "différentiel", "tableau", "circuit", "prise", "point lumineux"],
    services: [
      defaultService("electrical_socket", "Prise de courant", "Création ou remplacement d’une prise de courant.", "unite", [/prises?|2p\+t/], { quantityPatterns: unitCount("prises?|2p\\+t") }),
      defaultService("electrical_light", "Point lumineux / DCL", "Création ou remplacement d’un point lumineux ou DCL.", "unite", [/points? lumineux|\bdcl\b|applique|plafonnier|luminaire/], { quantityPatterns: unitCount("points? lumineux|dcl|appliques?|plafonniers?|luminaires?") }),
      defaultService("electrical_circuit", "Circuit électrique", "Création ou modification d’un circuit protégé.", "unite", [/circuits?|ligne dediee|ligne specialisee/], { quantityPatterns: unitCount("circuits?|lignes? dediees?|lignes? specialisees?") }),
      defaultService("electrical_panel", "Tableau électrique", "Pose, remplacement ou modification d’un tableau électrique.", "unite", [/tableau electrique|coffret electrique|tableau divisionnaire/]),
      defaultService("electrical_cable", "Câblage / gaine", "Tirage de câble, conducteur ou gaine ICTA.", "m", [/cablage|cables?|conducteurs?|gaine icta|\bicta\b/], { quantityPatterns: metres("cablage|cables?|conducteurs?|gaine icta|icta"), requiresExplicitQuantity: true, clarification: "Indiquer la longueur de câblage ou de gaine à prévoir." }),
      defaultService("electrical_diagnostic", "Diagnostic / recherche de panne", "Diagnostic électrique et recherche de défaut.", "forfait", [/diagnostic|recherche de panne|panne electrique|defaut electrique/]),
    ],
    potentialOmissions: ["Cheminement apparent ou encastré et saignées éventuelles.", "Rebouchage et reprises après encastrement.", "Repérage, essais et mise en conformité du tableau."],
  },
  carpentry_joinery: {
    trade: "carpentry_joinery",
    label: "Menuisier / agenceur",
    shortLabel: "Menuiserie & agencement",
    description: "Menuiseries, mobilier sur mesure, agencement, plans de travail et finitions de pose.",
    vocabulary: ["menuiserie", "agencement", "MDF", "contreplaqué", "caisson", "façade", "quincaillerie", "plan de travail"],
    services: [
      defaultService("joinery_opening", "Menuiserie extérieure / intérieure", "Pose ou remplacement de porte, fenêtre ou baie.", "unite", [/fenetres?|portes?|baies? vitrees?|bloc[- ]?porte/], { quantityPatterns: unitCount("fenetres?|portes?|baies? vitrees?|blocs?[- ]?portes?") }),
      defaultService("joinery_custom_furniture", "Mobilier / agencement sur mesure", "Fabrication d’un meuble, placard, bibliothèque ou agencement sur mesure.", "unite", [/placard|bibliotheque|meuble sur mesure|caisson|dressing|agencement/], { quantityPatterns: unitCount("placards?|bibliotheques?|meubles?|caissons?|dressings?") }),
      defaultService("joinery_worktop", "Plan de travail", "Fabrication, adaptation ou pose d’un plan de travail.", "m", [/plan de travail/], { quantityPatterns: metres("plans? de travail"), requiresExplicitQuantity: true, clarification: "Indiquer la longueur du plan de travail." }),
      defaultService("joinery_skirting", "Plinthes / habillages linéaires", "Fourniture et pose de plinthes ou habillages linéaires.", "ml", [/plinthes?|couvre[- ]?joint|habillage lineaire/], { quantityPatterns: metres("plinthes?|couvre[- ]?joints?|habillage lineaire"), requiresExplicitQuantity: true, clarification: "Indiquer le métrage linéaire des plinthes ou habillages." }),
      defaultService("joinery_installation", "Pose / ajustage menuiserie", "Pose, ajustage, réglage et finitions de menuiserie.", "forfait", [/pose seule|ajustage|reglage|mise en jeu|finition de pose/]),
    ],
    potentialOmissions: ["Quincaillerie, poignées et ferrures spécifiques.", "Dépose et évacuation de l’existant.", "Finitions, joints, retouches et protection des ouvrages."],
  },
  tiling_flooring: {
    trade: "tiling_flooring",
    label: "Carreleur / solier / parqueteur",
    shortLabel: "Carrelage & sols",
    description: "Carrelage, faïence, parquet, sols souples, préparation des supports et étanchéité.",
    vocabulary: ["carrelage", "faïence", "ragréage", "SPEC", "natte", "parquet", "LVT", "PVC", "plinthes"],
    services: [
      defaultService("floor_tiling", "Carrelage au sol", "Pose de carrelage au sol avec joints.", "m2", [/carrelage (?:au )?sol|carreler (?:le )?sol|gres cerame/], { quantityPatterns: squareMetres("carrelage|gres cerame"), requiresExplicitQuantity: true, clarification: "Indiquer la surface de carrelage au sol." }),
      defaultService("wall_tiling", "Faïence / carrelage mural", "Pose de faïence ou carrelage mural.", "m2", [/faience|carrelage mural|credence/], { quantityPatterns: squareMetres("faience|carrelage mural|credence"), requiresExplicitQuantity: true, clarification: "Indiquer la surface de faïence ou carrelage mural." }),
      defaultService("floor_covering", "Parquet / sol souple", "Pose de parquet, PVC, LVT, lino ou moquette.", "m2", [/parquet|sol pvc|\blvt\b|lino|linoleum|moquette|sol souple/], { quantityPatterns: squareMetres("parquet|sol pvc|lvt|lino|linoleum|moquette|sol souple"), requiresExplicitQuantity: true, clarification: "Indiquer la surface de revêtement de sol." }),
      defaultService("floor_preparation", "Préparation / ragréage", "Préparation du support, ragréage ou remise à niveau.", "m2", [/ragreage|preparation (?:du )?support|remise a niveau/], { quantityPatterns: squareMetres("ragreage|preparation (?:du )?support|remise a niveau"), requiresExplicitQuantity: true, clarification: "Indiquer la surface à préparer ou ragréer." }),
      defaultService("floor_waterproofing", "Étanchéité sous carrelage", "Système de protection à l’eau sous carrelage ou natte d’étanchéité.", "m2", [/\bspec\b|etancheite sous carrelage|natte d etancheite/], { quantityPatterns: squareMetres("spec|etancheite sous carrelage|natte d etancheite"), requiresExplicitQuantity: true, clarification: "Indiquer la surface d’étanchéité sous carrelage." }),
      defaultService("floor_skirting", "Plinthes", "Fourniture et pose de plinthes.", "ml", [/plinthes?/], { quantityPatterns: metres("plinthes?"), requiresExplicitQuantity: true, clarification: "Indiquer le métrage linéaire de plinthes." }),
    ],
    potentialOmissions: ["Dépose de l’ancien revêtement et évacuation.", "État, planéité et humidité du support.", "Seuils, profils de finition, joints périphériques et découpes complexes."],
  },
  roofing: {
    trade: "roofing",
    label: "Couvreur / zingueur",
    shortLabel: "Couverture & zinguerie",
    description: "Couverture, écran, faîtage, rives, gouttières, solins et fenêtres de toit.",
    vocabulary: ["tuiles", "ardoises", "faîtage", "rive", "solin", "gouttière", "zinc", "Velux", "écran sous-toiture"],
    services: [
      defaultService("roof_covering", "Couverture", "Réfection ou pose de couverture en tuiles, ardoises ou matériau indiqué.", "m2", [/couverture|tuiles?|ardoises?|bac acier/], { quantityPatterns: squareMetres("couverture|tuiles?|ardoises?|bac acier"), requiresExplicitQuantity: true, clarification: "Indiquer la surface de couverture." }),
      defaultService("roof_underlay", "Écran sous-toiture", "Pose ou remplacement d’un écran sous-toiture.", "m2", [/ecran sous[- ]?toiture|pare[- ]?pluie sous toiture/], { quantityPatterns: squareMetres("ecran sous[- ]?toiture|pare[- ]?pluie"), requiresExplicitQuantity: true, clarification: "Indiquer la surface d’écran sous-toiture." }),
      defaultService("roof_ridge", "Faîtage / rives", "Réfection ou pose de faîtage et rives.", "ml", [/faitage|rives?/], { quantityPatterns: metres("faitage|rives?"), requiresExplicitQuantity: true, clarification: "Indiquer le métrage de faîtage ou de rives." }),
      defaultService("roof_gutter", "Gouttière / descente", "Pose ou remplacement de gouttières et descentes.", "ml", [/gouttieres?|descentes? (?:ep|eaux pluviales)|zinguerie/], { quantityPatterns: metres("gouttieres?|descentes?|zinguerie"), requiresExplicitQuantity: true, clarification: "Indiquer le métrage de gouttière, descente ou zinguerie." }),
      defaultService("roof_flashing", "Solin / abergement", "Réalisation ou reprise de solin, abergement ou raccord d’étanchéité.", "ml", [/solins?|abergement|raccord d etancheite/], { quantityPatterns: metres("solins?|abergement|raccord d etancheite"), requiresExplicitQuantity: true, clarification: "Indiquer le métrage de solin ou d’abergement." }),
      defaultService("roof_window", "Fenêtre de toit", "Pose ou remplacement d’une fenêtre de toit.", "unite", [/velux|fenetre de toit/], { quantityPatterns: unitCount("velux|fenetres? de toit") }),
      defaultService("roof_scaffolding", "Échafaudage / accès", "Mise en place d’un accès ou échafaudage nécessaire au chantier.", "forfait", [/echafaudage|nacelle|acces toiture/]),
    ],
    potentialOmissions: ["Échafaudage, protection collective et accès au toit.", "État du support, liteaux et charpente après dépose.", "Évacuation des gravats et matériaux déposés."],
  },
  masonry: {
    trade: "masonry",
    label: "Maçon",
    shortLabel: "Maçonnerie",
    description: "Murs, dalles, chapes, ouvertures, fondations et démolition de maçonnerie.",
    vocabulary: ["parpaing", "béton", "dalle", "chape", "linteau", "semelle", "fondation", "ouverture", "démolition"],
    services: [
      defaultService("masonry_wall", "Mur en maçonnerie", "Création ou reprise de mur en parpaing, brique ou bloc.", "m2", [/parpaings?|briques?|mur en blocs?|maconnerie de mur/], { quantityPatterns: squareMetres("parpaings?|briques?|mur en blocs?|maconnerie"), requiresExplicitQuantity: true, clarification: "Indiquer la surface du mur à réaliser." }),
      defaultService("masonry_slab", "Dalle béton", "Réalisation d’une dalle béton.", "m2", [/dalle beton|dallage/], { quantityPatterns: squareMetres("dalle beton|dallage"), requiresExplicitQuantity: true, clarification: "Indiquer la surface de dalle béton." }),
      defaultService("masonry_screed", "Chape", "Réalisation d’une chape traditionnelle ou fluide selon le chantier.", "m2", [/chape/], { quantityPatterns: squareMetres("chape"), requiresExplicitQuantity: true, clarification: "Indiquer la surface de chape." }),
      defaultService("masonry_opening", "Création / modification d’ouverture", "Création d’ouverture avec linteau ou renfort à préciser.", "unite", [/creation d ouverture|ouvrir un mur|ouverture dans (?:un )?mur|linteau/], { quantityPatterns: unitCount("ouvertures?|linteaux?") }),
      defaultService("masonry_footing", "Fondation / semelle", "Réalisation de fondation ou semelle filante.", "ml", [/semelle|fondation filante/], { quantityPatterns: metres("semelle|fondation filante"), requiresExplicitQuantity: true, clarification: "Indiquer le métrage de fondation ou semelle." }),
      defaultService("masonry_demolition", "Démolition de maçonnerie", "Démolition d’un ouvrage maçonné avec évacuation à chiffrer séparément si nécessaire.", "m2", [/demolition|demolir|depose de mur/], { quantityPatterns: squareMetres("demolition|mur a demolir|depose de mur"), requiresExplicitQuantity: true, clarification: "Indiquer la surface de maçonnerie à démolir." }),
    ],
    potentialOmissions: ["Ferraillage, coffrage et épaisseur des ouvrages béton.", "Étude structurelle / renforts pour les ouvertures porteuses.", "Terrassement, évacuation des gravats et reprises de finition."],
  },
  landscaping: {
    trade: "landscaping",
    label: "Paysagiste / jardinier",
    shortLabel: "Paysage & extérieur",
    description: "Gazon, haies, plantations, terrasses, clôtures, terrassement léger et entretien extérieur.",
    vocabulary: ["gazon", "engazonnement", "haie", "plantation", "massif", "pavage", "terrasse", "clôture", "élagage"],
    services: [
      defaultService("landscape_lawn", "Engazonnement", "Préparation et engazonnement d’une surface.", "m2", [/engazonnement|gazon|semis de pelouse/], { quantityPatterns: squareMetres("engazonnement|gazon|pelouse"), requiresExplicitQuantity: true, clarification: "Indiquer la surface à engazonner." }),
      defaultService("landscape_hedge", "Haie", "Plantation, reprise ou entretien d’une haie.", "ml", [/haies?/], { quantityPatterns: metres("haies?"), requiresExplicitQuantity: true, clarification: "Indiquer le métrage linéaire de haie." }),
      defaultService("landscape_planting", "Plantations", "Plantation d’arbres, arbustes ou végétaux.", "unite", [/plantation|arbustes?|arbres?|vegetaux|vivaces?/], { quantityPatterns: unitCount("arbustes?|arbres?|vegetaux|vivaces?|plants?") }),
      defaultService("landscape_paving", "Terrasse / pavage", "Création d’une terrasse, dallage ou pavage extérieur.", "m2", [/terrasse|pavage|dallage exterieur|paves?/], { quantityPatterns: squareMetres("terrasse|pavage|dallage|paves?"), requiresExplicitQuantity: true, clarification: "Indiquer la surface de terrasse ou pavage." }),
      defaultService("landscape_fence", "Clôture", "Fourniture et pose de clôture ou occultation.", "ml", [/cloture|grillage|ganivelle|palissade/], { quantityPatterns: metres("cloture|grillage|ganivelle|palissade"), requiresExplicitQuantity: true, clarification: "Indiquer le métrage linéaire de clôture." }),
      defaultService("landscape_pruning", "Élagage / taille", "Taille ou élagage d’arbres et arbustes.", "unite", [/elagage|elaguer|taille d arbre|abattage/], { quantityPatterns: unitCount("arbres?|sujets?") }),
      defaultService("landscape_earthwork", "Terrassement / préparation de terrain", "Terrassement ou préparation de terrain à chiffrer selon volume, accès et engins.", "forfait", [/terrassement|decaissement|nivellement|preparation de terrain/]),
    ],
    potentialOmissions: ["Accès des engins et évacuation des terres / déchets verts.", "Fourniture de terre, amendements, paillage et arrosage.", "Préparation du support et fondations pour terrasses ou clôtures."],
  },
  locksmith_metalwork: {
    trade: "locksmith_metalwork",
    label: "Serrurier / métallier",
    shortLabel: "Serrurerie & métallerie",
    description: "Serrures, ouverture de porte, garde-corps, mains courantes, portails et ouvrages métalliques.",
    vocabulary: ["serrure", "cylindre", "barillet", "porte blindée", "garde-corps", "main courante", "portail", "acier", "soudure"],
    services: [
      defaultService("locksmith_lock", "Serrure / cylindre", "Pose ou remplacement de serrure, cylindre ou barillet.", "unite", [/serrures?|cylindres?|barillets?|verrou/], { quantityPatterns: unitCount("serrures?|cylindres?|barillets?|verrous?") }),
      defaultService("locksmith_emergency", "Ouverture / dépannage", "Ouverture de porte ou dépannage de serrurerie.", "forfait", [/ouverture de porte|porte claquee|porte bloquee|depannage serrurerie/]),
      defaultService("metal_railing", "Garde-corps", "Fabrication et pose de garde-corps métallique.", "ml", [/garde[- ]?corps/], { quantityPatterns: metres("garde[- ]?corps"), requiresExplicitQuantity: true, clarification: "Indiquer le métrage linéaire de garde-corps." }),
      defaultService("metal_handrail", "Main courante", "Fabrication et pose d’une main courante métallique.", "ml", [/main courante/], { quantityPatterns: metres("mains? courantes?"), requiresExplicitQuantity: true, clarification: "Indiquer le métrage de main courante." }),
      defaultService("metal_gate", "Portail / portillon", "Fabrication, fourniture ou pose de portail / portillon.", "unite", [/portails?|portillons?/], { quantityPatterns: unitCount("portails?|portillons?") }),
      defaultService("metal_fabrication", "Fabrication métallique sur mesure", "Fabrication ou modification d’un ouvrage acier, inox ou aluminium.", "forfait", [/fabrication metallique|structure acier|ouvrage acier|soudure|metallerie sur mesure/]),
    ],
    potentialOmissions: ["Prise de cotes, plans et validation des dimensions.", "Traitement anticorrosion, galvanisation, thermolaquage ou peinture.", "Dépose, scellements, alimentation électrique et maçonnerie éventuelle."],
  },
};

function serviceFactsFromDescription(description: string, definition: StructuredTradeDefinition) {
  const text = normalizeText(description);
  return definition.services.flatMap<StructuredTradeServiceFact>((service) => {
    if (!matches(text, service.patterns)) return [];
    return [{
      serviceCode: service.code,
      quantity: quantityFor(text, service),
      unit: service.unit,
      detail: service.label,
    }];
  });
}

export function interpretStructuredTradeDescription(
  description: string,
  definition: StructuredTradeDefinition,
): StructuredTradeInterpretation {
  const services = serviceFactsFromDescription(description, definition);
  const missingInformation: string[] = [];
  const understoodData: string[] = [];
  const serviceByCode = new Map(definition.services.map((service) => [service.code, service]));

  for (const fact of services) {
    const service = serviceByCode.get(fact.serviceCode);
    if (!service) continue;
    if (fact.quantity === null) {
      missingInformation.push(service.clarification ?? `Préciser la quantité pour « ${service.label} ».`);
    } else {
      understoodData.push(`${service.label} : ${fact.quantity} ${service.unit}.`);
    }
  }

  if (!services.length) {
    missingInformation.push(`Décrire au moins une prestation de ${definition.shortLabel.toLowerCase()} à chiffrer.`);
  }

  const confidence = Math.max(0.15, Math.min(0.98, roundCopilot(
    0.45 + Math.min(services.length, 5) * 0.09 - missingInformation.length * 0.08,
    2,
  )));
  const customerHint = customerHintFromText(description);

  return {
    trade: definition.trade,
    jobType: "structured_trade_job",
    customerHint,
    title: customerHint ? `${definition.shortLabel} – ${customerHint}` : `Travaux de ${definition.shortLabel.toLowerCase()}`,
    facts: { services },
    understoodData,
    assumptions: [],
    missingInformation,
    potentialOmissions: services.length ? [...definition.potentialOmissions] : [],
    confidence,
  };
}

export function normalizeStructuredTradeAiInterpretation(
  description: string,
  raw: unknown,
  definition: StructuredTradeDefinition,
): StructuredTradeInterpretation {
  const fallback = interpretStructuredTradeDescription(description, definition);
  if (!isRecord(raw)) return fallback;
  const rawFacts = isRecord(raw.facts) ? raw.facts : raw;
  const rawServices = Array.isArray(rawFacts.services) ? rawFacts.services : [];
  const defaults = new Map(definition.services.map((service) => [service.code, service]));
  const local = new Map(fallback.facts.services.map((service) => [service.serviceCode, service]));
  const merged = new Map(local);

  for (const candidate of rawServices.slice(0, 30)) {
    if (!isRecord(candidate)) continue;
    const code = typeof candidate.service_code === "string"
      ? candidate.service_code.trim()
      : typeof candidate.serviceCode === "string"
        ? candidate.serviceCode.trim()
        : "";
    const service = defaults.get(code);
    if (!service || merged.has(code)) continue;
    merged.set(code, {
      serviceCode: code,
      // La quantité IA n'est jamais acceptée seule : elle doit être extraite de façon déterministe du texte.
      quantity: service.requiresExplicitQuantity ? null : (service.defaultQuantity ?? 1),
      unit: service.unit,
      detail: typeof candidate.detail === "string" ? candidate.detail.trim().slice(0, 240) : service.label,
    });
  }

  const services = [...merged.values()];
  if (services.length === fallback.facts.services.length) return fallback;
  return interpretStructuredTradeDescription(
    `${description}\n${services.map((fact) => defaults.get(fact.serviceCode)?.label ?? "").filter(Boolean).join(". ")}`,
    definition,
  );
}

export function buildStructuredTradeProposal(
  interpretation: StructuredTradeInterpretation,
  definition: StructuredTradeDefinition,
  options?: {
    catalog?: CopilotCatalogService[];
    settings?: Partial<CopilotCompanySettings>;
  },
): CopilotProposal<StructuredTradeInterpretation> {
  const settings = { ...DEFAULT_COPILOT_COMPANY_SETTINGS, ...(options?.settings ?? {}) };
  const defaults = definition.services.map(({ patterns: _patterns, quantityPatterns: _quantityPatterns, requiresExplicitQuantity: _requires, defaultQuantity: _defaultQuantity, clarification: _clarification, ...service }) => service);
  const catalog = mergeCopilotCatalog(defaults, options?.catalog ?? []);
  const serviceByCode = new Map(definition.services.map((service) => [service.code, service]));
  const lines: CopilotProposalLine[] = [];
  const questions = [...interpretation.missingInformation];

  for (const fact of interpretation.facts.services) {
    const service = serviceByCode.get(fact.serviceCode);
    if (!service) continue;
    if (fact.quantity === null || fact.quantity <= 0) {
      questions.push(service.clarification ?? `Préciser la quantité pour « ${service.label} ».`);
      continue;
    }
    const line = createCopilotProposalLine(catalog, service.code, fact.quantity, settings);
    if (line) lines.push(line);
  }

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
    status: questions.length > 0 || lines.length === 0 || hasMissingPricing ? "needs_information" : "ready_for_review",
    interpretation,
    lines,
    questions: [...new Set(questions)],
    metrics,
  };
}

export function structuredTradeDefaultCatalog(definition: StructuredTradeDefinition): CopilotCatalogService[] {
  return definition.services.map(({ patterns: _patterns, quantityPatterns: _quantityPatterns, requiresExplicitQuantity: _requires, defaultQuantity: _defaultQuantity, clarification: _clarification, ...service }) => service);
}

export function structuredTradeAiPrompt(definition: StructuredTradeDefinition) {
  const serviceCodes = definition.services.map((service) => `- ${service.code}: ${service.label} (${service.unit})`).join("\n");
  return `Tu extrais uniquement des faits explicites d'un chantier de ${definition.label} pour un artisan français.\nTu ne calcules aucun prix, aucune marge, aucun total, aucun temps de travail et aucune quantité absente.\nN'invente jamais une mesure. Si la quantité n'est pas explicitement exprimée, mets null.\nCodes de prestations autorisés :\n${serviceCodes}\nRéponds uniquement avec ce JSON strict :\n{\n  "customer_hint": "",\n  "title": "",\n  "facts": {\n    "services": [\n      { "service_code": "", "quantity": null, "unit": null, "detail": "" }\n    ]\n  },\n  "confidence": 0\n}`;
}

export function isStructuredTradeInterpretation(
  interpretation: AnyCopilotInterpretation,
): interpretation is StructuredTradeInterpretation {
  return interpretation.jobType === "structured_trade_job";
}
