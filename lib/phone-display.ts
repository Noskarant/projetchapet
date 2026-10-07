/** Format phone numbers for display; preserve unknown and international formats. */
export function phoneDisplay(value: string): string {
  const digits = value.replace(/[\s.()-]/g, '');
  if (/^0\d{9}$/.test(digits)) return digits.match(/\d{2}/g)!.join(' ');
  if (/^(?:\+33|0033)[1-9]\d{8}$/.test(digits)) {
    const national = digits.replace(/^(?:\+33|0033)/, '');
    return `+33 ${national[0]} ${national.slice(1).match(/\d{2}/g)!.join(' ')}`;
  }
  return value.trim();
}

/** Recover a lost leading zero only when a unique complete number occurs in the imported source. */
export function restoreSourcePhone(value: string, transcript: string): string {
  const marker = 'Informations issues des sources à vérifier :';
  const start = transcript.indexOf(marker);
  const digits = value.replace(/[\s.()-]/g, '');
  if (start < 0 || !/^[1-9]\d{8}$/.test(digits)) return value;
  const source = transcript.slice(start + marker.length);
  const candidates = [...new Set([...source.matchAll(/(?<!\d)0[1-9](?:[ .()-]*\d){8}(?!\d)/g)]
    .map(match => match[0].replace(/[ .()-]/g, '')))]
    .filter(phone => phone.slice(1) === digits);
  return candidates.length === 1 ? candidates[0] : value;
}
