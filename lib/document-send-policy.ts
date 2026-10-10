type SendLine = { quantity: number | null; unitPrice: number | null; taxRate: number | null };
const known = (value: number | null) => typeof value === 'number' && Number.isFinite(value);
/** Unpriced quote lines describe work; they do not add an invented charge. */
export function documentSendPolicy(kind: 'quote' | 'invoice', items: SendLine[], withoutPrices = false) {
  const priced = items.filter(item => known(item.unitPrice));
  const complete = (item: SendLine) => known(item.quantity) && known(item.unitPrice) && known(item.taxRate);
  return {
    canSend: withoutPrices || kind === 'quote' || items.length > 0 && items.every(complete),
    canSign: !withoutPrices && kind === 'quote' && priced.length > 0 && priced.every(complete),
  };
}
