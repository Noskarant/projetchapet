export type MarketPriceBasis = "HT" | "TTC" | "NON_PRECISE";
export type MarketPriceConfidence = "high" | "medium";

export type MarketPriceReference = {
  id: string;
  label: string;
  unit: string;
  low: number;
  market: number;
  comfortable: number;
  basis: MarketPriceBasis;
  year: number;
  confidence: MarketPriceConfidence;
  sourceName: string;
  sourceUrl: string;
  methodology: string;
  regionalNote?: string;
};

type PricingRule = Omit<MarketPriceReference, "regionalNote"> & {
  matcher: RegExp;
  exclusion?: RegExp;
};

const RULES: PricingRule[] = [
  {
    id: "painting_wall_2026",
    label: "Peinture murs intérieurs · fourniture + pose",
    unit: "€/m²",
    low: 20,
    market: 28,
    comfortable: 35,
    basis: "TTC",
    year: 2026,
    confidence: "high",
    sourceName: "Travaux.com · Prix pose peinture 2026",
    sourceUrl: "https://www.travaux.com/peinture/guide-des-prix/prix-pose-peinture",
    methodology: "Bas et haut = fourchette publiée pour murs en bon état ; Marché = moyenne publiée (~28 €/m²).",
    matcher: /(?:pein(?:t|d)\w*|peinture)[^.!?]{0,80}(?:mur|murs)|(?:mur|murs)[^.!?]{0,80}(?:pein(?:t|d)\w*|peinture)/i,
    exclusion: /fa[cç]ade/i,
  },
  {
    id: "painting_ceiling_2026",
    label: "Peinture plafond · fourniture + pose",
    unit: "€/m²",
    low: 30,
    market: 37.5,
    comfortable: 45,
    basis: "TTC",
    year: 2026,
    confidence: "high",
    sourceName: "Travaux.com · Prix pose peinture 2026",
    sourceUrl: "https://www.travaux.com/peinture/guide-des-prix/prix-pose-peinture",
    methodology: "Bas et haut = fourchette publiée plafond ; Marché = milieu arithmétique de la fourchette, pas une moyenne observée.",
    matcher: /(?:pein(?:t|d)\w*|peinture)[^.!?]{0,80}plafond|plafond[^.!?]{0,80}(?:pein(?:t|d)\w*|peinture)/i,
  },
  {
    id: "placo_doubling_standard_2026",
    label: "Doublage placo standard",
    unit: "€/m²",
    low: 40,
    market: 55,
    comfortable: 70,
    basis: "NON_PRECISE",
    year: 2026,
    confidence: "medium",
    sourceName: "Travaux.com · Doublage placo",
    sourceUrl: "https://www.travaux.com/platre/guide-des-prix/prix-doublage-placo-m2",
    methodology: "Bas et haut = fourchette publiée standard ; Marché = milieu arithmétique de la fourchette.",
    matcher: /(?:doublage[^.!?]{0,50}placo|placo[^.!?]{0,50}doublage|doublage[^.!?]{0,50}pl[aâ]tre)/i,
  },
  {
    id: "tile_installation_2026",
    label: "Pose de carrelage · hors matériaux",
    unit: "€/m²",
    low: 25,
    market: 50,
    comfortable: 130,
    basis: "NON_PRECISE",
    year: 2026,
    confidence: "medium",
    sourceName: "Travaux.com · Pose carrelage 2026",
    sourceUrl: "https://www.travaux.com/sols-carrelage/guide-des-prix/prix-pose-de-carrelage",
    methodology: "Bas/haut = plage publiée pose seule (25–130 €/m²) ; Marché = centre de la zone moyenne publiée 45–55 €/m².",
    matcher: /carrelage|carreaux|fa[iï]ence/i,
  },
  {
    id: "parquet_glued_2026",
    label: "Pose de parquet collé · sans dépose",
    unit: "€/m²",
    low: 30,
    market: 35,
    comfortable: 40,
    basis: "TTC",
    year: 2026,
    confidence: "high",
    sourceName: "Travaux.com · Pose collée parquet 2026",
    sourceUrl: "https://www.travaux.com/sols-carrelage/guide-des-prix/prix-de-la-pose-collee-du-parquet",
    methodology: "Bas, marché et haut = minimum, moyenne et maximum publiés pour pose collée sans dépose.",
    matcher: /parquet[^.!?]{0,50}coll[eé]|pose[^.!?]{0,50}parquet[^.!?]{0,50}coll[eé]/i,
  },
  {
    id: "facade_render_2026",
    label: "Enduit de façade · pose comprise",
    unit: "€/m²",
    low: 50,
    market: 85,
    comfortable: 120,
    basis: "NON_PRECISE",
    year: 2026,
    confidence: "medium",
    sourceName: "Travaux.com · Enduit façade 2026",
    sourceUrl: "https://www.travaux.com/platre/guide-des-prix/prix-lenduit-facade",
    methodology: "Bas et haut = fourchette publiée 50–120 €/m² ; Marché = milieu arithmétique de la fourchette.",
    matcher: /enduit[^.!?]{0,60}fa[cç]ade|fa[cç]ade[^.!?]{0,60}enduit|ravalement[^.!?]{0,60}enduit/i,
  },
  {
    id: "scaffold_mounting_2026",
    label: "Montage / pose d’échafaudage",
    unit: "€/m²",
    low: 5,
    market: 10,
    comfortable: 15,
    basis: "NON_PRECISE",
    year: 2026,
    confidence: "medium",
    sourceName: "Travaux.com · Échafaudage 2026",
    sourceUrl: "https://www.travaux.com/construction-renovation-maison/guide-des-prix/un-echafaudage",
    methodology: "Bas et haut = fourchette publiée de montage/pose 5–15 €/m² ; Marché = milieu arithmétique.",
    matcher: /[eé]chafaudage|[eé]chafaud/i,
    exclusion: /location/i,
  },
  {
    id: "scaffold_rental_fixed_2026",
    label: "Location échafaudage fixe",
    unit: "€/m²/jour",
    low: 20,
    market: 30,
    comfortable: 40,
    basis: "NON_PRECISE",
    year: 2026,
    confidence: "medium",
    sourceName: "Travaux.com · Échafaudage 2026",
    sourceUrl: "https://www.travaux.com/construction-renovation-maison/guide-des-prix/un-echafaudage",
    methodology: "Bas et haut = fourchette publiée de location d’échafaudage fixe 20–40 €/m²/jour ; Marché = milieu arithmétique.",
    matcher: /location[^.!?]{0,60}[eé]chafaud|[eé]chafaud[^.!?]{0,60}location/i,
  },
];

function regionalNote(text: string) {
  if (/\b(?:paris|75\d{3}|lyon|69\d{3})\b/i.test(text)) {
    return "Zone urbaine détectée : les sources signalent notamment Paris/Lyon comme pouvant se situer dans le haut de fourchette. FORGEO n’applique aucune majoration automatique sans coefficient chiffré sourcé.";
  }
  return undefined;
}

export function findMarketPriceReferences(text: string, limit = 4): MarketPriceReference[] {
  const input = text.trim();
  if (!input) return [];
  const note = regionalNote(input);
  const results: MarketPriceReference[] = [];

  for (const rule of RULES) {
    if (!rule.matcher.test(input)) continue;
    if (rule.exclusion?.test(input)) continue;
    const { matcher: _matcher, exclusion: _exclusion, ...reference } = rule;
    results.push(note ? { ...reference, regionalNote: note } : reference);
    if (results.length >= limit) break;
  }
  return results;
}

export function formatMarketPrice(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}
