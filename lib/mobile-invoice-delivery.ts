export function invoiceDeliveryLabel(clientSent: boolean, accountantSent: boolean) {
  if (clientSent && accountantSent) return "Envoyée au client et au comptable";
  if (accountantSent) return "Envoyée au comptable";
  if (clientSent) return "Envoyée au client";
  return "Pas encore envoyée";
}

export function electronicInvoiceBlockingReason(statusText: string) {
  const normalized = statusText
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  if (normalized.includes("brouillon")) {
    return "Cette facture est encore en brouillon. Envoyez-la d’abord au client ou passez-la en cours avant sa transmission électronique.";
  }
  if (normalized.includes("avoir")) {
    return "Cet avoir ne doit pas être transmis avec le flux d’une facture classique.";
  }
  return "";
}
