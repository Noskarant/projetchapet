export type RappidosSuggestion = {
  id: string;
  label: string;
  reason: string;
  unit: string;
};

type Rule = RappidosSuggestion & {
  context: RegExp;
  alreadyCovered: RegExp;
};

const RULES: Rule[] = [
  {
    id: "site_protection",
    label: "Protection du chantier",
    reason: "La prestation peut nécessiter la protection des sols, meubles ou zones voisines.",
    unit: "forfait",
    context: /peint|plafond|mur|fa[iï]ence|carrel|parquet|sol|pon[cç]|ratiss|enduit|pl[aâ]tr|d[eé]mol|ma[cç]on/i,
    alreadyCovered: /protection|b[aâ]ch|polyane|masquage|prot[eé]ger/i,
  },
  {
    id: "surface_preparation",
    label: "Préparation des supports",
    reason: "Le support peut nécessiter une préparation avant la finition.",
    unit: "m²",
    context: /peint|enduit|fa[cç]ade|papier\s*peint|rev[eê]tement|carrel|fa[iï]ence/i,
    alreadyCovered: /pr[eé]paration|rebouch|ratiss|pon[cç]|lessiv|impression|primaire|ragr[eé]age/i,
  },
  {
    id: "scaffolding",
    label: "Échafaudage / moyen d’accès",
    reason: "Un travail en hauteur peut nécessiter un moyen d’accès spécifique.",
    unit: "forfait",
    context: /fa[cç]ade|toiture|couverture|goutti[eè]re|zing|velux|pignon|hauteur|corniche|ravalement/i,
    alreadyCovered: /[eé]chafaud|nacelle|plateforme|moyen d.acc[eè]s/i,
  },
  {
    id: "waste_disposal",
    label: "Évacuation des déchets",
    reason: "Une dépose, démolition ou reprise peut générer des déchets à évacuer.",
    unit: "forfait",
    context: /d[eé]pose|d[eé]mol|d[eé]garniss|d[eé]mont|arrach|gravats|remplacement|r[eé]fection/i,
    alreadyCovered: /[eé]vacuation|d[eé]chet|gravats|benne|d[eé]chetterie/i,
  },
  {
    id: "commissioning_tests",
    label: "Essais et remise en service",
    reason: "Une intervention technique peut nécessiter des essais avant livraison.",
    unit: "forfait",
    context: /[eé]lectric|tableau|prise|radiateur|chaudi[eè]re|pompe [àa] chaleur|plomb|sanitaire|robinet|chauffage/i,
    alreadyCovered: /essai|test|mise en service|remise en service|contr[oô]le/i,
  },
  {
    id: "finishing_cleanup",
    label: "Nettoyage de fin de chantier",
    reason: "Le nettoyage final est souvent oublié dans la dictée initiale.",
    unit: "forfait",
    context: /chantier|travaux|peint|carrel|menuiser|ma[cç]on|r[eé]novation|pose|r[eé]fection/i,
    alreadyCovered: /nettoyage|repli|fin de chantier/i,
  },
];

export function suggestRappidosExtras(transcript: string, limit = 3): RappidosSuggestion[] {
  const text = transcript.trim();
  if (!text) return [];

  const suggestions: RappidosSuggestion[] = [];
  for (const rule of RULES) {
    if (!rule.context.test(text) || rule.alreadyCovered.test(text)) continue;
    suggestions.push({ id: rule.id, label: rule.label, reason: rule.reason, unit: rule.unit });
    if (suggestions.length >= limit) break;
  }
  return suggestions;
}

export function appendSuggestionsWithoutInventing<T extends { label?: string; quantity?: number; unit?: string; unit_price?: number; tax_rate?: number }>(
  items: T[] | undefined,
  suggestions: RappidosSuggestion[],
): T[] {
  const current = [...(items ?? [])];
  const labels = current.map((item) => String(item.label ?? "").toLowerCase());

  for (const suggestion of suggestions) {
    if (labels.some((label) => label.includes(suggestion.label.toLowerCase()))) continue;
    current.push({
      label: suggestion.label,
      quantity: 0,
      unit: suggestion.unit,
      unit_price: 0,
      tax_rate: 0,
    } as T);
  }
  return current;
}
