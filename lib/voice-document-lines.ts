import { explicitPrice, spokenPriceType } from './voice-facts';
import { spokenAmountPattern } from './spoken-financial-number';

const clean = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’']/g, ' ');
const rooms = /\b(?:salle\s+(?:de\s+)?bains?|cuisine|chambre(?:\s+\d+)?|salon|sejour|couloir|entree|bureau|garage|terrasse)\b/gu;
const roomKey = (text: string) => text.replace(/salle\s+(?:de\s+)?bains?/, 'salle de bain');

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
