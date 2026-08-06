create table if not exists public.catalog_services (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  label text not null,
  description text,
  unit text not null check (unit in ('m2', 'm', 'l', 'h', 'unite', 'forfait')),
  unit_price_ht numeric(12,2) not null default 0 check (unit_price_ht >= 0),
  material_cost_per_unit numeric(12,2) not null default 0 check (material_cost_per_unit >= 0),
  labour_hours_per_unit numeric(12,4) not null default 0 check (labour_hours_per_unit >= 0),
  tax_rate numeric(5,2) not null default 20 check (tax_rate in (0, 5.5, 10, 20)),
  margin_target numeric(5,2) check (margin_target is null or margin_target between 0 and 100),
  supplier_name text,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table if not exists public.company_pricing_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  hourly_cost numeric(12,2) not null default 28 check (hourly_cost >= 0),
  target_margin_rate numeric(5,2) not null default 30 check (target_margin_rate between 0 and 100),
  default_tax_rate numeric(5,2) not null default 20 check (default_tax_rate in (0, 5.5, 10, 20)),
  include_travel_fee boolean not null default true,
  travel_fee_ht numeric(12,2) not null default 0 check (travel_fee_ht >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  trade text not null,
  code text not null,
  label text not null,
  version integer not null default 1 check (version > 0),
  definition jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code, version)
);

create table if not exists public.copilot_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  customer_id uuid references public.customers(id) on delete set null,
  quote_id uuid references public.quotes(id) on delete set null,
  status text not null check (status in ('needs_information', 'ready_for_review', 'accepted', 'rejected')),
  source_text text not null,
  trade text not null,
  job_type text not null,
  interpretation jsonb not null default '{}'::jsonb,
  lines jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  provider text,
  model text,
  created_at timestamptz not null default now(),
  validated_at timestamptz
);

create table if not exists public.copilot_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  proposal_id uuid references public.copilot_proposals(id) on delete set null,
  user_id uuid references auth.users(id),
  service_code text,
  field_name text not null,
  previous_value jsonb,
  validated_value jsonb not null,
  scope text not null check (scope in ('one_time', 'similar_jobs', 'catalog_update', 'company_rule')),
  context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_actuals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  labour_hours numeric(12,2) not null default 0 check (labour_hours >= 0),
  material_cost numeric(12,2) not null default 0 check (material_cost >= 0),
  travel_cost numeric(12,2) not null default 0 check (travel_cost >= 0),
  other_cost numeric(12,2) not null default 0 check (other_cost >= 0),
  revenue_ht numeric(12,2) not null default 0 check (revenue_ht >= 0),
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists catalog_services_org_active_idx
  on public.catalog_services (organization_id, active, code);
create index if not exists job_templates_trade_active_idx
  on public.job_templates (trade, active, code);
create index if not exists copilot_proposals_org_created_idx
  on public.copilot_proposals (organization_id, created_at desc);
create index if not exists copilot_corrections_org_service_idx
  on public.copilot_corrections (organization_id, service_code, created_at desc);
create index if not exists project_actuals_org_completed_idx
  on public.project_actuals (organization_id, completed_at desc);

alter table public.catalog_services enable row level security;
alter table public.company_pricing_settings enable row level security;
alter table public.job_templates enable row level security;
alter table public.copilot_proposals enable row level security;
alter table public.copilot_corrections enable row level security;
alter table public.project_actuals enable row level security;

create policy "members manage catalog services"
  on public.catalog_services for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "members manage company pricing settings"
  on public.company_pricing_settings for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "members read available job templates"
  on public.job_templates for select
  using (organization_id is null or public.is_org_member(organization_id));

create policy "members manage organization job templates"
  on public.job_templates for all
  using (organization_id is not null and public.is_org_member(organization_id))
  with check (organization_id is not null and public.is_org_member(organization_id));

create policy "members manage copilot proposals"
  on public.copilot_proposals for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "members manage copilot corrections"
  on public.copilot_corrections for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

create policy "members manage project actuals"
  on public.project_actuals for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));
