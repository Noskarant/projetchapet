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

type ServiceDefinition = CopilotCatalogService & {
  detect: RegExp[];
  quantities?: RegExp[];
  requiresQuantity?: boolean;
  question?: string;
};

export type StructuredTradeDefinition = {
  trade: StructuredCopilotTrade;
  label: string;
  shortLabel: string;
  description: string;
  vocabulary: string[];
  services: ServiceDefinition[];
  potentialOmissions: string[];
};

const WORD_NUMBERS: Record<string, number> = {
  zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5,
  six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12,
  treize: 13, quatorze: 14, quinze: 15, seize: 16, dixsept: 17,
  dixhuit: 18, dixneuf: 19, vingt: 20,
};
const N = "(\\d+(?:[.,]\\d+)?|zero|un|une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix[- ]?sept|dix[- ]?huit|dix[- ]?neuf|vingt)";

function normalize(value: string) {
  return value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/²/g, "2")
    .replace(/[’']/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function spokenNumber(value: string | undefined) {
  if (!value) return null;
  const cleaned = normalize(value).replace(/[ -]/g, "");
  const numeric = Number(cleaned.replace(",", "."));
  return Number.isFinite(numeric) ? numeric : (WORD_NUMBERS[cleaned] ?? null);
}

function hasAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => new RegExp(pattern.source, pattern.flags.replace("g", "")).test(text));
}

function lastNumber(text: string, patterns: RegExp[] = []) {
  let best: { index: number; value: number } | null = null;
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    for (const match of text.matchAll(new RegExp(pattern.source, flags))) {
      const value = spokenNumber(match[1]);
      const index = match.index ?? -1;
      if (value !== null && value > 0 && (!best || index >= best.index)) best = { index, value };
    }
  }
  return best ? roundCopilot(best.value, 2) : null;
}

const count = (words: string) => [
  new RegExp(`${N}\\s*(?:${words})(?![\\w])`, "i"),
  new RegExp(`(?:${words})\\s*(?:x|:)?\\s*${N}(?![a-z+])`, "i"),
];
const linear = (words: string) => [
  new RegExp(`${N}\\s*(?:m|metres?)\\s*(?:de\\s+)?(?:${words})`, "i"),
  new RegExp(`(?:${words})[^\\d,;.]{0,18}${N}\\s*(?:m|metres?)`, "i"),
];
const area = (words: string) => [
  new RegExp(`${N}\\s*(?:m2|metres? carres?)\\s*(?:de\\s+)?(?:${words})`, "i"),
  new RegExp(`(?:${words})[^\\d,;.]{0,18}${N}\\s*(?:m2|metres? carres?)`, "i"),
];

function service(
  code: string,
  label: string,
  description: string,
  unit: CopilotUnit,
  detect: RegExp[],
  options: Partial<Pick<ServiceDefinition, "quantities" | "requiresQuantity" | "question">> = {},
): ServiceDefinition {
  return {
    code, label, description, unit, detect,
    unitPriceHt: 0,
    materialCostPerUnit: 0,
    labourHoursPerUnit: 0,
    taxRate: 20,
    source: "template_default",
    ...options,
  };
}

export const STRUCTURED_TRADE_DEFINITIONS: Record<StructuredCopilotTrade, StructuredTradeDefinition> = {
  plumbing_heating: {
    trade: "plumbing_heating",
    label: "Plombier / chauffagiste / climaticien",
    shortLabel: "Plomberie & chauffage",
    description: "Sanitaires, réseaux, chauffage, chaudière, pompe à chaleur et dépannage.",
    vocabulary: ["PER", "multicouche", "cuivre", "WC", "vasque", "radiateur", "chaudière", "PAC", "climatisation"],
    services: [
      service("plumbing_fixture", "Pose d’équipement sanitaire", "Pose ou remplacement d’un équipement sanitaire.", "unite", [/wc|toilettes?|lavabo|vasque|evier|douche|baignoire|robinet|mitigeur/], { quantities: count("wc|toilettes?|lavabos?|vasques?|eviers?|douches?|baignoires?|robinets?|mitigeurs?") }),
      service("plumbing_pipe", "Réseau de plomberie", "Création ou remplacement de réseau PER, multicouche ou cuivre.", "m", [/\bper\b|multicouche|cuivre|tuyauterie|canalisation|reseau (?:eau|sanitaire)/], { quantities: linear("per|multicouche|cuivre|tuyauterie|canalisation|reseau"), requiresQuantity: true, question: "Indiquer la longueur de réseau à poser." }),
      service("heating_radiator", "Pose de radiateur", "Pose ou remplacement d’un radiateur.", "unite", [/radiateurs?|seche[- ]?serviette/], { quantities: count("radiateurs?|seche[- ]?serviettes?") }),
      service("heating_boiler", "Chaudière", "Pose ou remplacement d’une chaudière avec raccordements à préciser.", "unite", [/chaudiere/], { quantities: count("chaudieres?") }),
      service("heating_heat_pump", "Pompe à chaleur / climatisation", "Pose d’une pompe à chaleur ou unité de climatisation.", "unite", [/pompe a chaleur|\bpac\b|climatisation|climatiseur|split/], { quantities: count("pompes? a chaleur|pac|splits?|climatiseurs?") }),
      service("plumbing_repair", "Dépannage plomberie / chauffage", "Recherche de panne, fuite ou intervention de dépannage.", "forfait", [/depannage|recherche de fuite|fuite|debouchage|panne/]),
    ],
    potentialOmissions: ["Dépose et évacuation de l’existant.", "Percements, rebouchages et reprises de finition.", "Mise en service, essais et réglages éventuels."],
  },
  electrician: {
    trade: "electrician",
    label: "Électricien",
    shortLabel: "Électricité",
    description: "Prises, éclairage, circuits, câblage, tableau et diagnostic électrique.",
    vocabulary: ["2P+T", "DCL", "ICTA", "disjoncteur", "différentiel", "tableau", "circuit", "prise"],
    services: [
      service("electrical_socket", "Prise de courant", "Création ou remplacement d’une prise de courant.", "unite", [/prises?|2p\+t/], { quantities: count("prises?|2p\\+t") }),
      service("electrical_light", "Point lumineux / DCL", "Création ou remplacement d’un point lumineux ou DCL.", "unite", [/points? lumineux|\bdcl\b|applique|plafonnier|luminaire/], { quantities: count("points? lumineux|dcl|appliques?|plafonniers?|luminaires?") }),
      service("electrical_circuit", "Circuit électrique", "Création ou modification d’un circuit protégé.", "unite", [/circuits?|ligne dediee|ligne specialisee/], { quantities: count("circuits?|lignes? dediees?|lignes? specialisees?") }),
      service("electrical_panel", "Tableau électrique", "Pose, remplacement ou modification d’un tableau électrique.", "unite", [/tableau electrique|coffret electrique|tableau divisionnaire/]),
      service("electrical_cable", "Câblage / gaine", "Tirage de câble, conducteur ou gaine ICTA.", "m", [/cablage|cables?|conducteurs?|gaine icta|\bicta\b/], { quantities: linear("cablage|cables?|conducteurs?|gaine icta|icta"), requiresQuantity: true, question: "Indiquer la longueur de câblage ou de gaine à prévoir." }),
      service("electrical_diagnostic", "Diagnostic / recherche de panne", "Diagnostic électrique et recherche de défaut.", "forfait", [/diagnostic|recherche de panne|panne electrique|defaut electrique/]),
    ],
    potentialOmissions: ["Cheminement apparent ou encastré et saignées éventuelles.", "Rebouchage et reprises après encastrement.", "Repérage, essais et mise en conformité du tableau."],
  },
  carpentry_joinery: {
    trade: "carpentry_joinery",
    label: "Menuisier / agenceur",
    shortLabel: "Menuiserie & agencement",
    description: "Menuiseries, mobilier sur mesure, agencement, plans de travail et finitions de pose.",
    vocabulary: ["menuiserie", "agencement", "MDF", "caisson", "façade", "quincaillerie", "plan de travail"],
    services: [
      service("joinery_opening", "Menuiserie extérieure / intérieure", "Pose ou remplacement de porte, fenêtre ou baie.", "unite", [/fenetres?|portes?|baies? vitrees?|bloc[- ]?porte/], { quantities: count("fenetres?|portes?|baies? vitrees?|blocs?[- ]?portes?") }),
      service("joinery_custom_furniture", "Mobilier / agencement sur mesure", "Fabrication d’un meuble, placard, bibliothèque ou agencement sur mesure.", "unite", [/placard|bibliotheque|meuble sur mesure|caisson|dressing|agencement/], { quantities: count("placards?|bibliotheques?|meubles?|caissons?|dressings?") }),
      service("joinery_worktop", "Plan de travail", "Fabrication, adaptation ou pose d’un plan de travail.", "m", [/plan de travail/], { quantities: linear("plans? de travail"), requiresQuantity: true, question: "Indiquer la longueur du plan de travail." }),
      service("joinery_skirting", "Plinthes / habillages linéaires", "Fourniture et pose de plinthes ou habillages linéaires.", "ml", [/plinthes?|couvre[- ]?joint|habillage lineaire/], { quantities: linear("plinthes?|couvre[- ]?joints?|habillage lineaire"), requiresQuantity: true, question: "Indiquer le métrage linéaire des plinthes ou habillages." }),
      service("joinery_installation", "Pose / ajustage menuiserie", "Pose, ajustage, réglage et finitions de menuiserie.", "forfait", [/pose seule|ajustage|reglage|mise en jeu|finition de pose/]),
    ],
    potentialOmissions: ["Quincaillerie, poignées et ferrures spécifiques.", "Dépose et évacuation de l’existant.", "Finitions, joints, retouches et protection des ouvrages."],
  },
  tiling_flooring: {
    trade: "tiling_flooring",
    label: "Carreleur / solier / parqueteur",
    shortLabel: "Carrelage & sols",
    description: "Carrelage, faïence, parquet, sols souples, préparation des supports et étanchéité.",
    vocabulary: ["carrelage", "faïence", "ragréage", "SPEC", "parquet", "LVT", "PVC", "plinthes"],
    services: [
      service("floor_tiling", "Carrelage au sol", "Pose de carrelage au sol avec joints.", "m2", [/carrelage (?:au )?sol|carreler (?:le )?sol|gres cerame/], { quantities: area("carrelage(?: au sol)?|gres cerame"), requiresQuantity: true, question: "Indiquer la surface de carrelage au sol." }),
      service("wall_tiling", "Faïence / carrelage mural", "Pose de faïence ou carrelage mural.", "m2", [/faience|carrelage mural|credence/], { quantities: area("faience|carrelage mural|credence"), requiresQuantity: true, question: "Indiquer la surface de faïence ou carrelage mural." }),
      service("floor_covering", "Parquet / sol souple", "Pose de parquet, PVC, LVT, lino ou moquette.", "m2", [/parquet|sol pvc|\blvt\b|lino|linoleum|moquette|sol souple/], { quantities: area("parquet|sol pvc|lvt|lino|linoleum|moquette|sol souple"), requiresQuantity: true, question: "Indiquer la surface de revêtement de sol." }),
      service("floor_preparation", "Préparation / ragréage", "Préparation du support, ragréage ou remise à niveau.", "m2", [/ragreage|preparation (?:du )?support|remise a niveau/], { quantities: area("ragreage|preparation (?:du )?support|remise a niveau"), requiresQuantity: true, question: "Indiquer la surface à préparer ou ragréer." }),
      service("floor_waterproofing", "Étanchéité sous carrelage", "Système de protection à l’eau sous carrelage ou natte d’étanchéité.", "m2", [/\bspec\b|etancheite sous carrelage|natte d etancheite/], { quantities: area("spec|etancheite sous carrelage|natte d etancheite"), requiresQuantity: true, question: "Indiquer la surface d’étanchéité sous carrelage." }),
      service("floor_skirting", "Plinthes", "Fourniture et pose de plinthes.", "ml", [/plinthes?/], { quantities: linear("plinthes?"), requiresQuantity: true, question: "Indiquer le métrage linéaire de plinthes." }),
    ],
    potentialOmissions: ["Dépose de l’ancien revêtement et évacuation.", "État, planéité et humidité du support.", "Seuils, profils de finition, joints périphériques et découpes complexes."],
  },
  roofing: {
    trade: "roofing",
    label: "Couvreur / zingueur",
    shortLabel: "Couverture & zinguerie",
    description: "Couverture, écran, faîtage, rives, gouttières, solins et fenêtres de toit.",
    vocabulary: ["tuiles", "ardoises", "faîtage", "rive", "solin", "gouttière", "zinc", "Velux"],
    services: [
      service("roof_covering", "Couverture", "Réfection ou pose de couverture en tuiles, ardoises ou matériau indiqué.", "m2", [/couverture|tuiles?|ardoises?|bac acier/], { quantities: area("couverture|tuiles?|ardoises?|bac acier"), requiresQuantity: true, question: "Indiquer la surface de couverture." }),
      service("roof_underlay", "Écran sous-toiture", "Pose ou remplacement d’un écran sous-toiture.", "m2", [/ecran sous[- ]?toiture|pare[- ]?pluie sous toiture/], { quantities: area("ecran sous[- ]?toiture|pare[- ]?pluie"), requiresQuantity: true, question: "Indiquer la surface d’écran sous-toiture." }),
      service("roof_ridge", "Faîtage / rives", "Réfection ou pose de faîtage et rives.", "ml", [/faitage|rives?/], { quantities: linear("faitage|rives?"), requiresQuantity: true, question: "Indiquer le métrage de faîtage ou de rives." }),
      service("roof_gutter", "Gouttière / descente", "Pose ou remplacement de gouttières et descentes.", "ml", [/gouttieres?|descentes? (?:ep|eaux pluviales)|zinguerie/], { quantities: linear("gouttieres?|descentes?|zinguerie"), requiresQuantity: true, question: "Indiquer le métrage de gouttière, descente ou zinguerie." }),
      service("roof_flashing", "Solin / abergement", "Réalisation ou reprise de solin, abergement ou raccord d’étanchéité.", "ml", [/solins?|abergement|raccord d etancheite/], { quantities: linear("solins?|abergement|raccord d etancheite"), requiresQuantity: true, question: "Indiquer le métrage de solin ou d’abergement." }),
      service("roof_window", "Fenêtre de toit", "Pose ou remplacement d’une fenêtre de toit.", "unite", [/velux|fenetre de toit/], { quantities: count("velux|fenetres? de toit") }),
      service("roof_scaffolding", "Échafaudage / accès", "Mise en place d’un accès ou échafaudage nécessaire au chantier.", "forfait", [/echafaudage|nacelle|acces toiture/]),
    ],
    potentialOmissions: ["Échafaudage, protection collective et accès au toit.", "État du support, liteaux et charpente après dépose.", "Évacuation des gravats et matériaux déposés."],
  },
  masonry: {
    trade: "masonry",
    label: "Maçon",
    shortLabel: "Maçonnerie",
    description: "Murs, dalles, chapes, ouvertures, fondations et démolition de maçonnerie.",
    vocabulary: ["parpaing", "béton", "dalle", "chape", "linteau", "semelle", "fondation", "démolition"],
    services: [
      service("masonry_wall", "Mur en maçonnerie", "Création ou reprise de mur en parpaing, brique ou bloc.", "m2", [/parpaings?|briques?|mur en blocs?|maconnerie de mur/], { quantities: area("parpaings?|briques?|mur en blocs?|maconnerie"), requiresQuantity: true, question: "Indiquer la surface du mur à réaliser." }),
      service("masonry_slab", "Dalle béton", "Réalisation d’une dalle béton.", "m2", [/dalle beton|dallage/], { quantities: area("dalle beton|dallage"), requiresQuantity: true, question: "Indiquer la surface de dalle béton." }),
      service("masonry_screed", "Chape", "Réalisation d’une chape traditionnelle ou fluide selon le chantier.", "m2", [/chape/], { quantities: area("chape"), requiresQuantity: true, question: "Indiquer la surface de chape." }),
      service("masonry_opening", "Création / modification d’ouverture", "Création d’ouverture avec linteau ou renfort à préciser.", "unite", [/creation (?:de |d )?ouverture|ouvrir un mur|ouverture dans (?:un )?mur|linteau/], { quantities: count("ouvertures?|linteaux?") }),
      service("masonry_footing", "Fondation / semelle", "Réalisation de fondation ou semelle filante.", "ml", [/semelle|fondation filante/], { quantities: linear("semelle|fondation filante"), requiresQuantity: true, question: "Indiquer le métrage de fondation ou semelle." }),
      service("masonry_demolition", "Démolition de maçonnerie", "Démolition d’un ouvrage maçonné avec évacuation à chiffrer séparément si nécessaire.", "m2", [/demolition|demolir|depose de mur/], { quantities: area("demolition|mur a demolir|depose de mur"), requiresQuantity: true, question: "Indiquer la surface de maçonnerie à démolir." }),
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
      service("landscape_lawn", "Engazonnement", "Préparation et engazonnement d’une surface.", "m2", [/engazonnement|gazon|semis de pelouse/], { quantities: area("engazonnement|gazon|pelouse"), requiresQuantity: true, question: "Indiquer la surface à engazonner." }),
      service("landscape_hedge", "Haie", "Plantation, reprise ou entretien d’une haie.", "ml", [/haies?/], { quantities: linear("haies?"), requiresQuantity: true, question: "Indiquer le métrage linéaire de haie." }),
      service("landscape_planting", "Plantations", "Plantation d’arbres, arbustes ou végétaux.", "unite", [/plantation|planter|arbustes?|vegetaux|vivaces?/], { quantities: count("arbustes?|arbres?|vegetaux|vivaces?|plants?") }),
      service("landscape_paving", "Terrasse / pavage", "Création d’une terrasse, dallage ou pavage extérieur.", "m2", [/terrasse pavee?|pavage|dallage exterieur|paves?/], { quantities: area("terrasse(?: pavee)?|pavage|dallage|paves?"), requiresQuantity: true, question: "Indiquer la surface de terrasse ou pavage." }),
      service("landscape_fence", "Clôture", "Fourniture et pose de clôture ou occultation.", "ml", [/cloture|grillage|ganivelle|palissade/], { quantities: linear("cloture|grillage|ganivelle|palissade"), requiresQuantity: true, question: "Indiquer le métrage linéaire de clôture." }),
      service("landscape_pruning", "Élagage / taille", "Taille ou élagage d’arbres et arbustes.", "unite", [/elagage|elaguer|taille d arbre|abattage/], { quantities: count("arbres?|sujets?") }),
      service("landscape_earthwork", "Terrassement / préparation de terrain", "Terrassement ou préparation de terrain à chiffrer selon volume, accès et engins.", "forfait", [/terrassement|decaissement|nivellement|preparation de terrain/]),
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
      service("locksmith_lock", "Serrure / cylindre", "Pose ou remplacement de serrure, cylindre ou barillet.", "unite", [/serrures?|cylindres?|barillets?|verrou/], { quantities: count("serrures?|cylindres?|barillets?|verrous?") }),
      service("locksmith_emergency", "Ouverture / dépannage", "Ouverture de porte ou dépannage de serrurerie.", "forfait", [/ouverture d une porte|ouverture de porte|porte claquee|porte bloquee|depannage serrurerie/]),
      service("metal_railing", "Garde-corps", "Fabrication et pose de garde-corps métallique.", "ml", [/garde[- ]?corps/], { quantities: linear("garde[- ]?corps"), requiresQuantity: true, question: "Indiquer le métrage linéaire de garde-corps." }),
      service("metal_handrail", "Main courante", "Fabrication et pose d’une main courante métallique.", "ml", [/main courante/], { quantities: linear("mains? courantes?"), requiresQuantity: true, question: "Indiquer le métrage de main courante." }),
      service("metal_gate", "Portail / portillon", "Fabrication, fourniture ou pose de portail / portillon.", "unite", [/portails?|portillons?/], { quantities: count("portails?|portillons?") }),
      service("metal_fabrication", "Fabrication métallique sur mesure", "Fabrication ou modification d’un ouvrage acier, inox ou aluminium.", "forfait", [/fabrication metallique|structure acier|ouvrage acier|soudure|metallerie sur mesure/]),
    ],
    potentialOmissions: ["Prise de cotes, plans et validation des dimensions.", "Traitement anticorrosion, galvanisation, thermolaquage ou peinture.", "Dépose, scellements, alimentation électrique et maçonnerie éventuelle."],
  },
};

function customerHint(raw: string) {
  const prepared = raw.replace(/\bM\.\s*/g, "Monsieur ").replace(/\bMme\.?\s*/gi, "Madame ");
  return prepared.match(/(?:chez|client(?:e)?\s+)([^,.;]+?)(?=\s+(?:pour|avec|sur|je|on|il|elle|nous)\b|[,.;]|$)/i)?.[1]
    ?.trim().replace(/^(?:monsieur|madame)\s+/i, "") ?? "";
}

function factsFromText(description: string, definition: StructuredTradeDefinition) {
  const text = normalize(description);
  return definition.services.flatMap<StructuredTradeServiceFact>((item) => {
    if (!hasAny(text, item.detect)) return [];
    const quantity = lastNumber(text, item.quantities);
    return [{
      serviceCode: item.code,
      quantity: quantity ?? (item.requiresQuantity ? null : 1),
      unit: item.unit,
      detail: item.label,
    }];
  });
}

function makeInterpretation(
  description: string,
  definition: StructuredTradeDefinition,
  facts: StructuredTradeServiceFact[],
): StructuredTradeInterpretation {
  const byCode = new Map(definition.services.map((item) => [item.code, item]));
  const understoodData: string[] = [];
  const missingInformation: string[] = [];

  for (const fact of facts) {
    const item = byCode.get(fact.serviceCode);
    if (!item) continue;
    if (fact.quantity === null) missingInformation.push(item.question ?? `Préciser la quantité pour « ${item.label} ».`);
    else understoodData.push(`${item.label} : ${fact.quantity} ${item.unit}.`);
  }
  if (!facts.length) missingInformation.push(`Décrire au moins une prestation de ${definition.shortLabel.toLowerCase()} à chiffrer.`);

  const client = customerHint(description);
  return {
    trade: definition.trade,
    jobType: "structured_trade_job",
    customerHint: client,
    title: client ? `${definition.shortLabel} – ${client}` : `Travaux de ${definition.shortLabel.toLowerCase()}`,
    facts: { services: facts },
    understoodData,
    assumptions: [],
    missingInformation,
    potentialOmissions: facts.length ? [...definition.potentialOmissions] : [],
    confidence: Math.max(0.15, Math.min(0.98, roundCopilot(0.45 + Math.min(facts.length, 5) * 0.09 - missingInformation.length * 0.08, 2))),
  };
}

export function interpretStructuredTradeDescription(description: string, definition: StructuredTradeDefinition) {
  return makeInterpretation(description, definition, factsFromText(description, definition));
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
  const definitions = new Map(definition.services.map((item) => [item.code, item]));
  const merged = new Map(fallback.facts.services.map((item) => [item.serviceCode, item]));

  for (const candidate of rawServices.slice(0, 30)) {
    if (!isRecord(candidate)) continue;
    const code = typeof candidate.service_code === "string" ? candidate.service_code.trim()
      : typeof candidate.serviceCode === "string" ? candidate.serviceCode.trim() : "";
    const item = definitions.get(code);
    if (!item || merged.has(code)) continue;
    // L'IA peut reconnaître une prestation, mais jamais créer seule un métrage ou une quantité chiffrée.
    merged.set(code, {
      serviceCode: code,
      quantity: item.requiresQuantity ? null : 1,
      unit: item.unit,
      detail: typeof candidate.detail === "string" ? candidate.detail.trim().slice(0, 240) : item.label,
    });
  }
  return makeInterpretation(description, definition, [...merged.values()]);
}

export function buildStructuredTradeProposal(
  interpretation: StructuredTradeInterpretation,
  definition: StructuredTradeDefinition,
  options?: { catalog?: CopilotCatalogService[]; settings?: Partial<CopilotCompanySettings> },
): CopilotProposal<StructuredTradeInterpretation> {
  const settings = { ...DEFAULT_COPILOT_COMPANY_SETTINGS, ...(options?.settings ?? {}) };
  const defaults = structuredTradeDefaultCatalog(definition);
  const catalog = mergeCopilotCatalog(defaults, options?.catalog ?? []);
  const definitions = new Map(definition.services.map((item) => [item.code, item]));
  const lines: CopilotProposalLine[] = [];
  const questions = [...interpretation.missingInformation];

  for (const fact of interpretation.facts.services) {
    const item = definitions.get(fact.serviceCode);
    if (!item) continue;
    if (fact.quantity === null || fact.quantity <= 0) {
      questions.push(item.question ?? `Préciser la quantité pour « ${item.label} ».`);
      continue;
    }
    const line = createCopilotProposalLine(catalog, item.code, fact.quantity, settings);
    if (line) lines.push(line);
  }
  for (const line of lines) {
    if (line.unitPriceHt <= 0) questions.push(`Renseigner le tarif entreprise pour « ${line.label} » avant de créer le devis.`);
    else if (line.source === "template_default") questions.push(`Confirmer le tarif métier proposé pour « ${line.label} ».`);
  }

  const metrics = calculateCopilotProposalMetrics(lines, settings);
  return {
    status: questions.length || !lines.length ? "needs_information" : "ready_for_review",
    interpretation,
    lines,
    questions: [...new Set(questions)],
    metrics,
  };
}

export function structuredTradeDefaultCatalog(definition: StructuredTradeDefinition): CopilotCatalogService[] {
  return definition.services.map(({ detect: _detect, quantities: _quantities, requiresQuantity: _requires, question: _question, ...item }) => item);
}

export function structuredTradeAiPrompt(definition: StructuredTradeDefinition) {
  const codes = definition.services.map((item) => `- ${item.code}: ${item.label} (${item.unit})`).join("\n");
  return `Tu extrais uniquement des faits explicites d'un chantier de ${definition.label} pour un artisan français.\nTu ne calcules aucun prix, aucune marge, aucun total, aucun temps de travail et aucune quantité absente.\nN'invente jamais une mesure. Si la quantité n'est pas explicitement exprimée, mets null.\nCodes autorisés :\n${codes}\nRéponds uniquement avec ce JSON strict :\n{\n  "customer_hint": "",\n  "title": "",\n  "facts": { "services": [{ "service_code": "", "quantity": null, "unit": null, "detail": "" }] },\n  "confidence": 0\n}`;
}

export function isStructuredTradeInterpretation(
  interpretation: AnyCopilotInterpretation,
): interpretation is StructuredTradeInterpretation {
  return interpretation.jobType === "structured_trade_job";
}
