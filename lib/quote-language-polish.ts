type QuoteLikeItem = {
  label?: string;
  quantity?: number | null;
  unit?: string | null;
  unit_price?: number | null;
  tax_rate?: number | null;
  [key: string]: unknown;
};

const TYPOGRAPHIC_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bplaintes?\b/giu, "plinthes"],
  [/\bpreparation\b/giu, "préparation"],
  [/\bdepose\b/giu, "dépose"],
  [/\bevacuations?\b/giu, "évacuation"],
  [/\bechafaudage\b/giu, "échafaudage"],
  [/\betancheite\b/giu, "étanchéité"],
  [/\belectricite\b/giu, "électricité"],
  [/\bfacade\b/giu, "façade"],
  [/\bplatre\b/giu, "plâtre"],
  [/\breagreage\b/giu, "ragréage"],
  [/\bsous[\s-]+couche\b/giu, "sous-couche"],
  [/\bmain[\s-]+d[’'\s-]*(?:oeuvre|œuvre)\b/giu, "main-d’œuvre"],
];

export function polishFrenchTradeDesignation(value: string) {
  let result = value.trim().replace(/\s+/g, " ");
  for (const [pattern, replacement] of TYPOGRAPHIC_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  result = result.replace(/\b(\d+(?:[,.]\d+)?)\s+(rouleaux?|pots?|seaux?|litres?|heures?|portes?|fenêtres?)\b/giu,
    (_match, rawQuantity: string, rawUnit: string) => {
      const quantity = Number(rawQuantity.replace(",", "."));
      const base = rawUnit.toLocaleLowerCase("fr-FR").replace(/x$/u, "").replace(/s$/u, "");
      const plural = quantity > 1 ? base === "rouleau" ? "rouleaux" : base === "seau" ? "seaux" : `${base}s` : base;
      return `${rawQuantity} ${plural}`;
    });
  if (!result) return "";
  return result.charAt(0).toLocaleUpperCase("fr-FR") + result.slice(1);
}

export function polishQuoteItems<T extends QuoteLikeItem>(items: T[] | undefined) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => ({
    ...item,
    label: typeof item.label === "string" ? polishFrenchTradeDesignation(item.label) : item.label,
  }));
}
