import { spokenAmountPattern, spokenFinancialNumber } from './spoken-financial-number';
import type { LineItem } from './mobile-prototype';
// Legacy notes remain readable; newly dictated franchises are negative document lines.
const notePattern = /Franchise à déduire du montant TTC\s*:\s*(\d+(?:[,.]\d+)?)\s*€\.?/iu;
const priceTypePattern = '(?:TTC|HT|toutes? taxes? comprises?|hors[- ]taxes?)';
const franchisePattern = new RegExp(`\\bfranchise\\s*(?:(${priceTypePattern})\\s*)?(?:(?:[àa]\\s+(?:r[ée]cup[ée]r[ée]?r?|recouvrer|d[ée]duire)(?:\\s+(?:aupr[èe]s\\s+du\\s+client|du\\s+montant\\s+TTC))?|[àa]\\s+la\\s+charge\\s+(?:du\\s+client|de\\s+l['’]assur[ée]))\\s*)?(?:(${priceTypePattern})\\s*)?[:：]?\\s*(?:de\\s+)?(${spokenAmountPattern})\\s*(?:€|euros?)\\s*(${priceTypePattern})?(?:\\s*[,;]?\\s*(?:avec\\s+)?TVA\\s*(?:[àa]\\s*)?(${spokenAmountPattern})\\s*(?:%|pour\\s+cent))?`, 'giu');

export function isDeductibleLine(line: Pick<LineItem, 'label'>) {
  return /^franchise(?:\s|$)/iu.test(line.label.trim());
}

export function spokenDeductibleAdjustment(transcript: string) {
  const instructions = transcript.split('Informations issues des sources à vérifier')[0];
  const matches = [...instructions.matchAll(franchisePattern)];
  const match = matches.at(-1) ?? [...transcript.matchAll(franchisePattern)]
    .filter(candidate => /(?:à|a)\s+d[ée]duire/iu.test(candidate[0])).at(-1);
  if (!match) return null;
  const amount = spokenFinancialNumber(match[3]);
  if (amount === null || amount > 1_000_000) return null;
  const types = [...new Set([match[1],match[2],match[4]].filter(Boolean).map(value => /ttc|comprise/iu.test(value) ? 'ttc' : 'ht'))];
  const priceType = types.length === 1 ? types[0] : null;
  return { amount, priceType, taxRate: match[5] ? spokenFinancialNumber(match[5]) : null };
}

export function applyDeductibleLine(items: LineItem[], transcript: string): LineItem[] {
  const adjustment = spokenDeductibleAdjustment(transcript);
  if (!adjustment) return items;
  const base = items.filter(item => !isDeductibleLine(item));
  const rates = [...new Set(base.map(item => item.taxRate))];
  const rate = adjustment.taxRate ?? (rates.length === 1 ? rates[0] : null);
  const taxRate = rate !== null && [0, 5.5, 10, 20].includes(rate) ? rate : null;
  const type = adjustment.priceType;
  const amountHT = type === 'ht' ? adjustment.amount : type === 'ttc' && taxRate !== null
    ? Math.round(adjustment.amount / (1 + taxRate / 100) * 100) / 100 : null;
  const format = (amount: number) => amount.toFixed(2).replace('.', ',');
  return [...base, { id: 'franchise', label: 'Franchise à déduire',
    description: `Franchise à déduire : ${format(adjustment.amount)} €${type ? ` ${type.toUpperCase()}` : ' (HT ou TTC à préciser)'}.${type === 'ttc' && taxRate !== null ? ` Conversion en HT avec TVA ${taxRate} %.` : ''}`,
    quantity: 1, unit: 'forfait', unitPrice: amountHT === null ? null : -amountHT, taxRate }];
}

export function deductibleLineNotes(notes: string) {
  return notes.replace(/^Franchise (?:à déduire du montant TTC|à récupérer auprès du client|mentionnée[^:]*)\s*:.*$/gimu, '').trim();
}

export function documentLinePrice(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(typeof value === 'string' ? value.replace(/\s/g, '').replace(',', '.') : value);
  return Number.isFinite(parsed) ? isDeductibleLine({ label }) ? parsed : Math.max(0, parsed) : null;
}
export function spokenDeductible(transcript: string) {
  const match = transcript.match(new RegExp(`\\bfranchise\\s+(?:de\\s+)?(${spokenAmountPattern})\\s*(?:€|euros?)\\s*(?:TTC|toutes taxes comprises)`, 'iu'));
  return match ? spokenFinancialNumber(match[1]) : null;
}
export function deductibleNotes(notes: string, transcript: string) {
  const amount = spokenDeductible(transcript);
  if (amount === null) return notes;
  const clean = notes.replace(notePattern, '').trim();
  return [clean, `Franchise à déduire du montant TTC : ${amount.toFixed(2).replace('.', ',')} €.`].filter(Boolean).join('\n');
}
export function documentDeductible(notes: string | null | undefined, total: number) {
  const match = (notes || '').match(notePattern);
  const amount = match ? Number(match[1].replace(',', '.')) : 0;
  return { amount, afterDeductible: Math.round(Math.max(0, total - amount) * 100) / 100 };
}
export function withoutPaymentAdjustments(transcript: string) {
  const labelledFranchise = `\\bfranchise\\s+(?:TTC\\s+)?(?:[àa]\\s+(?:r[ée]cup[ée]rer|recouvrer|d[ée]duire)(?:\\s+(?:aupr[èe]s\\s+du\\s+client|du\\s+montant\\s+TTC))?|[àa]\\s+la\\s+charge\\s+(?:du\\s+client|de\\s+l['’]assur[ée]))\\s*[:：]?\\s*(?:de\\s+)?${spokenAmountPattern}\\s*(?:€|euros?)\\s*(?:TTC|HT|toutes taxes comprises|hors taxes)?`;
  const blank = (match: string) => ' '.repeat(match.length);
  return transcript.replace(franchisePattern, blank).replace(new RegExp(labelledFranchise, 'giu'), blank)
    .replace(new RegExp(`\\b(?:franchise|acompte)\\s+(?:de\\s+)?${spokenAmountPattern}\\s*(?:€|euros?)\\s*(?:TTC|HT|toutes taxes comprises|hors taxes)?`, 'giu'), blank);
}
