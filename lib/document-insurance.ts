type InsuranceSource = { insurer?: unknown; mission_reference?: unknown; case_reference?: unknown; claim_address?: unknown };

const labels = { insurer: 'Assureur', mission_reference: 'Référence mission', case_reference: 'Numéro de dossier', claim_address: 'Adresse du sinistre' } as const;
const flat = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

function exactReference(value: string, evidence: string, field: 'mission_reference' | 'case_reference') {
  const tokens = evidence.match(/[\p{L}\p{N}]+(?:[-/][\p{L}\p{N}]+)*/gu) || [];
  const exact = tokens.find(token => flat(token) === flat(value));
  const label = field === 'case_reference' ? '(?:numéro|numero|n[°o])?\\s*(?:de\\s+)?dossier|référence\\s+(?:du\\s+)?(?:dossier|sinistre)' : '(?:numéro|numero|n[°o]|référence)?\\s*(?:de\\s+)?mission';
  const identified = [...evidence.matchAll(new RegExp(`(?:${label})\\s*[:：#-]?\\s*([A-Z0-9][A-Z0-9/-]{4,79})(?![\\p{L}\\p{N}])`, 'giu'))]
    .map(match => match[1]).filter(token => /\d/u.test(token));
  const unique = [...new Set(identified)];
  // An explicit, unique source label repairs a truncated/model-misread reference.
  return unique.length === 1 ? unique[0] : unique.length > 1 ? '' : exact || '';
}

/** Preserve only references present in the source; no inferred identity or payment allocation. */
export function insuranceDocumentNotes(notes: string, raw: unknown, evidence: string) {
  const source = raw && typeof raw === 'object' ? raw as InsuranceSource : {};
  const additions: string[] = [];
  for (const [field, label] of Object.entries(labels)) {
    const reference = field === 'case_reference' || field === 'mission_reference';
    const existing = notes.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, 'imu'))?.[1];
    const labelled = evidence.match(new RegExp(`${label}\\s*[:：]\\s*([^\\n;.]+)`, 'iu'))?.[1]?.trim();
    const value = labelled ?? source[field as keyof InsuranceSource] ?? existing ?? (reference ? '' : undefined);
    if (typeof value !== 'string' || (!reference && !value.trim())) continue;
    let clean = value.replace(/[\r\n]/g, ' ').trim().slice(0, field === 'claim_address' ? 320 : 120);
    if (reference) {
      clean = exactReference(clean, evidence, field as 'case_reference' | 'mission_reference');
      notes = notes.replace(new RegExp(`(?:${label}|${field === 'mission_reference' ? 'Numéro de mission' : 'Référence du dossier'})\\s*[:：]\\s*[A-Z0-9][A-Z0-9/-]{4,79}\\s*[.;]?`, 'giu'), '').trim();
    }
    if (flat(clean).length < 2 || !flat(evidence).includes(flat(clean))) continue;
    notes = notes.replace(new RegExp(`${label}\\s*[:：]\\s*${clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[.;]?`, 'giu'), '').trim();
    additions.push(`${label} : ${clean}`);
  }
  // "À récupérer" is the customer's share, not a discount on taxable work.
  const recovery = evidence.match(/franchise\s+(?:TTC\s+)?(?:à\s+récupérer|à\s+recouvrer|à\s+la\s+charge\s+(?:du\s+client|de\s+l['’]assuré))[^\d]{0,80}(\d[\d\s\u00a0\u202f]*(?:[,.]\d{1,2})?)\s*(?:€|euros?)/iu);
  if (recovery) {
    const amount = Number(recovery[1].replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000) {
      notes = notes.replace(/^Franchise à déduire du montant TTC\s*:.*$/gimu, '').replace(/^Franchise à récupérer auprès du client\s*:.*$/gimu, '').trim();
      additions.push(`Franchise à récupérer auprès du client : ${amount.toFixed(2).replace('.', ',')} €.`);
    }
  } else if (evidence.includes('Informations issues des sources à vérifier') && !/franchise\s+(?:TTC\s+)?à\s+déduire/iu.test(evidence)) {
    // A document that merely lists a deductible does not authorize subtracting it.
    notes = notes.replace(/^Franchise à déduire du montant TTC\s*:.*$/gimu, '').trim();
    const mentioned = evidence.match(/franchise\s*(?:TTC\s*)?[:：]?\s*(\d[\d\s\u00a0\u202f]*(?:[,.]\d{1,2})?)\s*(?:€|euros?)/iu);
    if (mentioned && !/Franchise mentionnée/.test(notes)) {
      const amount = Number(mentioned[1].replace(/\s/g, '').replace(',', '.'));
      if (Number.isFinite(amount) && amount >= 0 && amount <= 1_000_000) additions.push(`Franchise mentionnée (modalités à confirmer) : ${amount.toFixed(2).replace('.', ',')} €.`);
    }
  }
  // These public references must survive the existing 2400-character execution limit.
  return [...additions, notes].filter(Boolean).join('\n').slice(0, 2400);
}

export function documentInsurance(notes: string | null | undefined, total = 0) {
  const value = notes || '';
  const references = Object.values(labels).flatMap(label => {
    const match = value.match(new RegExp(`^${label}\\s*:\\s*(.+)$`, 'imu'));
    return match ? [`${label} : ${match[1].trim()}`] : [];
  });
  const match = value.match(/^Franchise à récupérer auprès du client\s*:\s*(\d+(?:[,.]\d+)?)\s*€/imu);
  const recovery = match ? Number(match[1].replace(',', '.')) : null;
  return { references, recovery, insurerShare: recovery === null ? null : Math.round(Math.max(0, total - recovery) * 100) / 100 };
}
