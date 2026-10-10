const key = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const amount = String.raw`\d[\d \u00a0\u202f]*(?:[,.]\d{1,2})?`;
const number = (text: string) => Number(text.replace(/\s/g, '').replace(',', '.'));
/** Read only complete, labelled monetary rows, never a summary or bank account. */
export function sourceTableFacts(transcript: string, label: string) {
  const marker = 'Informations issues des sources à vérifier :';
  if (!transcript.includes(marker)) return null;
  const observations = transcript.slice(transcript.indexOf(marker) + marker.length);
  const headers = [...observations.matchAll(/(?:description|désignation)\s*[|;]?\s*(?:qt[ée]|quantit[ée])\s*[|;]?\s*(?:prix\s+unitaire|pu)\s*(HT|TTC)?\s*[|;]?\s*TVA\s*[|;]?\s*total\s*(HT|TTC)\b/giu)];
  const candidates: Array<{quantity: number; unit: string; unit_price: number; tax_rate: number; price_type: 'ht' | 'ttc'; score: number}> = [];
  for (let index = 0; index < headers.length; index++) {
    const header = headers[index];
    if (header[1] && header[1].toLowerCase() !== header[2].toLowerCase()) continue;
    const type = (header[1] || header[2]).toLowerCase() as 'ht' | 'ttc';
    const block = observations.slice(header.index! + header[0].length, headers[index + 1]?.index)
      .split(/(?:\bsous[- ]?total|\btotal\s+(?:HT|TTC)|montant\s+total\s+de\s+la\s+TVA|détails\s+du\s+paiement)/iu)[0];
    const pattern = new RegExp(`(${amount})\\s*(m[²2]|unités?|U|forfaits?|rouleaux?|heures?|h)\\s*[|;]?\\s*(${amount})\\s*(?:€|euros?)\\s*[|;]?\\s*(0|5[,.]5|10|20)\\s*%\\s*[|;]?\\s*(${amount})\\s*(?:€|euros?)`, 'giu');
    let previous = 0;
    for (const match of block.matchAll(pattern)) {
      const rawContext = block.slice(previous, match.index);
      const context = key(rawContext);
      previous = match.index! + match[0].length;
      const wanted = key(label);
      if (!wanted || !context.includes(wanted)) continue;
      const score = key(rawContext.trim().split('\n').at(-1) || '') === wanted ? 4
        : rawContext.split('\n').some(line => key(line) === wanted) ? 3
        : context.startsWith(wanted) ? 2 : 1;
      const quantity = number(match[1]);
      const price = number(match[3]);
      // A total inconsistent with its own row is not reliable evidence.
      if (Math.abs(Math.round(quantity * price * 100) / 100 - number(match[5])) > 0.02) continue;
      candidates.push({quantity, unit: match[2], unit_price: price, tax_rate: number(match[4]), price_type: type, score});
    }
  }
  const strongest = candidates.filter(candidate => candidate.score === Math.max(...candidates.map(item => item.score)));
  if (strongest.length !== 1) return null;
  const { score: _score, ...facts } = strongest[0];
  return facts;
}
