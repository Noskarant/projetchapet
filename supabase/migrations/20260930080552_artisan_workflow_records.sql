create table public.artisan_workflow_records (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 kind text not null check (kind in ('supplier','collaborator_contact','project_cost','inbound_email')),
 id text not null check (length(id) between 1 and 160),
 payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 100000),
 updated_at timestamptz not null default now(),
 primary key (organization_id,kind,id)
);
alter table public.artisan_workflow_records enable row level security;
revoke all on public.artisan_workflow_records from anon, authenticated;
grant select, insert, update, delete on public.artisan_workflow_records to authenticated;
grant all on public.artisan_workflow_records to service_role;
create policy "office reads workflow records" on public.artisan_workflow_records for select to authenticated using (
 private.has_org_role(organization_id, array['owner','admin','office','manager']) and
 (kind not in ('collaborator_contact','project_cost') or private.has_org_role(organization_id,array['owner','admin']))
);
create policy "office creates workflow records" on public.artisan_workflow_records for insert to authenticated with check (
 private.has_org_role(organization_id, array['owner','admin','office','manager']) and
 (kind not in ('collaborator_contact','project_cost') or private.has_org_role(organization_id,array['owner','admin']))
);
create policy "office updates workflow records" on public.artisan_workflow_records for update to authenticated using (
 private.has_org_role(organization_id, array['owner','admin','office','manager']) and
 (kind not in ('collaborator_contact','project_cost') or private.has_org_role(organization_id,array['owner','admin']))
) with check (
 private.has_org_role(organization_id, array['owner','admin','office','manager']) and
 (kind not in ('collaborator_contact','project_cost') or private.has_org_role(organization_id,array['owner','admin']))
);
create policy "office deletes workflow records" on public.artisan_workflow_records for delete to authenticated using (
 private.has_org_role(organization_id, array['owner','admin','office','manager']) and
 (kind not in ('collaborator_contact','project_cost') or private.has_org_role(organization_id,array['owner','admin']))
);
create table public.supplier_price_requests (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 id uuid not null,
 supplier_id text not null,
 recipient text not null,
 payload jsonb not null,
 status text not null default 'sending' check (status in ('sending','sent','failed')),
 provider_id text,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 primary key(organization_id,id)
);
alter table public.supplier_price_requests enable row level security;
revoke all on public.supplier_price_requests from anon,authenticated;
grant select on public.supplier_price_requests to authenticated;
grant all on public.supplier_price_requests to service_role;
create policy "office reads price requests" on public.supplier_price_requests for select to authenticated using(private.has_org_role(organization_id,array['owner','admin','office','manager']));
