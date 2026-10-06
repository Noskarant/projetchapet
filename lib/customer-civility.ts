export const CUSTOMER_CIVILITIES = ['M.', 'Mme', 'M. et Mme'] as const;

/** Accept legacy full labels without losing the couple option on edit. */
export function normalizeCustomerCivility(value: string | null | undefined): typeof CUSTOMER_CIVILITIES[number] {
  const label = (value ?? '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  if (['m et mme', 'monsieur et madame', 'mme et m', 'madame et monsieur'].includes(label)) return 'M. et Mme';
  return label === 'mme' || label === 'madame' ? 'Mme' : 'M.';
}
