import { ApiInputError } from './api-guard';
import type { PlannedAction } from './action-planner';

export function restrictSourcePlan(input: PlannedAction[], target: 'customer' | 'quote'): PlannedAction[] {
  const positions = input.flatMap((action, index) => action.intentType === 'create_customer' || target === 'quote' && action.intentType === 'prepare_quote' ? [index] : []);
  const remap = new Map(positions.map((old, next) => [old, next]));
  return positions.map(old => {
    const action = input[old];
    let customerFromPosition = action.customerFromPosition;
    if (action.intentType === 'create_customer') customerFromPosition = undefined;
    else if (customerFromPosition !== undefined) {
      const candidates = input.flatMap((customer, position) => customer.intentType === 'create_customer' ? [position] : []);
      const original = input[customerFromPosition]?.intentType === 'create_customer' ? customerFromPosition : candidates.length === 1 ? candidates[0] : undefined;
      if (original === undefined || !remap.has(original)) throw new ApiInputError('Le client du document ne peut pas être déterminé. Vérifiez les sources.', 422);
      customerFromPosition = remap.get(original);
    }
    return { ...action, customerFromPosition, quoteFromPosition: undefined, collaboratorFromPositions: undefined,
      payload: { ...action.payload, customer_from_position: customerFromPosition ?? null } };
  });
}
