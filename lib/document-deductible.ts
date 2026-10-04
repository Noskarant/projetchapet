import { spokenAmountPattern, spokenFinancialNumber } from './spoken-financial-number';
// A TTC deductible is a payment allocation, not a reduction of taxable work.
// Persist it in public document notes so it survives edits, sync and invoicing.
const notePattern = /Franchise à déduire du montant TTC\s*:\s*(\d+(?:[,.]\d+)?)\s*€\.?/iu;
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
  return transcript.replace(new RegExp(labelledFranchise, 'giu'), '')
    .replace(new RegExp(`\\b(?:franchise|acompte)\\s+(?:de\\s+)?${spokenAmountPattern}\\s*(?:€|euros?)\\s*(?:TTC|HT|toutes taxes comprises|hors taxes)?`, 'giu'), '');
}
