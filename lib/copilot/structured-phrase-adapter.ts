import type { StructuredCopilotTrade } from "./types";

export function normalizeStructuredTradePhrasing(trade: StructuredCopilotTrade, description: string) {
  let normalized = description;

  if (trade === "masonry") {
    normalized = normalized
      .replace(/(\d+(?:[.,]\d+)?\s*(?:m2|m²|mètres? carrés?))\s+de\s+mur\s+en\s+(parpaings?|briques?|blocs?)/gi, "$1 de $2")
      .replace(/(\d+(?:[.,]\d+)?\s*(?:m2|m²|mètres? carrés?))\s+de\s+maçonnerie\s+en\s+(parpaings?|briques?|blocs?)/gi, "$1 de $2");
  }

  return normalized;
}
