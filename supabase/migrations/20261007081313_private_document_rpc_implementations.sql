-- Public RPC contracts stay stable; privileged implementations live outside the API schema.
begin;
alter function public.create_commercial_collaborator_from_voice(uuid, text, text, text, text) set schema private;
create function public.create_commercial_collaborator_from_voice(p_organization_id uuid, p_collaborator_id text, p_name text, p_role text, p_phone text) returns text
language sql security invoker set search_path = '' as $$
 select private.create_commercial_collaborator_from_voice($1, $2, $3, $4, $5);
$$;
revoke all on function public.create_commercial_collaborator_from_voice(uuid, text, text, text, text) from public, anon;
grant execute on function public.create_commercial_collaborator_from_voice(uuid, text, text, text, text) to authenticated, service_role;
alter function public.create_commercial_project_from_voice(uuid, text, text, text, text, text, text, date, date, text[]) set schema private;
create function public.create_commercial_project_from_voice(p_organization_id uuid, p_project_id text, p_name text, p_subtitle text, p_customer_id text, p_quote_id text, p_address text, p_start_date date, p_next_visit date, p_collaborator_ids text[]) returns text
language sql security invoker set search_path = '' as $$
 select private.create_commercial_project_from_voice($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);
$$;
revoke all on function public.create_commercial_project_from_voice(uuid, text, text, text, text, text, text, date, date, text[]) from public, anon;
grant execute on function public.create_commercial_project_from_voice(uuid, text, text, text, text, text, text, date, date, text[]) to authenticated, service_role;
alter function public.delete_quote_document(uuid) set schema private;
create function public.delete_quote_document(p_quote_id uuid) returns void
language sql security invoker set search_path = '' as $$
 select private.delete_quote_document($1);
$$;
revoke all on function public.delete_quote_document(uuid) from public, anon;
grant execute on function public.delete_quote_document(uuid) to authenticated, service_role;
alter function public.replace_commercial_workspace(jsonb, bigint) set schema private;
create function public.replace_commercial_workspace(p_state jsonb, p_expected_revision bigint DEFAULT 0) returns bigint
language sql security invoker set search_path = '' as $$
 select private.replace_commercial_workspace($1, $2);
$$;
revoke all on function public.replace_commercial_workspace(jsonb, bigint) from public, anon;
grant execute on function public.replace_commercial_workspace(jsonb, bigint) to authenticated, service_role;
alter function public.save_invoice_document(uuid, uuid, uuid, invoice_status, date, date, text, jsonb) set schema private;
create function public.save_invoice_document(p_invoice_id uuid, p_customer_id uuid, p_quote_id uuid, p_status invoice_status, p_issue_date date, p_due_date date, p_notes text, p_items jsonb) returns uuid
language sql security invoker set search_path = '' as $$
 select private.save_invoice_document($1, $2, $3, $4, $5, $6, $7, $8);
$$;
revoke all on function public.save_invoice_document(uuid, uuid, uuid, invoice_status, date, date, text, jsonb) from public, anon;
grant execute on function public.save_invoice_document(uuid, uuid, uuid, invoice_status, date, date, text, jsonb) to authenticated, service_role;
alter function public.save_quote_document(uuid, uuid, text, quote_status, date, date, text, jsonb) set schema private;
create function public.save_quote_document(p_quote_id uuid, p_customer_id uuid, p_title text, p_status quote_status, p_issue_date date, p_expiry_date date, p_notes text, p_items jsonb) returns uuid
language sql security invoker set search_path = '' as $$
 select private.save_quote_document($1, $2, $3, $4, $5, $6, $7, $8);
$$;
revoke all on function public.save_quote_document(uuid, uuid, text, quote_status, date, date, text, jsonb) from public, anon;
grant execute on function public.save_quote_document(uuid, uuid, text, quote_status, date, date, text, jsonb) to authenticated, service_role;
notify pgrst, 'reload schema';
commit;
