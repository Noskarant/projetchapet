/** Short trade units; keep forfait and other explicitly supplied units. */
export function documentUnit(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const unit = value.trim();
  const key = unit.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').replace(/\.$/, '');
  if (/^(?:m[²2]|metres? carres?|square meters?|sqm)$/.test(key)) return 'm²';
  if (/^(?:ml|m\.l|metres? lineaires?)$/.test(key)) return 'Ml';
  if (/^(?:u|unites?|pieces?)$/.test(key)) return 'U';
  if (/^(?:h|hr|heures?|hours?)$/.test(key)) return 'h';
  return unit;
}
