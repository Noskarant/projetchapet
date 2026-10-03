type Proposal = { intent_type: string; payload: Record<string, unknown>; status: string; missing_fields: string[] };
export function canCreateDirectly(proposal: Proposal) {
  return ['create_customer', 'create_supplier', 'create_collaborator', 'create_project', 'prepare_quote', 'prepare_invoice', 'schedule_task', 'update_project_note', 'prepare_email'].includes(proposal.intent_type)
    || proposal.intent_type === 'prepare_supplier_order' && proposal.payload.send_requested !== true;
}
