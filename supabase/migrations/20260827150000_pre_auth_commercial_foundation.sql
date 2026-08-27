-- Fondation commerciale additive avant l'activation de l'authentification.
-- Aucun accès anonyme n'est ajouté par cette migration.

alter table public.catalog_services
  add column if not exists trade text not null default 'interior_painting',
  add column if not exists source text not null default 'manual',
  add column if not exists confirmed_at timestamptz;

alter table public.catalog_services
  drop constraint if exists catalog_services_unit_check;

alter table public.catalog_services
  add constraint catalog_services_unit_check
  check (unit in ('m2', 'm', 'ml', 'l', 'h', 'jour', 'unite', 'forfait'));

alter table public.catalog_services
  drop constraint if exists catalog_services_source_check;

alter table public.catalog_services
  add constraint catalog_services_source_check
  check (source in ('manual', 'imported', 'correction'));

alter table public.catalog_services
  drop constraint if exists catalog_services_organization_id_code_key;

create unique index if not exists catalog_services_org_trade_code_uidx
  on public.catalog_services (organization_id, trade, code);

create index if not exists catalog_services_org_trade_active_idx
  on public.catalog_services (organization_id, trade, active, code);

create table if not exists public.company_trade_pricing_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trade text not null,
  hourly_cost numeric(12,2) not null default 28 check (hourly_cost >= 0),
  target_margin_rate numeric(5,2) not null default 30 check (target_margin_rate between 0 and 100),
  default_tax_rate numeric(5,2) not null default 20 check (default_tax_rate in (0, 5.5, 10, 20)),
  include_travel_fee boolean not null default true,
  travel_fee_ht numeric(12,2) not null default 0 check (travel_fee_ht >= 0),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (organization_id, trade)
);

insert into public.company_trade_pricing_settings (
  organization_id,
  trade,
  hourly_cost,
  target_margin_rate,
  default_tax_rate,
  include_travel_fee,
  travel_fee_ht
)
select
  settings.organization_id,
  coalesce(nullif(btrim(org.primary_trade), ''), 'interior_painting'),
  settings.hourly_cost,
  settings.target_margin_rate,
  settings.default_tax_rate,
  settings.include_travel_fee,
  settings.travel_fee_ht
from public.company_pricing_settings settings
join public.organizations org on org.id = settings.organization_id
on conflict (organization_id, trade) do nothing;

create table if not exists public.company_copilot_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trade text not null,
  instruction text not null check (length(btrim(instruction)) between 2 and 2000),
  payload jsonb not null default '{}'::jsonb,
  source text not null default 'manual' check (source in ('manual', 'correction', 'import')),
  source_correction_id uuid references public.copilot_corrections(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_copilot_rules_org_trade_active_idx
  on public.company_copilot_rules (organization_id, trade, active, created_at desc);

create table if not exists public.project_cost_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  kind text not null check (kind in ('labour', 'material', 'travel', 'subcontract', 'other')),
  description text not null default '',
  amount numeric(12,2) not null default 0 check (amount >= 0),
  labour_hours numeric(12,2) not null default 0 check (labour_hours >= 0),
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quote_id is not null or invoice_id is not null)
);

create index if not exists project_cost_entries_org_quote_idx
  on public.project_cost_entries (organization_id, quote_id, occurred_at desc);
create index if not exists project_cost_entries_org_invoice_idx
  on public.project_cost_entries (organization_id, invoice_id, occurred_at desc);

create or replace function public.validate_project_cost_entry_organization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.quote_id is not null and not exists (
    select 1 from public.quotes
    where id = new.quote_id and organization_id = new.organization_id
  ) then
    raise exception 'quote does not belong to organization';
  end if;

  if new.invoice_id is not null and not exists (
    select 1 from public.invoices
    where id = new.invoice_id and organization_id = new.organization_id
  ) then
    raise exception 'invoice does not belong to organization';
  end if;

  return new;
end;
$$;

revoke all on function public.validate_project_cost_entry_organization() from public;

drop trigger if exists project_cost_entries_validate_organization on public.project_cost_entries;
create trigger project_cost_entries_validate_organization
before insert or update on public.project_cost_entries
for each row execute function public.validate_project_cost_entry_organization();

create or replace function public.validate_company_copilot_rule_organization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source_correction_id is not null and not exists (
    select 1 from public.copilot_corrections
    where id = new.source_correction_id and organization_id = new.organization_id
  ) then
    raise exception 'correction does not belong to organization';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_company_copilot_rule_organization() from public;

drop trigger if exists company_copilot_rules_validate_organization on public.company_copilot_rules;
create trigger company_copilot_rules_validate_organization
before insert or update on public.company_copilot_rules
for each row execute function public.validate_company_copilot_rule_organization();

alter table public.company_trade_pricing_settings enable row level security;
alter table public.company_copilot_rules enable row level security;
alter table public.project_cost_entries enable row level security;

drop policy if exists "members manage company trade pricing settings" on public.company_trade_pricing_settings;
create policy "members manage company trade pricing settings"
  on public.company_trade_pricing_settings
  for all
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "members manage company copilot rules" on public.company_copilot_rules;
create policy "members manage company copilot rules"
  on public.company_copilot_rules
  for all
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "members manage project cost entries" on public.project_cost_entries;
create policy "members manage project cost entries"
  on public.project_cost_entries
  for all
  to authenticated
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

drop policy if exists "members read available job templates" on public.job_templates;
create policy "members read available job templates"
  on public.job_templates
  for select
  to authenticated
  using (organization_id is null or public.is_org_member(organization_id));

drop trigger if exists company_trade_pricing_settings_set_updated_at on public.company_trade_pricing_settings;
create trigger company_trade_pricing_settings_set_updated_at
before update on public.company_trade_pricing_settings
for each row execute function public.set_updated_at();

drop trigger if exists company_copilot_rules_set_updated_at on public.company_copilot_rules;
create trigger company_copilot_rules_set_updated_at
before update on public.company_copilot_rules
for each row execute function public.set_updated_at();

drop trigger if exists project_cost_entries_set_updated_at on public.project_cost_entries;
create trigger project_cost_entries_set_updated_at
before update on public.project_cost_entries
for each row execute function public.set_updated_at();

comment on table public.company_trade_pricing_settings is
  'Paramètres de chiffrage propres à chaque métier activé dans une entreprise FORGEO.';
comment on table public.company_copilot_rules is
  'Règles d’entreprise validées manuellement ou promues depuis une correction du copilote.';
comment on table public.project_cost_entries is
  'Coûts réellement constatés sur un chantier pour comparer le prévu et le réalisé.';
