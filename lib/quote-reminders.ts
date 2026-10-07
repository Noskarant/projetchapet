import { isEmail } from './api-guard';
import { buildClassicDocumentEmail } from './document-email-template';

export function quoteReminderDueAt(sentAt: string) {
  const date = new Date(sentAt);
  if (!Number.isFinite(date.getTime())) return null;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date;
}

export function quoteCanBeReminded(quote: { status: string; sent_at: string | null; archived_at?: string | null; accepted_at?: string | null; signed_at?: string | null }, now: Date) {
  const due = quote.sent_at ? quoteReminderDueAt(quote.sent_at) : null;
  return quote.status === 'sent' && !quote.archived_at && !quote.accepted_at && !quote.signed_at && due !== null && due <= now;
}

const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export function quoteReminderMessage(number: string, title: string, company: string, contact: string) {
  const reply = isEmail(contact) ? ` Vous pouvez répondre à cet e-mail pour nous faire part de votre retour.` : '';
  const text = `Bonjour,\n\nNous revenons vers vous concernant notre devis ${number} pour ${title}, envoyé il y a un mois. Souhaitez-vous donner suite à cette proposition ?${reply}\n\nVous trouverez le devis en pièce jointe. Si vous nous avez déjà répondu, merci de ne pas tenir compte de ce message.\n\nCordialement,\n${company}`;
  return { subject: `Votre devis ${number} · ${company}`, ...buildClassicDocumentEmail(escape(text).replaceAll('\n', '<br>')) };
}
