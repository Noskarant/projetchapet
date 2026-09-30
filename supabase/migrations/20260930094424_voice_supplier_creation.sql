alter table public.action_proposals drop constraint if exists action_proposals_intent_type_check;
alter table public.action_proposals add constraint action_proposals_intent_type_check
 check (intent_type in ('create_customer','create_supplier','create_collaborator','create_project','prepare_quote','update_project_note','prepare_supplier_order','schedule_task','prepare_invoice','mark_payment','prepare_email'));
alter table public.action_proposals drop constraint if exists action_proposals_risk_matches_intent;
alter table public.action_proposals add constraint action_proposals_risk_matches_intent check (
 case
  when intent_type in ('prepare_supplier_order','prepare_invoice','mark_payment','prepare_email') then risk_level='explicit_confirmation'
  when intent_type in ('create_customer','create_supplier','create_collaborator','create_project','prepare_quote','schedule_task') then risk_level in ('review','explicit_confirmation')
  else true
 end
);
