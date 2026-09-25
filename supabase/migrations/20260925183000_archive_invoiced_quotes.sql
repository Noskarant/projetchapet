-- Un devis déjà facturé doit rester référencé par sa facture. La suppression
-- retire le devis de l'espace actif sans casser le lien comptable.
alter table public.quotes add column if not exists archived_at timestamptz;
create index if not exists quotes_org_archive_idx on public.quotes (organization_id, archived_at);

create or replace function public.delete_quote_document(p_quote_id uuid)
returns void language plpgsql security definer
set search_path = public, private, pg_temp
as $$
begin
  if exists (select 1 from public.invoices where quote_id = p_quote_id) then
    update public.quotes set archived_at = coalesce(archived_at, now())
    where id = p_quote_id and organization_id = private.active_organization_id();
  else
    delete from public.quotes
    where id = p_quote_id and organization_id = private.active_organization_id();
  end if;
  if not found then
    raise exception 'quote not found in active organization';
  end if;
end;
$$;
revoke all on function public.delete_quote_document(uuid) from public, anon;
grant execute on function public.delete_quote_document(uuid) to authenticated;
