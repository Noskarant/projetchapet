import { explicitPrice, spokenPriceType } from './voice-facts';
import { spokenAmountPattern } from './spoken-financial-number';

const clean = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ');
const rooms = /\b(?:salle\s+(?:de\s+)?bains?|cuisine|chambre(?:\s+\d+)?|salon|sejour|couloir|entree|bureau|garage|terrasse)\b/gu;
const roomKey = (text: string) => text.replace(/salle\s+(?:de\s+)?bains?/, 'salle de bain');

/** A unit price belongs only to an explicitly named, unambiguous line. */
export function scopedVoiceUnitPrices(transcript: string, items: Array<{ label: string; unit?: string | null }>) {
  const result: Array<ReturnType<typeof sharedVoiceUnitPrice>> = items.map(() => null);
  // Keep decimal points/commas; split on sentence punctuation and clear transitions.
  const clauses = transcript.split(/(?<!\d)[.;!?]|[.;!?](?!\d)|\n|\bpuis\b|\bensuite\b/iu);
  for (const clause of clauses) {
    const prices = [...clause.matchAll(new RegExp(`(${spokenAmountPattern})\\s*(?:€|euros?)\\s*(?:HT|TTC|hors[- ]taxes?|toutes? taxes? comprises?)?|(${spokenAmountPattern})\\s*(?:HT|TTC|hors[- ]taxes?)`, 'giu'))];
    for (const [position, price] of prices.entries()) {
      const previous = prices[position - 1];
      const next = prices[position + 1];
      const before = clause.slice(previous ? previous.index! + previous[0].length : 0, price.index);
      const after = clause.slice(price.index! + price[0].length, next?.index ?? clause.length);
      const context = `${before} ${price[0]}`;
      if (/\b(?:total|forfait|franchise|remise)\b/iu.test(context)) continue;
      const amount = explicitPrice(price[0]) ?? explicitPrice(`${price[1] || price[2]} euros`);
      const type = spokenPriceType(price[0]);
      if (amount === null || type === null) continue;
      // A post-price unit must be introduced explicitly ("29 HT par rouleau").
      const evidence = clean(`${before} ${after.match(/^\s*(?:(?:chaque|par|le|la|l['’])\s*)\p{L}+/iu)?.[0] || ''}`);
      const candidates = items.map((item, index) => {
        const unit = clean(item.unit || '').replace(/s$/u, '');
        // Area units alone do not identify which wall, room or surface is priced.
        if (!unit || /^(?:m[²2l]?|u|unite|forfait)$/u.test(unit)) return { index, score: 0 };
        const words = clean(item.label).match(/[a-z]{4,}/gu) || [];
        const namedUnit = new RegExp(`\\b${unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[xs]?\\b`, 'u').test(evidence);
        return { index, score: namedUnit ? 1 + words.filter(word => evidence.includes(word)).length : 0 };
      }).filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score);
      if (candidates.length && (candidates.length === 1 || candidates[0].score > candidates[1].score)) result[candidates[0].index] = { amount, type, evidence: context };
    }
  }
  return result;
}

export function groupedVoiceLineOrder(transcript: string, items: Array<{ id: string; label: string; description?: string }>) {
  const command = clean(transcript);
  if (!/\b(?:regroup\w*|rassembl\w*|class\w*|ordonn\w*|tri\w*)\b|\bensemble\b/u.test(command)) return undefined;
  const requested = [...new Set([...command.matchAll(rooms)].map(match => roomKey(match[0])))];
  const keys = items.map(item => {
    const matches = [...new Set([...clean(`${item.label} ${item.description || ''}`).matchAll(rooms)].map(match => roomKey(match[0])))];
    return matches.length === 1 ? matches[0] : '';
  });
  const groups = requested.length ? requested : [...new Set(keys.filter(Boolean))];
  if (!groups.length) return undefined;
  const selected = items.map((item, index) => ({ item, key: keys[index] })).filter(entry => groups.includes(entry.key));
  if (selected.length < 2) return undefined;
  const ordered = groups.flatMap(key => selected.filter(entry => entry.key === key).map(entry => entry.item.id));
  let index = 0;
  // Leave unclassified or ambiguous lines at their original positions.
  return items.map((item, position) => groups.includes(keys[position]) ? ordered[index++] : item.id);
}

export function sharedVoiceUnitPrice(transcript: string, lineCount: number) {
  const command = clean(transcript);
  const shared = /\b(?:meme\s+(?:prix|tarif|montant)|prix\s+identique|pareil)\b/u.test(command);
  const all = /\b(?:toutes?\s+(?:les\s+)?(?:lignes|prestations|postes)|chaque\s+(?:ligne|prestation|poste)|chacun[e]?)\b/u.test(command);
  const otherTwo = lineCount === 3 && /\bles\s+(?:deux|2)\s+autres\s+(?:lignes|prestations|postes)\b/u.test(command);
  // A single price plus an explicit whole-document scope; no guess about a subset.
  if (!shared || (!all && !otherTwo)) return null;
  const prices = [...transcript.matchAll(new RegExp(`${spokenAmountPattern}\\s*(?:€|euros?)`, 'giu'))];
  if (prices.length !== 1) return null;
  const amount = explicitPrice(prices[0][0]);
  const type = spokenPriceType(transcript);
  return amount !== null && type ? { amount, type, evidence: transcript } : null;
}
