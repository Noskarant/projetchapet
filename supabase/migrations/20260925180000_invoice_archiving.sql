-- Les factures émises restent conservées pour l'historique comptable ; le retrait
-- de la liste active est un archivage réversible à l'échelle de l'entreprise.
alter table public.invoices add column if not exists archived_at timestamptz;
create index if not exists invoices_org_archive_month_idx
  on public.invoices (organization_id, archived_at, issue_date desc);

create or replace function public.archive_invoice_document(p_invoice_id uuid)
returns void language plpgsql security invoker
set search_path = public, private, pg_temp
as $$
begin
  update public.invoices
     set archived_at = coalesce(archived_at, now())
   where id = p_invoice_id
     and organization_id = private.active_organization_id()
     and status <> 'draft';
  if not found then
    raise exception 'issued invoice not found in active organization';
  end if;
end;
$$;
revoke all on function public.archive_invoice_document(uuid) from public, anon;
grant execute on function public.archive_invoice_document(uuid) to authenticated;

create table if not exists public.monthly_accounting_dispatches (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  month date not null,
  recipient text not null,
  provider_id text,
  sent_at timestamptz not null default now(),
  primary key (organization_id, month)
);
alter table public.monthly_accounting_dispatches enable row level security;
revoke all on public.monthly_accounting_dispatches from anon, authenticated;
grant select, insert, update, delete on public.monthly_accounting_dispatches to service_role;

create table if not exists public.quote_private_meta (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_number text not null,
  internal_notes text not null default '',
  discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (organization_id, quote_number),
  check (length(quote_number) between 1 and 80),
  check (length(internal_notes) <= 5000)
);
alter table public.quote_private_meta enable row level security;
revoke all on public.quote_private_meta from public, anon;
grant select, insert, update, delete on public.quote_private_meta to authenticated;
grant select, insert, update, delete on public.quote_private_meta to service_role;
create policy "artisan reads private quote notes" on public.quote_private_meta
  for select to authenticated using (private.has_org_role(organization_id, array['owner','admin']));
create policy "artisan creates private quote notes" on public.quote_private_meta
  for insert to authenticated with check (private.has_org_role(organization_id, array['owner','admin']));
create policy "artisan updates private quote notes" on public.quote_private_meta
  for update to authenticated using (private.has_org_role(organization_id, array['owner','admin']))
  with check (private.has_org_role(organization_id, array['owner','admin']));
create policy "artisan deletes private quote notes" on public.quote_private_meta
  for delete to authenticated using (private.has_org_role(organization_id, array['owner','admin']));
