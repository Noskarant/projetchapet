import { DEFAULT_COPILOT_TRADE } from "./trade-packs";
import type { CopilotTrade } from "./types";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

type Signals = Array<[RegExp, number]>;

const TRADE_SIGNALS: Partial<Record<CopilotTrade, Signals>> = {
  upholstery_decorator: [
    [/tapiss|tapisserie/, 5],
    [/fauteuil|bergere|crapaud|cabriolet|voltaire/, 3],
    [/degarniss|garniture traditionnelle|sanglage|ressorts?|crin/, 3],
    [/passementerie|galon|passepoil/, 2],
  ],
  interior_painting: [
    [/peint|repeind|peinture/, 5],
    [/murs?|plafonds?/, 1],
    [/enduit|poncage|sous[ -]?couche|impression/, 2],
  ],
  plumbing_heating: [
    [/plomb|chauffag|chaudiere|pompe a chaleur|\bpac\b|climatisation/, 5],
    [/multicouche|\bper\b|cuivre|radiateur|sanitaire|wc|vasque/, 3],
  ],
  electrician: [
    [/electric|tableau electrique|2p\+t|\bdcl\b|disjoncteur|differentiel/, 5],
    [/prises?|points? lumineux|gaine icta|cablage/, 2],
  ],
  carpentry_joinery: [
    [/menuiser|agencement|dressing|bibliotheque|meuble sur mesure/, 5],
    [/plan de travail|mdf|contreplaque|caisson|quincaillerie/, 2],
  ],
  tiling_flooring: [
    [/carrelage|carreleur|faience|parquet|ragreage|sol pvc|\blvt\b/, 5],
    [/plinthes?|gres cerame|natte d etancheite|\bspec\b/, 2],
  ],
  roofing: [
    [/couvreur|couverture|toiture|tuiles?|ardoises?|zinguerie/, 5],
    [/faitage|gouttiere|solin|abergement|velux/, 2],
  ],
  masonry: [
    [/macon|maconnerie|parpaing|dalle beton|fondation|semelle/, 5],
    [/chape|linteau|demolition de mur|ouvrir un mur/, 2],
  ],
  landscaping: [
    [/paysag|engazonnement|gazon|haie|elagage|cloture/, 4],
    [/plantation|arbustes?|pavage|terrassement|grillage/, 2],
  ],
  locksmith_metalwork: [
    [/serrurier|serrure|cylindre|barillet|metallerie|garde[- ]?corps/, 5],
    [/main courante|portail|structure acier|soudure/, 2],
  ],
};

function score(text: string, signals: Signals) {
  return signals.reduce((total, [pattern, weight]) => total + (pattern.test(text) ? weight : 0), 0);
}

export function detectCopilotTradeFromDescription(description: string): CopilotTrade {
  const text = normalize(description);
  let bestTrade: CopilotTrade = DEFAULT_COPILOT_TRADE;
  let bestScore = 0;

  for (const [trade, signals] of Object.entries(TRADE_SIGNALS) as Array<[CopilotTrade, Signals]>) {
    const current = score(text, signals);
    if (current > bestScore) {
      bestScore = current;
      bestTrade = trade;
    }
  }

  return bestScore >= 3 ? bestTrade : DEFAULT_COPILOT_TRADE;
}
