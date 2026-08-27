import { DEFAULT_COPILOT_TRADE } from "./trade-packs";
import type { CopilotTrade } from "./types";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const UPHOLSTERY_SIGNALS: Array<[RegExp, number]> = [
  [/tapiss|tapisserie/, 4],
  [/fauteuil|bergere|crapaud|cabriolet|voltaire/, 3],
  [/degarniss|garniture traditionnelle|sanglage|ressorts?|crin/, 3],
  [/passementerie|galon|passepoil/, 2],
  [/rideaux?|tenture|voilage/, 2],
  [/tissu/, 1],
];

const PAINTING_SIGNALS: Array<[RegExp, number]> = [
  [/peint|repeind|peinture/, 4],
  [/murs?|plafonds?/, 2],
  [/enduit|poncage|sous[ -]?couche|impression/, 2],
  [/fissure|velours|satin|mat/, 1],
];

function score(text: string, signals: Array<[RegExp, number]>) {
  return signals.reduce((total, [pattern, weight]) => total + (pattern.test(text) ? weight : 0), 0);
}

export function detectCopilotTradeFromDescription(description: string): CopilotTrade {
  const text = normalize(description);
  const upholsteryScore = score(text, UPHOLSTERY_SIGNALS);
  const paintingScore = score(text, PAINTING_SIGNALS);

  if (upholsteryScore >= 3 && upholsteryScore > paintingScore) {
    return "upholstery_decorator";
  }
  return DEFAULT_COPILOT_TRADE;
}
