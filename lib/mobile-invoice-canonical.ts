import type { MobileInvoice, MobileWorkspace } from "./mobile-prototype";

export function sameMobileInvoiceIdentity(left: MobileInvoice, right: MobileInvoice) {
  if (left.sourceQuoteId && right.sourceQuoteId && left.sourceQuoteId === right.sourceQuoteId) return true;
  const sameCustomer = left.customerId === right.customerId || left.customerName === right.customerName;
  return sameCustomer
    && left.issueDate === right.issueDate
    && left.title === right.title
    && Math.abs(left.total - right.total) < 0.01;
}

export function findCanonicalMobileInvoice(
  previous: MobileWorkspace,
  current: MobileWorkspace,
  displayedNumber: string,
) {
  const exact = current.invoices.find((invoice) => invoice.number === displayedNumber);
  if (exact) return exact;

  const previousInvoice = previous.invoices.find((invoice) => invoice.number === displayedNumber);
  if (previousInvoice) {
    const byIdentity = current.invoices.find((invoice) => sameMobileInvoiceIdentity(previousInvoice, invoice));
    if (byIdentity) return byIdentity;
  }

  const legacy = /^F-(\d{4}-\d+)$/i.exec(displayedNumber);
  if (legacy) {
    return current.invoices.find((invoice) => invoice.number === `FAC-${legacy[1]}`) ?? null;
  }

  return null;
}
