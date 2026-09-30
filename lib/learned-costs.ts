import type { MobileQuote } from './mobile-prototype';
export type CostForm = { labourCost: number; labourHours: number; materialCost: number; travelCost: number; subcontractCost: number; otherCost: number };
export type CostSample = { quoteId: string; revenue: number; title: string; costs: CostForm; confirmed: boolean };
export const EMPTY_COSTS: CostForm = { labourCost: 0, labourHours: 0, materialCost: 0, travelCost: 0, subcontractCost: 0, otherCost: 0 };
const safe = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
function median(values: number[]) { const sorted = values.sort((a,b) => a-b); const mid = Math.floor(sorted.length/2); return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid])/2; }
function tokens(title: string) { return new Set(title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().split(/\W+/).filter(word => word.length > 3)); }
export function learnedCostEstimate(quote: MobileQuote, samples: CostSample[]) {
  const eligible = samples.filter(sample => sample.confirmed && sample.quoteId !== quote.id && sample.revenue > 0 && sample.costs && Object.values(sample.costs).every(value => Number.isFinite(Number(value)) && Number(value) >= 0));
  if (!eligible.length || quote.subtotal <= 0) return null;
  const words = tokens(quote.title);
  const similar = eligible.filter(sample => [...tokens(sample.title)].some(word => words.has(word)));
  const source = (similar.length ? similar : eligible).slice(0,20);
  const costs = Object.fromEntries(Object.keys(EMPTY_COSTS).map(key => [key, Math.round(median(source.map(sample => safe(sample.costs[key as keyof CostForm]) / sample.revenue)) * quote.subtotal * 100)/100])) as CostForm;
  const rates = source.filter(sample => sample.costs.labourHours > 0 && sample.costs.labourCost > 0).map(sample => sample.costs.labourCost/sample.costs.labourHours);
  return { costs, samples: source.length, hourlyRate: rates.length ? Math.round(median(rates)*100)/100 : null, comparable: similar.length > 0 };
}
