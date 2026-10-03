import type { LineItem } from './mobile-prototype';
const marker = /^Calcul automatique : (\d+(?:[,.]\d+)?) % du montant HT des autres postes\./u;
export function linePercentage(line: LineItem) {
  const match = line.description.match(marker);
  return match ? Number(match[1].replace(',', '.')) : null;
}
export function recalculatePercentageLines(items: LineItem[]) {
  const base = items.filter(item => linePercentage(item) === null);
  return items.map(item => {
    const percent = linePercentage(item);
    if (percent === null) return item;
    const amount = base.filter(line => line.taxRate === item.taxRate).reduce((sum, line) => sum + (line.quantity ?? 0) * (line.unitPrice ?? 0), 0);
    return { ...item, quantity: 1, unit: 'forfait', unitPrice: base.some(line => line.taxRate === item.taxRate && (line.quantity === null || line.unitPrice === null)) ? null : Math.round(amount * percent) / 100 };
  });
}
export function spokenDiscount(transcript: string) {
  const matches = [...transcript.matchAll(/remise(?:\s+(?:de|à|a))?\s*(\d+(?:[,.]\d+)?)\s*(?:%|pour\s*cent)/giu)];
  const value = Number(matches.at(-1)?.[1]?.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}
export function applySpokenPercentageLines(items: LineItem[], transcript: string): LineItem[] {
  const pattern = /\b(RSE|éco[- ]?participation|frais\s+(?:de\s+)?(?:gestion|chantier|déplacement)|(?:poste|majoration)\s+[\p{L}][\p{L} -]{0,45}?)\s*(?:(?:à|a|de)\s*)?(\d+(?:[,.]\d+)?)\s*(?:%|pour\s*cent)/giu;
  let result = [...items];
  for (const match of transcript.matchAll(pattern)) {
    const percent = Number(match[2].replace(',', '.'));
    if (percent < 0 || percent > 100) continue;
    const label = match[1].replace(/^poste\s+/iu, '').trim();
    result = result.filter(item => item.label.replace(/\s*\([^)]*%[^)]*\)\s*$/u, '').trim().toLocaleLowerCase('fr-FR') !== label.toLocaleLowerCase('fr-FR'));
    const rates = [...new Set(result.filter(item => linePercentage(item) === null).map(item => item.taxRate))];
    for (const rate of rates) result.push({ id: `percent-${label}-${rate}`, label: `${label} (${percent} %)`, description: `Calcul automatique : ${percent} % du montant HT des autres postes.`, quantity: 1, unit: 'forfait', unitPrice: 0, taxRate: rate });
  }
  return recalculatePercentageLines(result);
}
