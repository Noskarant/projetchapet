create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null default 'worker' check (role in ('admin','office','manager','worker','accountant')),
  status text not null default 'pending' check (status in ('pending','accepted','cancelled')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  updated_at timestamptz not null default now()
);
create unique index if not exists organization_invitations_org_email_uidx on public.organization_invitations (organization_id, lower(email));
create index if not exists organization_invitations_email_idx on public.organization_invitations (lower(email), status);
alter table public.organization_invitations enable row level security;

drop policy if exists "members read organization invitations" on public.organization_invitations;
create policy "members read organization invitations" on public.organization_invitations for select to authenticated
using (private.is_org_member(organization_id));
drop policy if exists "admins manage organization invitations" on public.organization_invitations;
create policy "admins manage organization invitations" on public.organization_invitations for all to authenticated
using (private.has_org_role(organization_id, array['owner','admin']))
with check (private.has_org_role(organization_id, array['owner','admin']));

create table if not exists public.project_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id text not null check (length(project_id) between 1 and 160),
  body text not null check (length(trim(body)) between 1 and 5000),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_notes_org_project_idx on public.project_notes (organization_id, project_id, created_at desc);
alter table public.project_notes enable row level security;
drop policy if exists "members read project notes" on public.project_notes;
create policy "members read project notes" on public.project_notes for select to authenticated
using (private.is_org_member(organization_id));
drop policy if exists "members create project notes" on public.project_notes;
create policy "members create project notes" on public.project_notes for insert to authenticated
with check (private.is_org_member(organization_id) and created_by = auth.uid());
drop policy if exists "authors update project notes" on public.project_notes;
create policy "authors update project notes" on public.project_notes for update to authenticated
using (private.is_org_member(organization_id) and (created_by = auth.uid() or private.has_org_role(organization_id, array['owner','admin','manager'])))
with check (private.is_org_member(organization_id) and (created_by = auth.uid() or private.has_org_role(organization_id, array['owner','admin','manager'])));
drop policy if exists "authors delete project notes" on public.project_notes;
create policy "authors delete project notes" on public.project_notes for delete to authenticated
using (private.is_org_member(organization_id) and (created_by = auth.uid() or private.has_org_role(organization_id, array['owner','admin','manager'])));

create table if not exists public.document_signatures (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  document_kind text not null check (document_kind in ('quote','invoice')),
  document_number text not null check (length(document_number) between 1 and 100),
  signer_name text not null check (length(trim(signer_name)) between 2 and 200),
  signer_email text not null check (length(trim(signer_email)) between 3 and 254),
  consent_text text not null check (length(trim(consent_text)) between 10 and 1000),
  document_hash text not null check (length(document_hash) = 64),
  ip_hash text not null check (length(ip_hash) = 64),
  user_agent text not null default '',
  signed_by_user uuid not null references auth.users(id) on delete restrict,
  signed_at timestamptz not null default now()
);
create index if not exists document_signatures_org_document_idx on public.document_signatures (organization_id, document_kind, document_number, signed_at desc);
alter table public.document_signatures enable row level security;
drop policy if exists "members read document signatures" on public.document_signatures;
create policy "members read document signatures" on public.document_signatures for select to authenticated
using (private.is_org_member(organization_id));

create table if not exists public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id text,
  supplier_name text not null check (length(trim(supplier_name)) between 2 and 200),
  supplier_email text not null check (length(trim(supplier_email)) between 3 and 254),
  label text not null check (length(trim(label)) between 2 and 500),
  quantity numeric(12,3) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  notes text not null default '' check (length(notes) <= 5000),
  status text not null default 'draft' check (status in ('draft','approved','sent','cancelled')),
  created_by uuid not null references auth.users(id) on delete restrict,
  approved_by uuid references auth.users(id) on delete restrict,
  approved_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists supplier_orders_org_created_idx on public.supplier_orders (organization_id, created_at desc);
alter table public.supplier_orders enable row level security;
drop policy if exists "members read supplier orders" on public.supplier_orders;
create policy "members read supplier orders" on public.supplier_orders for select to authenticated
using (private.is_org_member(organization_id));
drop policy if exists "operations create supplier orders" on public.supplier_orders;
create policy "operations create supplier orders" on public.supplier_orders for insert to authenticated
with check (created_by = auth.uid() and status = 'draft' and private.has_org_role(organization_id, array['owner','admin','office','manager']));
drop policy if exists "operations update supplier orders" on public.supplier_orders;
create policy "operations update supplier orders" on public.supplier_orders for update to authenticated
using (private.has_org_role(organization_id, array['owner','admin','office','manager']))
with check (private.has_org_role(organization_id, array['owner','admin','office','manager']));
drop policy if exists "admins delete supplier orders" on public.supplier_orders;
create policy "admins delete supplier orders" on public.supplier_orders for delete to authenticated
using (private.has_org_role(organization_id, array['owner','admin','manager']));

create or replace function private.enforce_supplier_order_state()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  if old.status = 'sent' and auth.role() <> 'service_role' then raise exception 'sent supplier order is immutable'; end if;
  if new.status = 'sent' and old.status <> 'sent' and auth.role() <> 'service_role' then raise exception 'supplier order must be sent by server confirmation'; end if;
  if new.status = 'approved' and old.status <> 'approved' and auth.role() <> 'service_role' then
    if new.approved_by is distinct from auth.uid() or new.approved_at is null then raise exception 'approval must be attributed to current user'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists supplier_orders_enforce_state on public.supplier_orders;
create trigger supplier_orders_enforce_state before update on public.supplier_orders for each row execute function private.enforce_supplier_order_state();

create or replace function private.ensure_personal_organization()
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  existing_org uuid;
  new_org uuid;
  display_name text;
  invited record;
  login_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select organization_id into existing_org from public.organization_members where user_id = auth.uid() order by created_at asc limit 1;
  if existing_org is not null then return existing_org; end if;
  if login_email <> '' then
    select id, organization_id, role into invited from public.organization_invitations
    where lower(email) = login_email and status = 'pending' order by created_at asc limit 1 for update skip locked;
    if invited.id is not null then
      insert into public.organization_members (organization_id, user_id, role) values (invited.organization_id, auth.uid(), invited.role)
      on conflict (organization_id, user_id) do update set role = excluded.role;
      update public.organization_invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now() where id = invited.id;
      return invited.organization_id;
    end if;
  end if;
  display_name := coalesce(nullif(auth.jwt() -> 'user_metadata' ->> 'company_name', ''), nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''), split_part(coalesce(auth.jwt() ->> 'email', 'Mon entreprise'), '@', 1));
  insert into public.organizations (name) values (display_name) returning id into new_org;
  insert into public.organization_members (organization_id, user_id, role) values (new_org, auth.uid(), 'owner');
  return new_org;
end;
$$;

revoke all on function private.enforce_supplier_order_state() from public, anon, authenticated;
