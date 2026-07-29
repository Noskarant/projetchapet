create extension if not exists pgcrypto;

create type public.customer_kind as enum ('individual', 'business');
create type public.quote_status as enum ('draft', 'sent', 'accepted', 'refused', 'expired', 'cancelled');
create type public.invoice_status as enum ('draft', 'issued', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  siret text,
  vat_number text,
  phone text,
  email text,
  address jsonb not null default '{}'::jsonb,
  fiscal_year_start date,
  fiscal_year_end date,
  accountant_email text,
  brand_color text not null default '#1f7858',
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'office', 'manager', 'worker', 'accountant')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind public.customer_kind not null,
  company_name text,
  civility text,
  last_name text,
  first_name text,
  siret text,
  vat_number text,
  emails text[] not null default '{}',
  phones text[] not null default '{}',
  addresses jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  number text not null,
  title text not null,
  status public.quote_status not null default 'draft',
  issue_date date not null default current_date,
  expiry_date date,
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number)
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  position integer not null default 0,
  label text not null,
  description text,
  quantity numeric(12,3) not null default 1,
  unit text,
  unit_price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 20,
  total numeric(12,2) not null default 0
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_id uuid not null references public.customers(id),
  quote_id uuid references public.quotes(id),
  number text not null,
  status public.invoice_status not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(12,2) not null default 0,
  tax_total numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  paid_total numeric(12,2) not null default 0,
  notes text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, number)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  position integer not null default 0,
  label text not null,
  description text,
  quantity numeric(12,3) not null default 1,
  unit text,
  unit_price numeric(12,2) not null default 0,
  tax_rate numeric(5,2) not null default 20,
  total numeric(12,2) not null default 0
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  method text,
  reference text,
  created_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index customers_org_name_idx on public.customers (organization_id, company_name, last_name, first_name);
create index quotes_org_status_date_idx on public.quotes (organization_id, status, issue_date desc);
create index invoices_org_status_due_idx on public.invoices (organization_id, status, due_date);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.customers enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.audit_log enable row level security;

create or replace function public.is_org_member(target_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = target_org and user_id = auth.uid()
  );
$$;

create policy "members can read organizations" on public.organizations for select using (public.is_org_member(id));
create policy "members can read memberships" on public.organization_members for select using (public.is_org_member(organization_id));
create policy "members manage customers" on public.customers for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "members manage quotes" on public.quotes for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "members manage quote items" on public.quote_items for all using (exists (select 1 from public.quotes q where q.id = quote_id and public.is_org_member(q.organization_id))) with check (exists (select 1 from public.quotes q where q.id = quote_id and public.is_org_member(q.organization_id)));
create policy "members manage invoices" on public.invoices for all using (public.is_org_member(organization_id)) with check (public.is_org_member(organization_id));
create policy "members manage invoice items" on public.invoice_items for all using (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_org_member(i.organization_id))) with check (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_org_member(i.organization_id)));
create policy "members manage payments" on public.payments for all using (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_org_member(i.organization_id))) with check (exists (select 1 from public.invoices i where i.id = invoice_id and public.is_org_member(i.organization_id)));
create policy "members read audit log" on public.audit_log for select using (public.is_org_member(organization_id));
