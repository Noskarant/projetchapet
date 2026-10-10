import { recalculatePercentageLines } from "./percentage-adjustments";
import type { PlannedAction } from './action-planner';
import { learnedSellingPrice, type PriceHistoryQuote } from './quote-suggestions';
import type { authenticateRequest } from './server-auth';

export async function proposeLearnedSellingPrices(actions: PlannedAction[], organizationId: string, client: Awaited<ReturnType<typeof authenticateRequest>>['client']) {
  const quotes = actions.filter(action => action.intentType === 'prepare_quote' && Array.isArray(action.payload.items));
  if (!quotes.length) return;
  const { data, error } = await client.from('quotes').select('id,status,items:quote_items(label,unit,unit_price)').eq('organization_id', organizationId).eq('status', 'accepted').order('updated_at', { ascending: false }).limit(100);
  if (error) {
    quotes.forEach(action => action.warnings.push('Tarifs habituels indisponibles : les prix absents restent à compléter.'));
    return;
  }
  const history = (data || []) as unknown as PriceHistoryQuote[];
  for (const action of quotes) {
    for (const [index, item] of (action.payload.items as Array<Record<string, unknown>>).entries()) {
      // Preserve explicit zero, TTC awaiting conversion and any dictated amount.
      if (item.source_row_id || item.unit_price !== null && item.unit_price !== undefined || item.spoken_price_ttc != null || item.spoken_price_ambiguous != null) continue;
      const price = learnedSellingPrice(String(item.label || ''), typeof item.unit === 'string' ? item.unit : null, history);
      if (!price) continue;
      item.unit_price = price.unitPrice;
      item.price_type = 'ht';
      item.price_source = 'company_history';
      action.warnings = action.warnings.filter(warning => warning !== `Ligne ${index + 1} : prix unitaire absent.`);
      action.warnings.push(`Prix proposé pour « ${item.label} » : ${price.unitPrice} € HT/${item.unit}, issu de ${price.samples} devis validé(s) de votre entreprise. Modifiable dans le devis.`);
    }
    const items = action.payload.items as Array<Record<string, unknown>>;
    action.payload.items = recalculatePercentageLines(items.map((item, index) => ({ id: String(index), label: String(item.label || ''), description: String(item.description || ''), quantity: item.quantity as number | null, unit: item.unit as string | null, unitPrice: item.unit_price as number | null, taxRate: item.tax_rate as number | null })))
      .map((item, index) => ({ ...items[index], quantity: item.quantity, unit_price: item.unitPrice }));
  }
}
