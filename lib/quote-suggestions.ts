import type { LineItem, MobileQuote } from './mobile-prototype';

export type PriceHistoryQuote = { id: string; status: string; items: Array<{ label: string; unit: string | null; unit_price: unknown }> };
export type LearnedPrice = { unitPrice: number; samples: number };
export const SUGGESTION_GREETING = 'Psst… j’ai quelques suggestions pour ton devis 💡';
const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function unitKey(value: string) {
  const normalized = key(value.replace(/²/g, '2'));
  return ['m2', 'metre carre', 'metres carres'].includes(normalized) ? 'm2' : normalized;
}

// Exact designation AND unit: do not mix different supports, finishes or quantities.
// One observation per accepted quote prevents repeated rows overweighting a price.
export function learnedSellingPrice(label: string, unit: string | null, history: PriceHistoryQuote[], excludeId = ''): LearnedPrice | null {
  if (!label.trim() || !unit?.trim() || /(?:rse|remise|majoration|%)/iu.test(label)) return null;
  const prices: number[] = [];
  for (const quote of history) {
    if (quote.id === excludeId || !['accepted', 'Validé', 'Terminé'].includes(quote.status)) continue;
    const matches = quote.items.filter(item => key(item.label) === key(label) && unitKey(item.unit || '') === unitKey(unit));
    const values = matches.map(item => item.unit_price === null || item.unit_price === '' ? NaN : Number(item.unit_price));
    if (!values.length || values.some(value => !Number.isFinite(value) || value <= 0) || new Set(values).size !== 1) continue;
    prices.push(values[0]);
    if (prices.length >= 20) break;
  }
  if (!prices.length) return null;
  prices.sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  const price = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  return { unitPrice: Math.round(price * 100) / 100, samples: prices.length };
}

export type QuoteSuggestion = { id: string; label: string; reason: string; unit: string; lineId?: string; price?: LearnedPrice };
const rules = [
  { id: 'protection', trigger: /peint|enduit|ratiss|ponc|platr|placo/, present: /protect|bach/, label: 'Protection des sols et du mobilier', reason: 'Pour les travaux de peinture ou de préparation.', unit: 'forfait' },
  { id: 'preparation', trigger: /peint/, present: /prepar|lessiv|ponc|rebouch|ratiss|enduit|impression|sous couche/, label: 'Préparation des supports', reason: 'À adapter à l’état des murs avant peinture.', unit: 'm²' },
  { id: 'dechets', trigger: /depos|demol|remplac|renov/, present: /evacu|dechet|dechetterie|gravats/, label: 'Évacuation des déchets', reason: 'Si la dépose produit des déchets à évacuer.', unit: 'forfait' },
  { id: 'essais', trigger: /plomb|robinet|chauff|sanitaire|electri|cabl|tableau/, present: /essai|test|mise en service|verification/, label: 'Essais et mise en service', reason: 'Selon l’installation réalisée.', unit: 'forfait' },
];

export function buildQuoteSuggestions(quote: MobileQuote, history: PriceHistoryQuote[] = []): QuoteSuggestion[] {
  if (quote.status !== 'En attente') return [];
  const text = key([quote.title, ...quote.items.flatMap(item => [item.label, item.description])].join(' '));
  const prices = quote.items.flatMap(item => {
    if (item.unitPrice !== null) return [];
    const price = learnedSellingPrice(item.label, item.unit, history, quote.id);
    return price ? [{ id: `price-${item.id}`, lineId: item.id, label: item.label, reason: `Ton tarif habituel : ${price.unitPrice} € HT/${item.unit} (${price.samples} devis validé${price.samples > 1 ? 's' : ''}).`, unit: item.unit || '', price }] : [];
  });
  return [...prices, ...rules.filter(rule => rule.trigger.test(text) && !rule.present.test(text)).map(rule => ({ id: rule.id, label: rule.label, reason: rule.reason, unit: rule.unit }))].slice(0, 3);
}

export function applyQuoteSuggestion(quote: MobileQuote, suggestion: QuoteSuggestion, input: { quantity: number; unitPrice: number; taxRate: number; id: string }): MobileQuote {
  if (quote.status !== 'En attente') throw new Error('Ce devis ne peut plus recevoir cette suggestion.');
  if (![input.quantity, input.unitPrice, input.taxRate].every(Number.isFinite) || input.quantity <= 0 || input.unitPrice < 0 || ![0, 5.5, 10, 20].includes(input.taxRate)) throw new Error('Complète la quantité, le prix HT et la TVA.');
  let items: LineItem[];
  if (suggestion.lineId) {
    const line = quote.items.find(item => item.id === suggestion.lineId);
    if (!line || line.unitPrice !== null) throw new Error('Le prix de cette ligne a déjà été renseigné.');
    items = quote.items.map(item => item.id === line.id ? { ...item, quantity: item.quantity ?? input.quantity, taxRate: item.taxRate ?? input.taxRate, unitPrice: input.unitPrice, provenance: 'company_history' as const } : item);
  } else {
    if (quote.items.some(item => key(item.label) === key(suggestion.label))) throw new Error('Ce poste est déjà présent dans le devis.');
    items = [...quote.items, { id: input.id, label: suggestion.label, description: '', quantity: input.quantity, unit: suggestion.unit, unitPrice: input.unitPrice, taxRate: input.taxRate, provenance: 'user_explicit' }];
  }
  return { ...quote, items };
}
