export type MarketPriceBasis = "HT" | "TTC" | "NON_PRECISE";
export type MarketPriceConfidence = "high" | "medium";
export type MarketPriceLevel = "low" | "market" | "comfortable";
export type MarketPriceDerivation = "published_average" | "published_typical_band" | "midpoint";

export type MarketPriceSource = {
  name: string;
  url: string;
  updatedAt: string;
};

export type MarketPriceReference = {
  id: string;
  label: string;
  trade: string;
  unit: string;
  low: number;
  market: number;
  comfortable: number;
  basis: MarketPriceBasis;
  year: number;
  confidence: MarketPriceConfidence;
  confidenceReason: string;
  sourceName: string;
  sourceUrl: string;
  sources: MarketPriceSource[];
  methodology: string;
  freshnessDate: string;
  quoteUnit?: string;
  regionalNote?: string;
};

export type MarketPriceSelection = {
  referenceId: string;
  level: MarketPriceLevel;
};

type PricingRule = Omit<MarketPriceReference, "confidence" | "confidenceReason" | "sourceName" | "sourceUrl" | "freshnessDate" | "regionalNote"> & {
  matcher: RegExp;
  itemMatcher?: RegExp;
  exclusion?: RegExp;
  derivation: MarketPriceDerivation;
  priority?: number;
  corroborated?: boolean;
  regional?: "large_city_markup" | "electrician_city_band" | "plumber_idf_note";
};

const SRC = {
  painting: { name: "Travaux.com · Prix pose peinture 2026", url: "https://www.travaux.com/peinture/guide-des-prix/prix-pose-peinture", updatedAt: "2026-08-21" },
  placo: { name: "Travaux.com · Plaques de plâtre 2026", url: "https://www.travaux.com/platre/guide-des-prix/prix-plaques-de-platre", updatedAt: "2026-08-21" },
  tile: { name: "Travaux.com · Pose carrelage 2026", url: "https://www.travaux.com/sols-carrelage/guide-des-prix/prix-pose-de-carrelage", updatedAt: "2026-08-21" },
  parquet: { name: "Travaux.com · Pose collée parquet 2026", url: "https://www.travaux.com/sols-carrelage/guide-des-prix/prix-de-la-pose-collee-du-parquet", updatedAt: "2026-08-21" },
  masonry: { name: "Travaux.com · Maçonnerie 2026", url: "https://www.travaux.com/construction-renovation-maison/guide-des-prix/prix-m2-travaux-de-maconnerie", updatedAt: "2026-08-21" },
  roof: { name: "Travaux.com · Toiture 2026", url: "https://www.travaux.com/couverture-toiture/guide-des-prix/toiture", updatedAt: "2026-08-21" },
  roofInstall: { name: "Travaux.com · Installation toiture 2026", url: "https://www.travaux.com/couverture-toiture/guide-des-prix/prix-de-linstallation-dune-toiture-neuve", updatedAt: "2026-08-21" },
  roofOot: { name: "Ootravaux · Prix toiture au m² 2026", url: "https://www.ootravaux.fr/construction-renovation/toiture/couverture/travaux-toiture/prix-toiture-m2.html", updatedAt: "2026-06-04" },
  plumber: { name: "Travaux.com · Tarif plombier 2026", url: "https://www.travaux.com/plomberie/guide-des-prix/prix-dun-plombier", updatedAt: "2026-08-21" },
  plumbingRenovation: { name: "Travaux.com · Rénovation plomberie 2026", url: "https://www.travaux.com/plomberie/guide-des-prix/prix-dune-renovation-de-plomberie", updatedAt: "2026-08-21" },
  plumberOot: { name: "Ootravaux · Tarifs plomberie 2026", url: "https://www.ootravaux.fr/installation-entretien/plomberie/tarifs-plomberie.html", updatedAt: "2026-03-13" },
  electrician: { name: "Travaux.com · Tarif électricien 2026", url: "https://www.travaux.com/electricite/guide-des-prix/prix-dun-electricien", updatedAt: "2026-08-21" },
  outlet: { name: "Travaux.com · Prise électrique 2026", url: "https://www.travaux.com/electricite/guide-des-prix/prix-de-linstallation-dune-prise-electrique", updatedAt: "2026-08-21" },
  panel: { name: "Travaux.com · Tableau électrique 2026", url: "https://www.travaux.com/electricite/guide-des-prix/prix-de-mise-aux-normes-dun-tableau-electrique", updatedAt: "2026-08-21" },
  facade: { name: "Travaux.com · Ravalement façade 2026", url: "https://www.travaux.com/construction-renovation-maison/guide-des-prix/prix-du-ravalement-de-facade", updatedAt: "2026-08-21" },
  facadeOot: { name: "Ootravaux · Ravalement façade 2026", url: "https://www.ootravaux.fr/construction-renovation/maconnerie-fondations/facade/prix-renovation-facade.html", updatedAt: "2026-09-02" },
  facadeStone: { name: "Travaux.com · Façade pierre 2026", url: "https://www.travaux.com/energie-renouvelable-diagnostic/guide-des-prix/prix-facade-en-pierre", updatedAt: "2026-08-21" },
  window: { name: "Travaux.com · Pose fenêtre 2026", url: "https://www.travaux.com/fenetre-porte/guide-des-prix/prix-de-linstallation-dune-fenetre", updatedAt: "2026-08-21" },
  windowReplace: { name: "Travaux.com · Remplacement fenêtre 2026", url: "https://www.travaux.com/fenetre-porte/guide-des-prix/prix-de-remplacement-dune-fenetre", updatedAt: "2026-08-21" },
  door: { name: "Travaux.com · Porte intérieure 2026", url: "https://www.travaux.com/fenetre-porte/guide-des-prix/prix-pose-porte-interieure", updatedAt: "2026-08-21" },
  frenchDoor: { name: "Travaux.com · Porte-fenêtre 2026", url: "https://www.travaux.com/fenetre-porte/guide-des-prix/prix-des-portes-fenetres", updatedAt: "2026-08-21" },
  heatPump: { name: "Travaux.com · Pompe à chaleur 2026", url: "https://www.travaux.com/chauffage/guide-des-prix/prix-des-pompes-a-chaleur", updatedAt: "2026-08-21" },
  heatPumpGuide: { name: "Travaux.com · Guide PAC 2026", url: "https://www.travaux.com/chauffage/guide-des-prix/pompe-a-chaleur", updatedAt: "2026-08-21" },
  locksmith: { name: "Travaux.com · Serrurier 2026", url: "https://www.travaux.com/fenetre-porte/guide-des-prix/prix-dun-serrurier", updatedAt: "2026-08-21" },
  scaffold: { name: "Travaux.com · Échafaudage 2026", url: "https://www.travaux.com/construction-renovation-maison/guide-des-prix/un-echafaudage", updatedAt: "2026-08-21" },
} satisfies Record<string, MarketPriceSource>;

function rule(input: Omit<PricingRule, "year"> & { year?: number }): PricingRule {
  return { year: 2026, ...input };
}

const RULES: PricingRule[] = [
  rule({ id: "painting_wall_2026", label: "Peinture murs intérieurs · fourniture + pose", trade: "Peinture", unit: "€/m²", quoteUnit: "m²", low: 20, market: 28, comfortable: 35, basis: "TTC", sources: [SRC.painting], derivation: "published_average", methodology: "Fourchette publiée 20–35 €/m² pour murs en bon état ; Marché = moyenne publiée ~28 €/m².", matcher: /(?:pein(?:t|d)\w*|peinture)[^.!?]{0,100}(?:mur|murs)|(?:mur|murs)[^.!?]{0,100}(?:pein(?:t|d)\w*|peinture)/i, itemMatcher: /peint\w*[^.!?]{0,80}mur|mur[^.!?]{0,80}peint\w*/i, exclusion: /fa[cç]ade/i, priority: 90 }),
  rule({ id: "painting_ceiling_2026", label: "Peinture plafond · fourniture + pose", trade: "Peinture", unit: "€/m²", quoteUnit: "m²", low: 30, market: 37.5, comfortable: 45, basis: "TTC", sources: [SRC.painting], derivation: "midpoint", methodology: "Fourchette publiée 30–45 €/m² ; Marché = milieu arithmétique, faute de moyenne publiée spécifique au plafond.", matcher: /(?:pein(?:t|d)\w*|peinture)[^.!?]{0,100}plafond|plafond[^.!?]{0,100}(?:pein(?:t|d)\w*|peinture)/i, itemMatcher: /peint\w*[^.!?]{0,80}plafond|plafond[^.!?]{0,80}peint\w*/i, priority: 95 }),
  rule({ id: "painting_labor_m2_2026", label: "Peinture intérieure · main-d’œuvre seule (2 couches)", trade: "Peinture", unit: "€/m²", quoteUnit: "m²", low: 8, market: 13, comfortable: 18, basis: "HT", sources: [SRC.painting], derivation: "midpoint", methodology: "Fourchette publiée 8–18 € HT/m² sans fourniture ; Marché = milieu arithmétique.", matcher: /(?:peintre|peinture)[^.!?]{0,80}(?:sans fourniture|main[- ]d['’]oeuvre|main[- ]d['’]œuvre)/i, itemMatcher: /peint/i, priority: 100 }),
  rule({ id: "painting_hourly_2026", label: "Peintre · tarif horaire indicatif", trade: "Peinture", unit: "€/h", quoteUnit: "h", low: 25, market: 37.5, comfortable: 50, basis: "NON_PRECISE", sources: [SRC.painting], derivation: "midpoint", methodology: "Fourchette horaire publiée 25–50 €/h ; Marché = milieu arithmétique.", matcher: /(?:peintre|peinture)[^.!?]{0,60}(?:heure|horaire|\/h)/i, itemMatcher: /peint/i, priority: 70 }),
  rule({ id: "placo_installed_2026", label: "Plaque de plâtre / placo · pose comprise", trade: "Plaquiste", unit: "€/m²", quoteUnit: "m²", low: 25, market: 45, comfortable: 65, basis: "NON_PRECISE", sources: [SRC.placo], derivation: "midpoint", methodology: "Fourchette publiée 25–65 €/m² pose comprise ; Marché = milieu arithmétique.", matcher: /placo|plaque[s]? de pl[aâ]tre|ba\s?13|cloison s[eè]che/i, itemMatcher: /placo|pl[aâ]tre|ba\s?13|cloison/i, priority: 80 }),
  rule({ id: "tile_installation_2026", label: "Pose de carrelage · hors matériaux", trade: "Carreleur", unit: "€/m²", quoteUnit: "m²", low: 25, market: 50, comfortable: 130, basis: "NON_PRECISE", sources: [SRC.tile], derivation: "published_typical_band", methodology: "Plage publiée pose seule 25–130 €/m² ; Marché = centre de la zone moyenne publiée 45–55 €/m².", matcher: /carrelage|carreaux|fa[iï]ence/i, itemMatcher: /carrelage|carreau|fa[iï]ence/i, exclusion: /(?:diagonal|chevron|d[eé]cal[eé]|droite|tout compris|fourniture)/i, regional: "large_city_markup", priority: 50 }),
  rule({ id: "tile_all_in_2026", label: "Carrelage · fourniture + pose", trade: "Carreleur", unit: "€/m²", quoteUnit: "m²", low: 60, market: 125, comfortable: 190, basis: "NON_PRECISE", sources: [SRC.tile], derivation: "midpoint", methodology: "Fourchette publiée 60–190 €/m² tout compris ; Marché = milieu arithmétique.", matcher: /carrelage[^.!?]{0,80}(?:fourniture|tout compris)|(?:fourniture|tout compris)[^.!?]{0,80}carrelage/i, itemMatcher: /carrelage|carreau/i, regional: "large_city_markup", priority: 100 }),
  rule({ id: "tile_straight_2026", label: "Carrelage · pose droite", trade: "Carreleur", unit: "€/m²", quoteUnit: "m²", low: 25, market: 35, comfortable: 45, basis: "NON_PRECISE", sources: [SRC.tile], derivation: "midpoint", methodology: "Fourchette publiée 25–45 €/m² hors carrelage ; Marché = milieu arithmétique.", matcher: /(?:carrelage|carreau)[^.!?]{0,60}pose droite|pose droite[^.!?]{0,60}(?:carrelage|carreau)/i, itemMatcher: /carrelage|carreau/i, regional: "large_city_markup", priority: 110 }),
  rule({ id: "tile_chevron_2026", label: "Carrelage · pose chevron", trade: "Carreleur", unit: "€/m²", quoteUnit: "m²", low: 30, market: 45, comfortable: 60, basis: "NON_PRECISE", sources: [SRC.tile], derivation: "midpoint", methodology: "Fourchette publiée 30–60 €/m² hors carrelage ; Marché = milieu arithmétique.", matcher: /(?:carrelage|carreau)[^.!?]{0,60}chevron|chevron[^.!?]{0,60}(?:carrelage|carreau)/i, itemMatcher: /carrelage|carreau/i, regional: "large_city_markup", priority: 110 }),
  rule({ id: "tile_diagonal_2026", label: "Carrelage · pose diagonale", trade: "Carreleur", unit: "€/m²", quoteUnit: "m²", low: 40, market: 47.5, comfortable: 55, basis: "NON_PRECISE", sources: [SRC.tile], derivation: "midpoint", methodology: "Fourchette publiée 40–55 €/m² hors carrelage ; Marché = milieu arithmétique.", matcher: /(?:carrelage|carreau)[^.!?]{0,60}diagonal|diagonal[^.!?]{0,60}(?:carrelage|carreau)/i, itemMatcher: /carrelage|carreau/i, regional: "large_city_markup", priority: 110 }),
  rule({ id: "tile_preparation_2026", label: "Préparation avant carrelage · ragréage / dépose / primaire", trade: "Carreleur", unit: "€/m²", quoteUnit: "m²", low: 15, market: 27.5, comfortable: 40, basis: "NON_PRECISE", sources: [SRC.tile], derivation: "midpoint", methodology: "Travaux préparatoires annoncés à +15–40 €/m² ; Marché = milieu arithmétique.", matcher: /(?:ragr[eé]age|primaire|d[eé]pose)[^.!?]{0,80}(?:carrelage|carreau)|(?:carrelage|carreau)[^.!?]{0,80}(?:ragr[eé]age|primaire|d[eé]pose)/i, itemMatcher: /ragr[eé]age|primaire|d[eé]pose/i, regional: "large_city_markup", priority: 105 }),
  rule({ id: "parquet_glued_2026", label: "Pose de parquet collé · sans dépose", trade: "Solier / parquet", unit: "€/m²", quoteUnit: "m²", low: 30, market: 35, comfortable: 40, basis: "TTC", sources: [SRC.parquet], derivation: "published_average", methodology: "Minimum, moyenne et maximum publiés pour pose collée sans dépose.", matcher: /parquet[^.!?]{0,60}coll[eé]|pose[^.!?]{0,60}parquet[^.!?]{0,60}coll[eé]/i, itemMatcher: /parquet/i, priority: 100 }),
  rule({ id: "masonry_screed_2026", label: "Chape intérieure béton", trade: "Maçonnerie", unit: "€/m²", quoteUnit: "m²", low: 35, market: 40, comfortable: 45, basis: "NON_PRECISE", sources: [SRC.masonry], derivation: "midpoint", methodology: "Fourchette publiée 35–45 €/m² ; Marché = milieu arithmétique.", matcher: /chape[^.!?]{0,50}(?:b[eé]ton|int[eé]rieur)|(?:b[eé]ton|int[eé]rieur)[^.!?]{0,50}chape/i, itemMatcher: /chape/i, priority: 100 }),
  rule({ id: "masonry_block_wall_2026", label: "Mur parpaing / brique · matériaux + pose", trade: "Maçonnerie", unit: "€/m²", quoteUnit: "m²", low: 55, market: 77.5, comfortable: 100, basis: "NON_PRECISE", sources: [SRC.masonry], derivation: "midpoint", methodology: "Fourchette publiée 55–100 €/m² matériaux + pose ; Marché = milieu arithmétique.", matcher: /mur[^.!?]{0,60}(?:parpaing|brique)|(?:parpaing|brique)[^.!?]{0,60}mur/i, itemMatcher: /mur|parpaing|brique/i, priority: 100 }),
  rule({ id: "masonry_load_bearing_opening_2026", label: "Ouverture de mur porteur", trade: "Maçonnerie", unit: "€/forfait", quoteUnit: "forfait", low: 1500, market: 1750, comfortable: 2000, basis: "NON_PRECISE", sources: [SRC.masonry], derivation: "midpoint", methodology: "Fourchette publiée 1 500–2 000 € ; Marché = milieu arithmétique.", matcher: /ouverture[^.!?]{0,60}mur porteur|mur porteur[^.!?]{0,60}ouverture/i, itemMatcher: /ouverture|mur porteur/i, priority: 120 }),
  rule({ id: "masonry_hourly_2026", label: "Maçon · tarif horaire", trade: "Maçonnerie", unit: "€/h", quoteUnit: "h", low: 40, market: 57.5, comfortable: 75, basis: "HT", sources: [SRC.masonry], derivation: "midpoint", methodology: "Fourchette publiée 40–75 € HT/h ; Marché = milieu arithmétique.", matcher: /ma[cç]on[^.!?]{0,60}(?:heure|horaire|\/h)/i, itemMatcher: /ma[cç]on|ma[cç]onnerie/i, priority: 70 }),
  rule({ id: "masonry_outbuilding_2026", label: "Construction d’une dépendance", trade: "Maçonnerie", unit: "€/m²", quoteUnit: "m²", low: 540, market: 720, comfortable: 900, basis: "NON_PRECISE", sources: [SRC.masonry], derivation: "midpoint", methodology: "Fourchette publiée 540–900 €/m² ; Marché = milieu arithmétique.", matcher: /(?:construction|cr[eé]ation)[^.!?]{0,60}d[eé]pendance|d[eé]pendance[^.!?]{0,60}(?:construction|cr[eé]ation)/i, itemMatcher: /d[eé]pendance/i, priority: 90 }),
  rule({ id: "roof_cover_only_2026", label: "Couverture seule · charpente conservée", trade: "Couverture", unit: "€/m²", quoteUnit: "m²", low: 55, market: 127.5, comfortable: 200, basis: "NON_PRECISE", sources: [SRC.roof, SRC.roofInstall], corroborated: true, derivation: "midpoint", methodology: "Travaux.com publie 55–200 €/m² selon revêtement ; Ootravaux confirme la forte dépendance au matériau. Marché = milieu de la fourchette Travaux.com.", matcher: /couverture[^.!?]{0,80}(?:seule|charpente conserv[eé]e)|(?:charpente conserv[eé]e)[^.!?]{0,80}couverture/i, itemMatcher: /couverture/i, priority: 100 }),
  rule({ id: "roof_complete_2026", label: "Toiture complète · charpente + couverture", trade: "Couverture", unit: "€/m²", quoteUnit: "m²", low: 180, market: 265, comfortable: 350, basis: "NON_PRECISE", sources: [SRC.roof, SRC.roofInstall], derivation: "midpoint", methodology: "Fourchette 180–350 €/m² publiée pour toiture complète ; Marché = milieu arithmétique.", matcher: /toiture[^.!?]{0,80}(?:compl[eè]te|charpente[^.!?]{0,30}couverture)|(?:charpente[^.!?]{0,30}couverture)[^.!?]{0,80}toiture/i, itemMatcher: /toiture|charpente|couverture/i, priority: 105 }),
  rule({ id: "roof_renovation_2026", label: "Rénovation complète de toiture · dépose + repose", trade: "Couverture", unit: "€/m²", quoteUnit: "m²", low: 120, market: 220, comfortable: 320, basis: "NON_PRECISE", sources: [SRC.roof, SRC.roofOot], corroborated: true, derivation: "midpoint", methodology: "Fourchette publiée 120–320 €/m² pour rénovation complète ; Marché = milieu arithmétique.", matcher: /(?:r[eé]novation|r[eé]fection)[^.!?]{0,80}toiture|toiture[^.!?]{0,80}(?:r[eé]novation|r[eé]fection)/i, itemMatcher: /toiture|couverture/i, priority: 95 }),
  rule({ id: "roof_repair_2026", label: "Réparation de toiture · intervention", trade: "Couverture", unit: "€/forfait", quoteUnit: "forfait", low: 500, market: 1750, comfortable: 3000, basis: "NON_PRECISE", sources: [SRC.roof], derivation: "midpoint", methodology: "Fourchette publiée 500–3 000 € selon l’étendue ; Marché = milieu arithmétique.", matcher: /(?:r[eé]paration|fuite|infiltration)[^.!?]{0,70}toiture|toiture[^.!?]{0,70}(?:r[eé]paration|fuite|infiltration)/i, itemMatcher: /toiture|fuite|infiltration/i, priority: 110 }),
  rule({ id: "roof_demoss_2026", label: "Démoussage de toiture", trade: "Couverture", unit: "€/m²", quoteUnit: "m²", low: 5, market: 10, comfortable: 15, basis: "NON_PRECISE", sources: [SRC.roof], derivation: "midpoint", methodology: "Fourchette publiée 5–15 €/m² ; Marché = milieu arithmétique.", matcher: /d[eé]moussage[^.!?]{0,50}toiture|toiture[^.!?]{0,50}d[eé]moussage/i, itemMatcher: /d[eé]mouss/i, priority: 120 }),
  rule({ id: "roof_clay_tile_2026", label: "Couverture tuiles terre cuite", trade: "Couverture", unit: "€/m²", quoteUnit: "m²", low: 90, market: 125, comfortable: 160, basis: "NON_PRECISE", sources: [SRC.roof], derivation: "midpoint", methodology: "Fourchette publiée 90–160 €/m² ; Marché = milieu arithmétique.", matcher: /(?:toiture|couverture|pose)[^.!?]{0,70}tuiles?[^.!?]{0,30}terre cuite|tuiles?[^.!?]{0,30}terre cuite/i, itemMatcher: /tuile|couverture|toiture/i, priority: 130 }),
  rule({ id: "roof_slate_2026", label: "Couverture ardoise naturelle", trade: "Couverture", unit: "€/m²", quoteUnit: "m²", low: 140, market: 205, comfortable: 270, basis: "NON_PRECISE", sources: [SRC.roof], derivation: "midpoint", methodology: "Fourchette publiée 140–270 €/m² ; Marché = milieu arithmétique.", matcher: /(?:toiture|couverture|pose)[^.!?]{0,70}ardoise|ardoise[^.!?]{0,70}(?:toiture|couverture|pose)/i, itemMatcher: /ardoise|couverture|toiture/i, priority: 125 }),
  rule({ id: "roof_zinc_2026", label: "Couverture zinc", trade: "Couverture / zinguerie", unit: "€/m²", quoteUnit: "m²", low: 145, market: 225, comfortable: 305, basis: "NON_PRECISE", sources: [SRC.roof], derivation: "midpoint", methodology: "Fourchette publiée 145–305 €/m² ; Marché = milieu arithmétique.", matcher: /(?:toiture|couverture|pose)[^.!?]{0,70}zinc|zinc[^.!?]{0,70}(?:toiture|couverture|pose)/i, itemMatcher: /zinc|couverture|toiture/i, priority: 125 }),
  rule({ id: "roof_steel_2026", label: "Couverture bac acier", trade: "Couverture", unit: "€/m²", quoteUnit: "m²", low: 50, market: 125, comfortable: 200, basis: "NON_PRECISE", sources: [SRC.roof], derivation: "midpoint", methodology: "Fourchette publiée 50–200 €/m² ; Marché = milieu arithmétique.", matcher: /bac acier|toiture[^.!?]{0,70}acier/i, itemMatcher: /bac acier|acier|toiture/i, priority: 125 }),
  rule({ id: "roofer_daily_2026", label: "Couvreur · tarif journalier", trade: "Couverture", unit: "€/jour", quoteUnit: "jour", low: 300, market: 450, comfortable: 600, basis: "NON_PRECISE", sources: [SRC.roof], derivation: "midpoint", methodology: "Fourchette publiée 300–600 €/jour ; Marché = milieu arithmétique.", matcher: /couvreur[^.!?]{0,60}(?:jour|journalier)/i, itemMatcher: /couvreur|couverture/i, priority: 70 }),
  rule({ id: "roof_labor_only_2026", label: "Couverture · main-d’œuvre seule", trade: "Couverture", unit: "€/m²", quoteUnit: "m²", low: 30, market: 65, comfortable: 100, basis: "NON_PRECISE", sources: [SRC.roofInstall], derivation: "midpoint", methodology: "Fourchette publiée 30–100 €/m² de main-d’œuvre seule ; Marché = milieu arithmétique.", matcher: /(?:couverture|toiture)[^.!?]{0,80}(?:main[- ]d['’]oeuvre|main[- ]d['’]œuvre|sans fourniture)/i, itemMatcher: /couverture|toiture/i, priority: 115 }),
  rule({ id: "plumber_hourly_2026", label: "Plombier · tarif horaire", trade: "Plomberie", unit: "€/h", quoteUnit: "h", low: 40, market: 60, comfortable: 80, basis: "HT", sources: [SRC.plumber, SRC.plumberOot], corroborated: true, derivation: "midpoint", methodology: "Travaux.com publie 40–80 € HT/h en province ; Ootravaux confirme une forte variation régionale. Marché = milieu de la fourchette Travaux.com.", matcher: /plombier[^.!?]{0,60}(?:heure|horaire|\/h)/i, itemMatcher: /plomb/i, regional: "plumber_idf_note", priority: 80 }),
  rule({ id: "plumber_daily_2026", label: "Plombier · tarif journalier", trade: "Plomberie", unit: "€/jour", quoteUnit: "jour", low: 350, market: 475, comfortable: 600, basis: "HT", sources: [SRC.plumber], derivation: "midpoint", methodology: "Fourchette publiée 350–600 € HT/jour ; Marché = milieu arithmétique.", matcher: /plombier[^.!?]{0,60}(?:jour|journalier)/i, itemMatcher: /plomb/i, priority: 70 }),
  rule({ id: "plumber_travel_2026", label: "Plombier · frais de déplacement", trade: "Plomberie", unit: "€/forfait", quoteUnit: "forfait", low: 20, market: 40, comfortable: 60, basis: "NON_PRECISE", sources: [SRC.plumber], derivation: "midpoint", methodology: "Fourchette publiée 20–60 € ; Marché = milieu arithmétique.", matcher: /(?:frais de )?d[eé]placement[^.!?]{0,60}plombier|plombier[^.!?]{0,60}d[eé]placement/i, itemMatcher: /d[eé]placement|plomb/i, priority: 100 }),
  rule({ id: "plumber_troubleshooting_2026", label: "Dépannage plomberie · hors fournitures", trade: "Plomberie", unit: "€/forfait", quoteUnit: "forfait", low: 80, market: 115, comfortable: 150, basis: "HT", sources: [SRC.plumber], derivation: "midpoint", methodology: "Forfait dépannage publié 80–150 € HT hors fournitures ; Marché = milieu arithmétique.", matcher: /d[eé]pannage[^.!?]{0,60}plomb|plomb[^.!?]{0,60}d[eé]pannage/i, itemMatcher: /d[eé]pannage|plomb/i, priority: 100 }),
  rule({ id: "plumbing_leak_repair_2026", label: "Réparation de fuite d’eau", trade: "Plomberie", unit: "€/forfait", quoteUnit: "forfait", low: 150, market: 200, comfortable: 250, basis: "NON_PRECISE", sources: [SRC.plumbingRenovation], derivation: "published_average", methodology: "Minimum, moyenne et maximum publiés : 150 / 200 / 250 €.", matcher: /(?:r[eé]par|colmater)[^.!?]{0,60}fuite|fuite d['’ ]?eau|fuite[^.!?]{0,60}(?:plomb|tuyau|canalisation)/i, itemMatcher: /fuite/i, priority: 120 }),
  rule({ id: "plumbing_sink_replacement_2026", label: "Remplacement d’un lavabo", trade: "Plomberie", unit: "€/u", quoteUnit: "u", low: 250, market: 325, comfortable: 400, basis: "NON_PRECISE", sources: [SRC.plumbingRenovation], derivation: "published_average", methodology: "Minimum, moyenne et maximum publiés : 250 / 325 / 400 €.", matcher: /remplac(?:er|ement)[^.!?]{0,60}lavabo|lavabo[^.!?]{0,60}remplac/i, itemMatcher: /lavabo/i, priority: 120 }),
  rule({ id: "water_heater_install_2026", label: "Installation d’un chauffe-eau", trade: "Plomberie / chauffage", unit: "€/forfait", quoteUnit: "forfait", low: 175, market: 1588, comfortable: 3000, basis: "NON_PRECISE", sources: [SRC.plumbingRenovation], derivation: "published_average", methodology: "Minimum, moyenne et maximum publiés : 175 / 1 588 / 3 000 € selon équipement et chantier.", matcher: /(?:pose|installer|installation|remplac(?:er|ement))[^.!?]{0,60}chauffe[- ]eau|chauffe[- ]eau[^.!?]{0,60}(?:pose|installer|installation|remplac)/i, itemMatcher: /chauffe[- ]eau/i, priority: 105 }),
  rule({ id: "electrician_hourly_2026", label: "Électricien · tarif horaire", trade: "Électricité", unit: "€/h", quoteUnit: "h", low: 35, market: 65, comfortable: 95, basis: "TTC", sources: [SRC.electrician], derivation: "published_average", methodology: "Minimum 35 €, moyenne ~65 €, maximum 95 €/h publiés. En grande agglomération, la même source publie une bande 70–95 €/h.", matcher: /[eé]lectricien[^.!?]{0,60}(?:heure|horaire|\/h)|tarif horaire[^.!?]{0,60}[eé]lectric/i, itemMatcher: /[eé]lectric/i, regional: "electrician_city_band", priority: 80 }),
  rule({ id: "electrician_daily_2026", label: "Électricien · tarif journalier", trade: "Électricité", unit: "€/jour", quoteUnit: "jour", low: 350, market: 475, comfortable: 600, basis: "NON_PRECISE", sources: [SRC.electrician], derivation: "midpoint", methodology: "Fourchette publiée 350–600 €/jour ; Marché = milieu arithmétique.", matcher: /[eé]lectricien[^.!?]{0,60}(?:jour|journalier)/i, itemMatcher: /[eé]lectric/i, priority: 70 }),
  rule({ id: "electrician_travel_2026", label: "Électricien · frais de déplacement", trade: "Électricité", unit: "€/forfait", quoteUnit: "forfait", low: 20, market: 35, comfortable: 50, basis: "NON_PRECISE", sources: [SRC.electrician], derivation: "midpoint", methodology: "Fourchette publiée 20–50 € ; Marché = milieu arithmétique.", matcher: /(?:frais de )?d[eé]placement[^.!?]{0,60}[eé]lectric|[eé]lectricien[^.!?]{0,60}d[eé]placement/i, itemMatcher: /d[eé]placement|[eé]lectric/i, priority: 100 }),
  rule({ id: "electric_safety_m2_2026", label: "Mise en sécurité électrique", trade: "Électricité", unit: "€/m²", quoteUnit: "m²", low: 50, market: 65, comfortable: 80, basis: "TTC", sources: [SRC.electrician], derivation: "midpoint", methodology: "Fourchette publiée 50–80 €/m² ; Marché = milieu arithmétique.", matcher: /mise en s[eé]curit[eé][^.!?]{0,60}[eé]lectri|[eé]lectric[^.!?]{0,60}mise en s[eé]curit[eé]/i, itemMatcher: /s[eé]curit[eé]|[eé]lectric/i, priority: 110 }),
  rule({ id: "electric_partial_renovation_2026", label: "Rénovation électrique partielle", trade: "Électricité", unit: "€/m²", quoteUnit: "m²", low: 90, market: 115, comfortable: 140, basis: "TTC", sources: [SRC.electrician], derivation: "midpoint", methodology: "Fourchette publiée 90–140 €/m² ; Marché = milieu arithmétique.", matcher: /r[eé]novation[^.!?]{0,60}[eé]lectri[^.!?]{0,30}partielle|r[eé]novation partielle[^.!?]{0,60}[eé]lectri/i, itemMatcher: /r[eé]novation|[eé]lectric/i, priority: 110 }),
  rule({ id: "electric_total_renovation_2026", label: "Rénovation électrique complète", trade: "Électricité", unit: "€/m²", quoteUnit: "m²", low: 125, market: 162.5, comfortable: 200, basis: "TTC", sources: [SRC.electrician], derivation: "midpoint", methodology: "Fourchette publiée 125–200 €/m² ; Marché = milieu arithmétique.", matcher: /r[eé]novation[^.!?]{0,60}[eé]lectri[^.!?]{0,30}(?:compl[eè]te|totale)|r[eé]novation (?:compl[eè]te|totale)[^.!?]{0,60}[eé]lectri/i, itemMatcher: /r[eé]novation|[eé]lectric/i, priority: 115 }),
  rule({ id: "electric_new_install_2026", label: "Installation électrique neuve", trade: "Électricité", unit: "€/m²", quoteUnit: "m²", low: 80, market: 100, comfortable: 120, basis: "TTC", sources: [SRC.electrician], derivation: "midpoint", methodology: "Fourchette publiée 80–120 €/m² ; Marché = milieu arithmétique.", matcher: /installation[^.!?]{0,60}[eé]lectri[^.!?]{0,30}(?:neuve|neuf)|[eé]lectricit[eé][^.!?]{0,60}(?:maison neuve|neuf)/i, itemMatcher: /installation|[eé]lectric/i, priority: 105 }),
  rule({ id: "electric_outlet_2026", label: "Installation d’une prise électrique", trade: "Électricité", unit: "€/u", quoteUnit: "u", low: 50, market: 100, comfortable: 150, basis: "NON_PRECISE", sources: [SRC.outlet, SRC.electrician], corroborated: true, derivation: "midpoint", methodology: "Guide prise : 50–150 € ; guide électricien : 60–110 € pour une prise standard. FORGEO conserve la plage large 50–150 €.", matcher: /(?:prise [eé]lectrique|prise de courant|installer[^.!?]{0,40}prise)/i, itemMatcher: /prise/i, exclusion: /rj\s?45|usb|tv|ext[eé]rieur/i, priority: 90 }),
  rule({ id: "electric_switch_2026", label: "Installation d’un interrupteur", trade: "Électricité", unit: "€/u", quoteUnit: "u", low: 65, market: 102.5, comfortable: 140, basis: "TTC", sources: [SRC.electrician], derivation: "midpoint", methodology: "Fourchette publiée 65–140 € ; Marché = milieu arithmétique.", matcher: /interrupteur/i, itemMatcher: /interrupteur/i, priority: 110 }),
  rule({ id: "electric_luminaire_2026", label: "Pose d’un luminaire · hors fourniture", trade: "Électricité", unit: "€/u", quoteUnit: "u", low: 32, market: 61, comfortable: 90, basis: "TTC", sources: [SRC.electrician], derivation: "midpoint", methodology: "Fourchette publiée 32–90 € hors fourniture ; Marché = milieu arithmétique.", matcher: /(?:pose|installer|installation)[^.!?]{0,60}luminaire|luminaire[^.!?]{0,60}(?:pose|installer|installation)/i, itemMatcher: /luminaire/i, priority: 120 }),
  rule({ id: "electric_lustre_2026", label: "Installation d’un lustre", trade: "Électricité", unit: "€/u", quoteUnit: "u", low: 150, market: 200, comfortable: 250, basis: "TTC", sources: [SRC.electrician], derivation: "midpoint", methodology: "Fourchette publiée 150–250 € ; Marché = milieu arithmétique.", matcher: /(?:pose|installer|installation)[^.!?]{0,60}lustre|lustre[^.!?]{0,60}(?:pose|installer|installation)/i, itemMatcher: /lustre/i, priority: 120 }),
  rule({ id: "electric_differential_breaker_2026", label: "Disjoncteur différentiel · fourniture + pose", trade: "Électricité", unit: "€/u", quoteUnit: "u", low: 200, market: 250, comfortable: 300, basis: "TTC", sources: [SRC.electrician], derivation: "midpoint", methodology: "Fourchette publiée 200–300 € ; Marché = milieu arithmétique.", matcher: /disjoncteur diff[eé]rentiel/i, itemMatcher: /disjoncteur diff[eé]rentiel/i, priority: 125 }),
  rule({ id: "electric_branch_breaker_2026", label: "Disjoncteur de branchement · fourniture + pose", trade: "Électricité", unit: "€/u", quoteUnit: "u", low: 130, market: 155, comfortable: 180, basis: "TTC", sources: [SRC.electrician], derivation: "midpoint", methodology: "Fourchette publiée 130–180 € ; Marché = milieu arithmétique.", matcher: /disjoncteur de branchement/i, itemMatcher: /disjoncteur de branchement/i, priority: 125 }),
  rule({ id: "electric_panel_2026", label: "Pose d’un tableau électrique", trade: "Électricité", unit: "€/u", quoteUnit: "u", low: 600, market: 1300, comfortable: 2000, basis: "TTC", sources: [SRC.electrician, SRC.panel], corroborated: true, derivation: "midpoint", methodology: "Guide électricien : 600–2 000 € ; guide tableau : 400–1 500 € selon configuration. FORGEO conserve la plage du guide électricien, plus large.", matcher: /(?:pose|installer|installation|remplac(?:er|ement)|changer)[^.!?]{0,60}tableau [eé]lectrique|tableau [eé]lectrique[^.!?]{0,60}(?:pose|installer|installation|remplac(?:er|ement)|changer)/i, itemMatcher: /tableau [eé]lectrique/i, exclusion: /mise aux normes/i, priority: 120 }),
  rule({ id: "electric_panel_compliance_2026", label: "Mise aux normes d’un tableau électrique", trade: "Électricité", unit: "€/u", quoteUnit: "u", low: 700, market: 1100, comfortable: 1500, basis: "NON_PRECISE", sources: [SRC.panel], derivation: "midpoint", methodology: "Fourchette publiée 700–1 500 € ; Marché = milieu arithmétique.", matcher: /mise aux normes[^.!?]{0,60}tableau [eé]lectrique|tableau [eé]lectrique[^.!?]{0,60}mise aux normes/i, itemMatcher: /tableau [eé]lectrique|mise aux normes/i, priority: 130 }),
  rule({ id: "electric_rj45_2026", label: "Installation d’une prise RJ45", trade: "Électricité", unit: "€/u", quoteUnit: "u", low: 80, market: 115, comfortable: 150, basis: "TTC", sources: [SRC.electrician], derivation: "midpoint", methodology: "Fourchette publiée 80–150 € ; Marché = milieu arithmétique.", matcher: /(?:prise )?rj\s?45/i, itemMatcher: /rj\s?45/i, priority: 125 }),
  rule({ id: "electric_intercom_2026", label: "Installation d’un interphone", trade: "Électricité", unit: "€/u", quoteUnit: "u", low: 200, market: 325, comfortable: 450, basis: "TTC", sources: [SRC.electrician], derivation: "midpoint", methodology: "Fourchette publiée 200–450 € ; Marché = milieu arithmétique.", matcher: /interphone/i, itemMatcher: /interphone/i, priority: 120 }),
  rule({ id: "facade_cleaning_2026", label: "Nettoyage de façade", trade: "Façade", unit: "€/m²", quoteUnit: "m²", low: 15, market: 27.5, comfortable: 40, basis: "NON_PRECISE", sources: [SRC.facade, SRC.facadeOot], corroborated: true, derivation: "midpoint", methodology: "Ootravaux publie 15–40 €/m² ; Travaux.com publie 5–20 €/m² selon préparation. FORGEO retient la fourchette Ootravaux récente et signale les deux sources.", matcher: /nettoyage[^.!?]{0,60}fa[cç]ade|fa[cç]ade[^.!?]{0,60}nettoyage/i, itemMatcher: /nettoyage|fa[cç]ade/i, priority: 110 }),
  rule({ id: "facade_painting_2026", label: "Ravalement avec peinture", trade: "Façade", unit: "€/m²", quoteUnit: "m²", low: 35, market: 52.5, comfortable: 70, basis: "NON_PRECISE", sources: [SRC.facade, SRC.facadeOot], corroborated: true, derivation: "midpoint", methodology: "Ootravaux publie 35–70 €/m² pour ravalement avec peinture ; Travaux.com annonce 30–50 €/m² pour ravalement simple et 20–50 €/m² pour peinture façade.", matcher: /(?:peinture|peindre|repeindre)[^.!?]{0,80}fa[cç]ade|fa[cç]ade[^.!?]{0,80}(?:peinture|peindre|repeindre)/i, itemMatcher: /peint|fa[cç]ade/i, priority: 115 }),
  rule({ id: "facade_render_2026", label: "Ravalement avec enduit", trade: "Façade", unit: "€/m²", quoteUnit: "m²", low: 50, market: 70, comfortable: 90, basis: "NON_PRECISE", sources: [SRC.facade, SRC.facadeOot], corroborated: true, derivation: "midpoint", methodology: "Ootravaux publie 50–90 €/m² ; Travaux.com 50–100 €/m² pour ravalement avec enduit. Marché = 70 €/m², milieu de la fourchette Ootravaux la plus récente.", matcher: /enduit[^.!?]{0,60}fa[cç]ade|fa[cç]ade[^.!?]{0,60}enduit|ravalement[^.!?]{0,60}enduit/i, itemMatcher: /enduit|fa[cç]ade/i, priority: 120 }),
  rule({ id: "facade_ite_2026", label: "Ravalement avec isolation thermique extérieure (ITE)", trade: "Façade / isolation", unit: "€/m²", quoteUnit: "m²", low: 80, market: 140, comfortable: 200, basis: "NON_PRECISE", sources: [SRC.facade, SRC.facadeOot], corroborated: true, derivation: "midpoint", methodology: "Ootravaux publie 80–150 €/m² ; Travaux.com 100–200 €/m². FORGEO affiche l’enveloppe combinée 80–200 €/m² ; Marché = milieu arithmétique.", matcher: /(?:ite|isolation thermique)[^.!?]{0,80}fa[cç]ade|fa[cç]ade[^.!?]{0,80}(?:ite|isolation thermique)/i, itemMatcher: /ite|isolation|fa[cç]ade/i, priority: 125 }),
  rule({ id: "facade_complete_2026", label: "Ravalement complet", trade: "Façade", unit: "€/m²", quoteUnit: "m²", low: 60, market: 105, comfortable: 150, basis: "NON_PRECISE", sources: [SRC.facadeOot, SRC.facade], corroborated: true, derivation: "midpoint", methodology: "Ootravaux publie 60–150 €/m² pour un ravalement complet ; Marché = milieu arithmétique.", matcher: /ravalement[^.!?]{0,60}compl[eè]t|r[eé]novation compl[eè]te[^.!?]{0,60}fa[cç]ade/i, itemMatcher: /ravalement|fa[cç]ade/i, priority: 105 }),
  rule({ id: "facade_hydrofuge_2026", label: "Traitement hydrofuge façade", trade: "Façade", unit: "€/m²", quoteUnit: "m²", low: 10, market: 17.5, comfortable: 25, basis: "NON_PRECISE", sources: [SRC.facadeOot, SRC.facade], corroborated: true, derivation: "midpoint", methodology: "Ootravaux publie 10–25 €/m² ; Travaux.com 8–12 €/m² selon traitement. FORGEO retient la fourchette Ootravaux récente.", matcher: /hydrofuge[^.!?]{0,60}fa[cç]ade|fa[cç]ade[^.!?]{0,60}hydrofuge/i, itemMatcher: /hydrofuge/i, priority: 115 }),
  rule({ id: "facade_stone_restore_2026", label: "Restauration façade pierre apparente", trade: "Façade / pierre", unit: "€/m²", quoteUnit: "m²", low: 120, market: 210, comfortable: 300, basis: "TTC", sources: [SRC.facadeStone], derivation: "midpoint", methodology: "Fourchette publiée 120–300 €/m² fourniture + main-d’œuvre ; Marché = milieu arithmétique.", matcher: /(?:restauration|ravalement)[^.!?]{0,80}fa[cç]ade[^.!?]{0,40}pierre|fa[cç]ade[^.!?]{0,40}pierre[^.!?]{0,80}(?:restauration|ravalement)/i, itemMatcher: /fa[cç]ade|pierre/i, priority: 120 }),
  rule({ id: "facade_stone_repoint_2026", label: "Rejointoiement façade pierre", trade: "Façade / pierre", unit: "€/m²", quoteUnit: "m²", low: 70, market: 85, comfortable: 100, basis: "TTC", sources: [SRC.facadeStone], derivation: "midpoint", methodology: "Fourchette publiée 70–100 €/m² ; Marché = milieu arithmétique.", matcher: /rejointoiement[^.!?]{0,60}(?:fa[cç]ade|pierre)|(?:fa[cç]ade|pierre)[^.!?]{0,60}rejointoiement/i, itemMatcher: /rejointoiement/i, priority: 120 }),
  rule({ id: "scaffold_mounting_2026", label: "Montage / pose d’échafaudage", trade: "Échafaudage", unit: "€/m²", quoteUnit: "m²", low: 5, market: 10, comfortable: 15, basis: "NON_PRECISE", sources: [SRC.scaffold], derivation: "midpoint", methodology: "Fourchette publiée de montage/pose 5–15 €/m² ; Marché = milieu arithmétique.", matcher: /[eé]chafaudage|[eé]chafaud/i, itemMatcher: /[eé]chafaud/i, exclusion: /location/i, priority: 80 }),
  rule({ id: "scaffold_rental_fixed_2026", label: "Location échafaudage fixe", trade: "Échafaudage", unit: "€/m²/jour", low: 20, market: 30, comfortable: 40, basis: "NON_PRECISE", sources: [SRC.scaffold], derivation: "midpoint", methodology: "Travaux.com publie 20–40 €/m²/jour pour location fixe. Référence informative : unité composée non auto-applicable.", matcher: /location[^.!?]{0,60}[eé]chafaud|[eé]chafaud[^.!?]{0,60}location/i, itemMatcher: /[eé]chafaud/i, priority: 120 }),
  rule({ id: "window_install_only_2026", label: "Pose seule d’une fenêtre", trade: "Menuiserie", unit: "€/u", quoteUnit: "u", low: 150, market: 375, comfortable: 600, basis: "NON_PRECISE", sources: [SRC.window], derivation: "midpoint", methodology: "Fourchette publiée 150–600 € pour pose seule ; Marché = milieu arithmétique.", matcher: /(?:pose|installation)[^.!?]{0,60}fen[eê]tre[^.!?]{0,40}(?:sans fourniture|pose seule)|(?:pose seule|sans fourniture)[^.!?]{0,60}fen[eê]tre/i, itemMatcher: /fen[eê]tre/i, priority: 115 }),
  rule({ id: "window_pvc_installed_2026", label: "Fenêtre PVC · fourniture + pose", trade: "Menuiserie", unit: "€/u", quoteUnit: "u", low: 350, market: 600, comfortable: 850, basis: "NON_PRECISE", sources: [SRC.window], derivation: "midpoint", methodology: "Fourchette publiée 350–850 € pour fenêtre PVC avec pose ; Marché = milieu arithmétique.", matcher: /fen[eê]tre[^.!?]{0,80}pvc|pvc[^.!?]{0,80}fen[eê]tre/i, itemMatcher: /fen[eê]tre|pvc/i, priority: 120 }),
  rule({ id: "window_replacement_2026", label: "Remplacement d’une fenêtre · pose comprise", trade: "Menuiserie", unit: "€/u", quoteUnit: "u", low: 150, market: 675, comfortable: 1200, basis: "NON_PRECISE", sources: [SRC.windowReplace], derivation: "midpoint", methodology: "Fourchette publiée 150–1 200 € par fenêtre pose comprise ; Marché = milieu arithmétique.", matcher: /remplac(?:er|ement)[^.!?]{0,60}fen[eê]tre|fen[eê]tre[^.!?]{0,60}remplac/i, itemMatcher: /fen[eê]tre/i, priority: 110 }),
  rule({ id: "interior_door_labor_2026", label: "Pose seule d’une porte intérieure", trade: "Menuiserie", unit: "€/u", quoteUnit: "u", low: 60, market: 130, comfortable: 200, basis: "TTC", sources: [SRC.door], derivation: "midpoint", methodology: "Fourchette publiée 60–200 € de main-d’œuvre par porte ; Marché = milieu arithmétique.", matcher: /(?:pose|installation)[^.!?]{0,60}porte int[eé]rieure[^.!?]{0,40}(?:seule|sans fourniture)|porte int[eé]rieure[^.!?]{0,60}(?:pose seule|sans fourniture)/i, itemMatcher: /porte/i, priority: 120 }),
  rule({ id: "interior_door_block_2026", label: "Bloc-porte intérieur standard · fourniture + pose", trade: "Menuiserie", unit: "€/u", quoteUnit: "u", low: 250, market: 525, comfortable: 800, basis: "TTC", sources: [SRC.door], derivation: "midpoint", methodology: "Fourchette publiée 250–800 € pour bloc-porte standard pose comprise ; Marché = milieu arithmétique.", matcher: /bloc[- ]porte|porte int[eé]rieure[^.!?]{0,60}(?:fourniture|pose comprise|tout compris)/i, itemMatcher: /porte|bloc[- ]porte/i, priority: 115 }),
  rule({ id: "french_door_pvc_2026", label: "Porte-fenêtre PVC · fourniture + pose", trade: "Menuiserie", unit: "€/u", quoteUnit: "u", low: 500, market: 900, comfortable: 1300, basis: "NON_PRECISE", sources: [SRC.frenchDoor], derivation: "midpoint", methodology: "Fourchette publiée 500–1 300 € avec pose pour PVC ; Marché = milieu arithmétique.", matcher: /porte[- ]fen[eê]tre[^.!?]{0,60}pvc|pvc[^.!?]{0,60}porte[- ]fen[eê]tre/i, itemMatcher: /porte[- ]fen[eê]tre/i, priority: 125 }),
  rule({ id: "heat_pump_air_air_2026", label: "PAC air-air · installation comprise", trade: "Chauffage", unit: "€/forfait", quoteUnit: "forfait", low: 6000, market: 8000, comfortable: 10000, basis: "NON_PRECISE", sources: [SRC.heatPump], derivation: "midpoint", methodology: "Fourchette publiée 6 000–10 000 € installation comprise ; Marché = milieu arithmétique.", matcher: /(?:pac|pompe [àa] chaleur)[^.!?]{0,60}air[- ]air|air[- ]air[^.!?]{0,60}(?:pac|pompe [àa] chaleur)/i, itemMatcher: /pac|pompe [àa] chaleur/i, priority: 125 }),
  rule({ id: "heat_pump_air_water_2026", label: "PAC air-eau · installation comprise", trade: "Chauffage", unit: "€/forfait", quoteUnit: "forfait", low: 9000, market: 12000, comfortable: 15000, basis: "NON_PRECISE", sources: [SRC.heatPump], derivation: "midpoint", methodology: "Fourchette publiée 9 000–15 000 € installation comprise ; Marché = milieu arithmétique.", matcher: /(?:pac|pompe [àa] chaleur)[^.!?]{0,60}air[- ]eau|air[- ]eau[^.!?]{0,60}(?:pac|pompe [àa] chaleur)/i, itemMatcher: /pac|pompe [àa] chaleur/i, priority: 125 }),
  rule({ id: "heat_pump_geothermal_2026", label: "PAC géothermique · installation comprise", trade: "Chauffage", unit: "€/forfait", quoteUnit: "forfait", low: 15000, market: 17500, comfortable: 20000, basis: "NON_PRECISE", sources: [SRC.heatPump], derivation: "midpoint", methodology: "Fourchette publiée 15 000–20 000 € installation comprise ; Marché = milieu arithmétique.", matcher: /(?:pac|pompe [àa] chaleur)[^.!?]{0,60}g[eé]otherm|g[eé]otherm[^.!?]{0,60}(?:pac|pompe [àa] chaleur)/i, itemMatcher: /pac|pompe [àa] chaleur|g[eé]otherm/i, priority: 125 }),
  rule({ id: "heat_pump_install_only_2026", label: "Installation seule d’une pompe à chaleur", trade: "Chauffage", unit: "€/forfait", quoteUnit: "forfait", low: 2000, market: 4000, comfortable: 6000, basis: "NON_PRECISE", sources: [SRC.heatPump], derivation: "midpoint", methodology: "Fourchette publiée 2 000–6 000 € pour installation seule selon complexité ; Marché = milieu arithmétique.", matcher: /(?:installation|pose)[^.!?]{0,60}(?:pac|pompe [àa] chaleur)[^.!?]{0,60}(?:seule|sans fourniture)|(?:pac|pompe [àa] chaleur)[^.!?]{0,60}(?:installation seule|pose seule)/i, itemMatcher: /pac|pompe [àa] chaleur/i, priority: 115 }),
  rule({ id: "heat_pump_maintenance_2026", label: "Entretien annuel pompe à chaleur", trade: "Chauffage", unit: "€/forfait", quoteUnit: "forfait", low: 120, market: 210, comfortable: 300, basis: "NON_PRECISE", sources: [SRC.heatPumpGuide], derivation: "midpoint", methodology: "Fourchette publiée 120–300 € par an ; Marché = milieu arithmétique.", matcher: /entretien[^.!?]{0,60}(?:pac|pompe [àa] chaleur)|(?:pac|pompe [àa] chaleur)[^.!?]{0,60}entretien/i, itemMatcher: /entretien|pac|pompe [àa] chaleur/i, priority: 115 }),
  rule({ id: "locksmith_intervention_2026", label: "Serrurier · intervention courante", trade: "Serrurerie", unit: "€/forfait", quoteUnit: "forfait", low: 80, market: 130, comfortable: 180, basis: "NON_PRECISE", sources: [SRC.locksmith], derivation: "published_average", methodology: "Fourchette publiée 80–180 €, moyenne environ 130 €.", matcher: /serrurier|serrure|ouverture de porte/i, itemMatcher: /serrur|ouverture de porte/i, priority: 60 }),
];

function latestSourceDate(sources: MarketPriceSource[]) {
  return [...sources].map((source) => source.updatedAt).sort().at(-1) ?? "2026-01-01";
}

function confidenceFor(rule: PricingRule): { confidence: MarketPriceConfidence; reason: string } {
  if (rule.sources.length >= 2 && rule.corroborated) {
    return { confidence: "high", reason: `${rule.sources.length} sources ou guides 2026 concordants sur cette prestation.` };
  }
  if (rule.derivation === "published_average") {
    return { confidence: "high", reason: "La source publie une moyenne ou un triplet min/moyen/max." };
  }
  return { confidence: "medium", reason: "Une source 2026 ; le niveau Marché est dérivé d’une fourchette publiée." };
}

function baseRegionalNote(text: string) {
  if (/\b(?:paris|75\d{3}|lyon|69\d{3}|marseille|13\d{3})\b/i.test(text)) {
    return "Grande agglomération détectée. FORGEO n’ajuste le repère que lorsqu’une source publie explicitement un écart régional ; sinon les montants nationaux restent inchangés.";
  }
  return undefined;
}

function applyRegion(rule: PricingRule, text: string, reference: MarketPriceReference): MarketPriceReference {
  const isParis = /\b(?:paris|75\d{3})\b/i.test(text);
  const isLargeCity = /\b(?:paris|75\d{3}|lyon|69\d{3}|marseille|13\d{3})\b/i.test(text);
  if (rule.regional === "electrician_city_band" && isLargeCity) {
    return {
      ...reference,
      low: 70,
      market: 82.5,
      comfortable: 95,
      regionalNote: "Grande agglomération : la source publie 70–95 €/h en moyenne pour Paris, Lyon et Marseille. Cette bande remplace ici le repère national ; elle n’est jamais appliquée sans action de l’artisan.",
    };
  }
  if (rule.regional === "large_city_markup" && isLargeCity) {
    return {
      ...reference,
      regionalNote: "Grande agglomération détectée : la source indique un surcoût possible d’environ 20–30 % en Île-de-France et grandes métropoles. FORGEO ne l’applique pas automatiquement car le chantier et la zone exacte doivent être confirmés.",
    };
  }
  if (rule.regional === "plumber_idf_note" && isParis) {
    return {
      ...reference,
      regionalNote: "Paris / Île-de-France : la source indique que le tarif horaire peut atteindre 140 € HT/h. Faute de borne basse régionale homogène, FORGEO conserve le repère national/province et n’invente pas de fourchette locale.",
    };
  }
  const note = baseRegionalNote(text);
  return note ? { ...reference, regionalNote: note } : reference;
}

function toReference(rule: PricingRule): MarketPriceReference {
  const { matcher: _matcher, itemMatcher: _itemMatcher, exclusion: _exclusion, derivation: _derivation, priority: _priority, corroborated: _corroborated, regional: _regional, ...base } = rule;
  const confidence = confidenceFor(rule);
  return {
    ...base,
    confidence: confidence.confidence,
    confidenceReason: confidence.reason,
    sourceName: rule.sources[0].name,
    sourceUrl: rule.sources[0].url,
    freshnessDate: latestSourceDate(rule.sources),
  };
}

export function getMarketPriceCatalogSize() {
  return RULES.length;
}

export function findMarketPriceReferences(text: string, limit = 8): MarketPriceReference[] {
  const input = text.trim();
  if (!input) return [];
  return RULES
    .filter((candidate) => candidate.matcher.test(input) && !candidate.exclusion?.test(input))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    .slice(0, limit)
    .map((candidate) => applyRegion(candidate, input, toReference(candidate)));
}

function normalizeUnit(unit: string | null | undefined) {
  return String(unit ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/m2/g, "m²")
    .replace(/metres? carres?/g, "m²")
    .replace(/metres? lineaires?/g, "ml")
    .replace(/heures?/g, "h")
    .replace(/journees?/g, "jour")
    .replace(/jours?/g, "jour")
    .replace(/unites?/g, "u")
    .trim();
}

function valueFor(reference: MarketPriceReference, level: MarketPriceLevel) {
  return reference[level];
}

export type MarketPriceApplyResult<T> = {
  items: T[];
  applied: boolean;
  reason: "applied" | "reference_not_found" | "not_applicable" | "no_matching_item" | "ambiguous" | "explicit_price";
  matchedCount: number;
};

export function applyMarketPriceToQuoteItems<T extends { label?: string; unit?: string | null; unit_price?: number | null; quantity?: number | null; tax_rate?: number | null }>(
  items: T[] | undefined,
  selection: MarketPriceSelection,
  contextText = "",
): MarketPriceApplyResult<T> {
  const current = [...(items ?? [])];
  const rule = RULES.find((candidate) => candidate.id === selection.referenceId);
  if (!rule) return { items: current, applied: false, reason: "reference_not_found", matchedCount: 0 };
  if (!rule.quoteUnit || !rule.itemMatcher) return { items: current, applied: false, reason: "not_applicable", matchedCount: 0 };

  const expectedUnit = normalizeUnit(rule.quoteUnit);
  const matches = current
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => rule.itemMatcher!.test(String(item.label ?? "")) && normalizeUnit(item.unit) === expectedUnit);

  if (matches.length === 0) return { items: current, applied: false, reason: "no_matching_item", matchedCount: 0 };
  if (matches.length > 1) return { items: current, applied: false, reason: "ambiguous", matchedCount: matches.length };

  const target = matches[0];
  if (target.item.unit_price !== null && target.item.unit_price !== undefined) {
    return { items: current, applied: false, reason: "explicit_price", matchedCount: 1 };
  }

  const resolvedReference = contextText ? applyRegion(rule, contextText, toReference(rule)) : toReference(rule);
  const next = current.map((item, index) => index === target.index ? { ...item, unit_price: valueFor(resolvedReference, selection.level) } : item);
  return { items: next, applied: true, reason: "applied", matchedCount: 1 };
}

export function formatMarketPrice(value: number) {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(value);
}

export function formatFreshnessDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(year, month - 1, day));
}
