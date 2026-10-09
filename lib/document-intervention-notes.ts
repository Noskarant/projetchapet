/** Financial adjustments are already displayed in the line items and totals. */
export function interventionNotes(notes: string) {
  const suffix = String.raw`(?:\s+(?:au|sur|du)\s+(?:le\s+|la\s+)?(?:montant\s+)?total(?:\s+(?:HT|TTC))?(?:\s+(?:du|des)\s+(?:devis|travaux))?)?(?:\s*\(calcul[ée]e? automatiquement\))?\.?`;
  return notes
    .replace(new RegExp(String.raw`\b(?:majoration\s+)?RSE(?:\s+environnemental(?:e)?)?\s*(?:de|à|:)??\s*\d+(?:[,.]\d+)?\s*%` + suffix, 'giu'), '')
    .replace(new RegExp(String.raw`\bremise(?:\s+(?:globale|commerciale|accordée))?\s*(?:de|à|:)?\s*\d+(?:[,.]\d+)?\s*%` + suffix, 'giu'), '')
    .split('\n').map(line => line.trim()).filter(Boolean).join('\n').trim();
}

export function publicLineDescription(description: string) {
  return description.replace(/^Calcul automatique : \d+(?:[,.]\d+)? % du montant HT des autres postes\.(?:\s*\n)?/u, '').trim();
}
