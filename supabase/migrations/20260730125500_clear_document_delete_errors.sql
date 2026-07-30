create or replace function public.delete_quote_document(p_quote_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid := private.active_organization_id();
begin
  if not exists (
    select 1 from public.quotes
    where id = p_quote_id and organization_id = target_org
  ) then
    raise exception 'quote not found in active organization';
  end if;

  if exists (
    select 1 from public.invoices
    where quote_id = p_quote_id and organization_id = target_org
  ) then
    raise exception 'a quote linked to an invoice cannot be deleted';
  end if;

  delete from public.quotes
  where id = p_quote_id
    and organization_id = target_org;
end;
$$;

revoke all on function public.delete_quote_document(uuid) from public;
grant execute on function public.delete_quote_document(uuid) to anon, authenticated;
