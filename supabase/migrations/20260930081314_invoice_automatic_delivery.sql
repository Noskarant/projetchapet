create table public.invoice_delivery_attempts (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 invoice_id uuid not null references public.invoices(id),
 invoice_number text not null,
 channel text not null check(channel in ('accountant','pdp')),
 recipient text,
 status text not null check(status in ('sending','sent','failed','unknown')),
 message text not null default '',
 provider_id text,
 updated_at timestamptz not null default now(),
 primary key(organization_id,invoice_id,channel)
);
alter table public.invoice_delivery_attempts enable row level security;
revoke all on public.invoice_delivery_attempts from anon,authenticated;
grant select on public.invoice_delivery_attempts to authenticated;
grant all on public.invoice_delivery_attempts to service_role;
create policy "billing roles read delivery attempts" on public.invoice_delivery_attempts for select to authenticated using(private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
