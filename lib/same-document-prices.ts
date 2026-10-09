import { documentUnit } from './document-units';
import { explicitPrice, groundedEvidence } from './voice-facts';

function serviceKey(label: string) {
  return label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\b(?:salle a manger|salle (?:de )?bains?|chambre(?:\s+(?:numero\s*)?\d+)?|salon|sejour|cuisine|couloir|entree|bureau|placard|garage)\b/gu, '')
    .replace(/\b(?:rez de chaussee|etage|premier|deuxieme)\b/gu, '')
    .replace(/\b(?:toile de verre|structure a peindre)\b/gu, 'revetement a peindre')
    .replace(/\bdeux couches\b/gu, '2 couches')
    .replace(/[^a-z0-9]+/g, ' ').split(' ')
    .filter(word => word && !['de','du','des','le','la','les','a','au','et','en','sur','une','un','avec'].includes(word))
    .sort().join(' ');
}

type PricedLine = {label: string; unit: string | null; unit_price: number | null; tax_rate: number | null; price_type: string; spoken_price_ttc: number | null; spoken_price_ambiguous: number | null};

/** Reuse only a price actually supplied for an equivalent service, never a model estimate. */
export function reuseSameDocumentPrices<T extends PricedLine>(items: T[], raw: Record<string, unknown>[], transcript: string): T[] {
  const supplied = items.map((item, index) => {
    const evidence = groundedEvidence(transcript, raw[index]?.price_evidence);
    return Boolean(evidence && explicitPrice(evidence) !== null && item.unit_price !== null);
  });
  const signature = (item: T) => `${serviceKey(item.label)}|${documentUnit(item.unit)}`;
  return items.map((item, index) => {
    if (supplied[index] || item.spoken_price_ttc !== null || item.spoken_price_ambiguous !== null || !item.unit || !serviceKey(item.label)) return item;
    const donors = items.filter((donor, donorIndex) => supplied[donorIndex] && signature(donor) === signature(item));
    const prices = [...new Set(donors.map(donor => donor.unit_price))];
    // A differently priced target may have its own local dictated amount even
    // if the model omitted price_evidence. Preserve it when it occurs in speech.
    if (item.unit_price !== null && [...transcript.matchAll(/\d+(?:[,.]\d+)?\s*(?:€|euros?)/giu)].some(match => explicitPrice(match[0]) === item.unit_price)) return item;
    if (prices.length > 1) return {...item, unit_price: null};
    if (!prices.length) return item;
    return {...item, unit_price: prices[0], price_type: 'ht', price_source: 'same_document'};
  });
}
