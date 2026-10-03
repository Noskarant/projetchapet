// A TTC deductible is a payment allocation, not a reduction of taxable work.
// Persist it in public document notes so it survives edits, sync and invoicing.
const notePattern = /Franchise à déduire du montant TTC\s*:\s*(\d+(?:[,.]\d+)?)\s*€\.?/iu;
export function spokenDeductible(transcript: string) {
  const match = transcript.match(/\bfranchise\s+(?:de\s+)?(\d+(?:[,.]\d+)?)\s*(?:€|euros?)\s*(?:TTC|toutes taxes comprises)/iu);
  return match ? Number(match[1].replace(',', '.')) : null;
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
  return transcript.replace(/\b(?:franchise|acompte)\s+(?:de\s+)?\d+(?:[,.]\d+)?\s*(?:€|euros?)\s*(?:TTC|HT|toutes taxes comprises|hors taxes)?/giu, '');
}
