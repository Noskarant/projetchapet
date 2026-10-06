import type { LineItem } from './mobile-prototype';
import { isDeductibleLine } from './document-deductible';
import { spokenAmountPattern, spokenFinancialNumber } from './spoken-financial-number';
const marker = /^Calcul automatique : (\d+(?:[,.]\d+)?) % du montant HT des autres postes\./u;
export function linePercentage(line: LineItem) {
  const match = line.description.match(marker);
  return match ? Number(match[1].replace(',', '.')) : null;
}
export function recalculatePercentageLines(items: LineItem[]) {
  const base = items.filter(item => linePercentage(item) === null && !isDeductibleLine(item));
  return items.map(item => {
    const percent = linePercentage(item);
    if (percent === null) return item;
    const amount = base.filter(line => line.taxRate === item.taxRate).reduce((sum, line) => sum + (line.quantity ?? 0) * (line.unitPrice ?? 0), 0);
    return { ...item, quantity: 1, unit: 'forfait', unitPrice: base.some(line => line.taxRate === item.taxRate && (line.quantity === null || line.unitPrice === null)) ? null : Math.round(amount * percent) / 100 };
  });
}
export function spokenDiscount(transcript: string) {
  const matches = [...transcript.matchAll(new RegExp(`remise(?:\\s+(?:de|à|a))?\\s*(${spokenAmountPattern})\\s*(?:%|pour\\s*cent)`, 'giu'))];
  const value = matches.length ? spokenFinancialNumber(matches.at(-1)![1]) : null;
  return value !== null && value >= 0 && value <= 100 ? value : null;
}
export function applySpokenPercentageLines(items: LineItem[], transcript: string): LineItem[] {
  const pattern = new RegExp(`\\b(RSE(?:\\s+environnemental(?:e|es|s)?)?|éco[- ]?participation|frais\\s+(?:de\\s+)?(?:gestion|chantier|déplacement)|(?:poste|majoration)\\s+[\\p{L}][\\p{L} -]{0,45}?)\\s*(?:(?:à|a|de)\\s*)?(${spokenAmountPattern})\\s*(?:%|pour\\s*cent)`, 'giu');
  let result = [...items];
  for (const match of transcript.matchAll(pattern)) {
    const percent = spokenFinancialNumber(match[2]);
    if (percent === null || percent < 0 || percent > 100) continue;
    const label = match[1].replace(/^poste\s+/iu, '').trim();
    const sameAdjustment = (value: string) => value
      .replace(/\s*\([^)]*%[^)]*\)\s*$/u, '')
      .replace(new RegExp(`\\s*(?:(?:à|a|de)\\s+)?${spokenAmountPattern}\\s*(?:%|pour\\s*cent)\\s*$`, 'iu'), '')
      .replace(/^(?:majoration|contribution|poste)\s+(?=RSE\b)/iu, '')
      .replace(/^RSE\b.*$/iu, 'RSE')
      .trim().toLocaleLowerCase('fr-FR');
    const existing = result.filter(item => sameAdjustment(item.label) === sameAdjustment(label));
    result = result.filter(item => sameAdjustment(item.label) !== sameAdjustment(label));
    const rates = [...new Set(result.filter(item => linePercentage(item) === null && !isDeductibleLine(item)).map(item => item.taxRate))];
    const position = result.findIndex(isDeductibleLine);
    const additions = rates.map(rate => ({ id: existing.find(item => item.taxRate === rate)?.id || `percent-${label}-${rate}`, label: `${label} (${percent} %)`, description: `Calcul automatique : ${percent} % du montant HT des autres postes.`, quantity: 1, unit: 'forfait', unitPrice: 0, taxRate: rate }));
    result.splice(position < 0 ? result.length : position, 0, ...additions);
  }
  return recalculatePercentageLines(result);
}
