export type CustomerPortalLinks = {
  customer?: string;
  quotes: Record<string, string>;
  invoices: Record<string, string>;
};
export type CustomerPortalContext = {quoteId?: string; invoiceId?: string};

export function clientPortalUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length > 4096) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

export function normalizeCustomerPortals(value: unknown): CustomerPortalLinks {
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const links = (input: unknown) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
    return Object.fromEntries(Object.entries(input).flatMap(([id, value]) => {
      const url = clientPortalUrl(value);
      return /^[0-9a-f-]{36}$/i.test(id) && url ? [[id, url]] : [];
    }));
  };
  return {customer: clientPortalUrl(data.customer) || undefined, quotes: links(data.quotes), invoices: links(data.invoices)};
}

export function resolveCustomerPortal(links: CustomerPortalLinks, context: CustomerPortalContext = {}) {
  return (context.invoiceId && links.invoices[context.invoiceId])
    || (context.quoteId && links.quotes[context.quoteId]) || links.customer || '';
}

export function changeCustomerPortal(links: CustomerPortalLinks, context: CustomerPortalContext, value: string): CustomerPortalLinks {
  const url = clientPortalUrl(value);
  if (value.trim() && !url) throw new Error('Collez un lien complet commençant par https://.');
  const next = {...links, quotes: {...links.quotes}, invoices: {...links.invoices}};
  if (context.invoiceId || context.quoteId) {
    const collection = context.invoiceId ? next.invoices : next.quotes;
    const id = context.invoiceId || context.quoteId!;
    if (url) collection[id] = url; else delete collection[id];
  } else if (url) next.customer = url; else delete next.customer;
  if (JSON.stringify(next).length > 100_000) throw new Error('Trop de liens enregistrés pour ce client. Retirez les anciens liens.');
  return next;
}
