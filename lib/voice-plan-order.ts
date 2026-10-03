import { ApiInputError } from './api-guard';
import type { PlannedAction } from './action-planner';

// The model describes relations; execution order is our responsibility. Keep
// unrelated actions stable and remap every positional reference after sorting.
export function orderVoicePlan(input: PlannedAction[]): PlannedAction[] {
  const actions = input.map(action => ({ ...action, payload: { ...action.payload } }));
  const typedPosition = (position: number | undefined, type: string) => {
    if (position === undefined) return undefined;
    if (Number.isInteger(position) && actions[position]?.intentType === type) return position;
    const candidates = actions.flatMap((action, index) => action.intentType === type ? [index] : []);
    // Repair a one-based/model reference only when its target is unambiguous.
    if (candidates.length === 1) return candidates[0];
    throw new ApiInputError('Une liaison de la demande ne peut pas être déterminée.', 422);
  };
  for (const action of actions) {
    action.customerFromPosition = typedPosition(action.customerFromPosition, 'create_customer');
    action.quoteFromPosition = typedPosition(action.quoteFromPosition, 'prepare_quote');
    action.collaboratorFromPositions = (action.collaboratorFromPositions ?? []).map(position => typedPosition(position, 'create_collaborator')!);
    if (action.intentType === 'create_project' && action.quoteFromPosition === undefined) {
      const quotes = actions.flatMap((quote, index) => quote.intentType === 'prepare_quote'
        && (Boolean(action.payload.customer_hint) && quote.payload.customer_hint === action.payload.customer_hint
          || Boolean(action.payload.customer_id) && quote.payload.customer_id === action.payload.customer_id
          || action.customerFromPosition !== undefined && quote.customerFromPosition === action.customerFromPosition) ? [index] : []);
      if (quotes.length === 1) action.quoteFromPosition = quotes[0];
    }
    if (action.customerFromPosition === undefined && !action.payload.customer_id) {
      const hint = String(action.payload.customer_hint || '').toLocaleLowerCase('fr-FR');
      const customers = actions.flatMap((customer, index) => customer.intentType === 'create_customer'
        && hint && [customer.payload.company_name, customer.payload.last_name, [customer.payload.last_name, customer.payload.first_name].filter(Boolean).join(' ')]
          .some(name => String(name || '').toLocaleLowerCase('fr-FR') === hint) ? [index] : []);
      if (customers.length === 1) action.customerFromPosition = customers[0];
    }
  }
  const ordered: number[] = [];
  const visiting = new Set<number>();
  const visited = new Set<number>();
  const visit = (index: number) => {
    if (visited.has(index)) return;
    if (visiting.has(index)) throw new ApiInputError('Les liaisons de la demande forment une boucle.', 422);
    visiting.add(index);
    const action = actions[index];
    for (const dependency of [action.customerFromPosition, action.quoteFromPosition, ...(action.collaboratorFromPositions ?? [])]) {
      if (dependency !== undefined) visit(dependency);
    }
    visiting.delete(index);
    visited.add(index);
    ordered.push(index);
  };
  actions.forEach((_, index) => visit(index));
  const positions = new Map(ordered.map((old, index) => [old, index]));
  return ordered.map(old => {
    const action = actions[old];
    action.customerFromPosition = action.customerFromPosition === undefined ? undefined : positions.get(action.customerFromPosition);
    action.quoteFromPosition = action.quoteFromPosition === undefined ? undefined : positions.get(action.quoteFromPosition);
    action.collaboratorFromPositions = action.collaboratorFromPositions?.map(position => positions.get(position)!);
    action.payload.customer_from_position = action.customerFromPosition ?? null;
    if (action.intentType === 'create_project') {
      action.payload.quote_from_position = action.quoteFromPosition ?? null;
      action.payload.collaborator_from_positions = action.collaboratorFromPositions;
    }
    action.missingFields = action.missingFields.filter(field => !(field === 'client' && action.customerFromPosition !== undefined));
    action.status = action.missingFields.length ? 'needs_input' : 'ready';
    return action;
  });
}
