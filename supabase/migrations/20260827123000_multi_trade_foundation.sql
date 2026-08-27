-- Fondation additive pour le futur onboarding multi-métiers.
-- Cette migration ne modifie ni ne supprime aucune donnée métier existante.

alter table public.organizations
  add column if not exists primary_trade text not null default 'interior_painting';

create table if not exists public.organization_trades (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  trade text not null check (length(btrim(trade)) between 1 and 120),
  enabled boolean not null default true,
  pack_version integer not null default 1 check (pack_version > 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, trade)
);

create index if not exists organization_trades_enabled_idx
  on public.organization_trades (organization_id, enabled, trade);

insert into public.organization_trades (organization_id, trade, enabled, pack_version)
select id, coalesce(nullif(btrim(primary_trade), ''), 'interior_painting'), true, 1
from public.organizations
on conflict (organization_id, trade) do nothing;

alter table public.organization_trades enable row level security;

drop policy if exists "members manage organization trades" on public.organization_trades;
create policy "members manage organization trades"
  on public.organization_trades for all
  using (public.is_org_member(organization_id))
  with check (public.is_org_member(organization_id));

comment on column public.organizations.primary_trade is
  'Identifiant du métier principal utilisé pour charger le pack métier FORGEO. Valeur historique par défaut : interior_painting.';

comment on table public.organization_trades is
  'Métiers et spécialisations activés pour une organisation. Les règles métier restent versionnées côté application ; settings porte uniquement des adaptations propres à l’entreprise.';
