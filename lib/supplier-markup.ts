import type { LineItem } from './mobile-prototype';
import { isDeductibleLine } from './document-deductible';
import { linePercentage, recalculatePercentageLines } from './percentage-adjustments';
import { spokenAmountPattern, spokenFinancialNumber } from './spoken-financial-number';

const percentage = `(${spokenAmountPattern})\\s*(?:%|pour\\s*cent)`;
const patterns = [
  new RegExp(`\\b(?:marge(?:\\s+(?:commerciale|supplémentaire))?|majoration(?:\\s+(?:commerciale|fournisseur))?(?:\\s+des\\s+prix\\s+HT)?)\\s*(?:(?:de|à|a)\\s*)?[:：]?\\s*\\+?${percentage}`, 'giu'),
  new RegExp(`\\b(?:ajoute[rz]?|rajoute[rz]?|applique[rz]?)\\s*(?:une\\s+)?\\+?${percentage}\\s*(?:de\\s+)?(?:marge|majoration)\\b`, 'giu'),
  new RegExp(`\\b(?:augmente[rz]?|majore[rz]?)\\s+(?:les\\s+)?prix(?:\\s+HT)?\\s*(?:de\\s*)?\\+?${percentage}`, 'giu'),
];

export function supplierMarkupInput(value: string): number | null {
  if (!value.trim()) return null;
  const normalized = value.trim().replace(',', '.');
  const number = Number(normalized);
  if (!/^\+?\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(number) || number < 0 || number > 1000) {
    throw new Error('Indiquez une majoration entre 0 et 1 000 %.');
  }
  return number;
}

function matches(transcript: string) {
  // The document is evidence, never an instruction to change the selling price.
  const instructions = transcript.split('Informations issues des sources à vérifier')[0];
  return patterns.flatMap(pattern => [...instructions.matchAll(pattern)]).sort((a,b) => a.index - b.index);
}

export function spokenSupplierMarkup(transcript: string): number | null {
  const match = matches(transcript).at(-1);
  if (!match) return null;
  const value = spokenFinancialNumber(match[1]);
  return value !== null && value <= 1000 ? value : null;
}

export function withoutSupplierMarkup(transcript: string) {
  let result = transcript;
  for (const match of matches(transcript).reverse()) {
    result = result.slice(0,match.index) + ' '.repeat(match[0].length) + result.slice(match.index + match[0].length);
  }
  return result;
}

export function isSupplierMarkupLine(label: string) {
  return /^(?:marge(?:\s+commerciale)?|majoration(?:\s+(?:commerciale|fournisseur))?)(?:\s*(?:de\s+)?\(?\d+(?:[,.]\d+)?\s*%\)?)?$/iu.test(label.trim());
}

export function supplierMarkupNotes(notes: string) {
  return notes.split('\n').filter(line => spokenSupplierMarkup(line) === null).join('\n').trim();
}

export function applySupplierMarkup(items: LineItem[], percent: number | null): LineItem[] {
  if (percent === null || percent === 0) return items;
  // Selling prices change; fixed franchises and automatic percentage lines do not.
  return recalculatePercentageLines(items.map(item => isDeductibleLine(item) || linePercentage(item) !== null || item.unitPrice === null
    ? item : {...item,unitPrice:Math.round(item.unitPrice * (1 + percent / 100) * 100) / 100}));
}
