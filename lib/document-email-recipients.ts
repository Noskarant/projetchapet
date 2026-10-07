import { isValidEmailAddress, normalizeEmailAddress } from './email-authorization';

/** The editor accepts commas/semicolons; the provider receives distinct addresses. */
export function documentEmailRecipients(value: unknown): string[] {
  const values = typeof value === 'string' ? value.split(/[;,]/) : Array.isArray(value) ? value : [];
  const emails = values.map(normalizeEmailAddress).filter(Boolean);
  if (!emails.length || values.some(item => typeof item !== 'string') || emails.some(email => !isValidEmailAddress(email))) {
    throw new Error('Adresse du destinataire invalide. Séparez les adresses par des virgules.');
  }
  const unique = [...new Set(emails)];
  if (unique.length > 5) throw new Error('Cinq destinataires maximum sont autorisés.');
  return unique;
}
