-- Phase 4 FORGEO : snapshot pilote sécurisé par entreprise.
-- Migration additive : elle peut être appliquée avant le basculement de l'app,
-- sans retirer l'accès anonyme historique tant que la nouvelle authentification
-- n'est pas déployée et validée.

create table if not exists public.pilot_workspace_snapshots (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version >= 1),
  workspace jsonb not null default '{"customers":[],"quotes":[],"invoices":[],"agenda":[]}'::jsonb,
  company_profile jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(workspace) = 'object'),
  check (jsonb_typeof(company_profile) = 'object')
);

alter table public.pilot_workspace_snapshots enable row level security;

revoke all privileges on table public.pilot_workspace_snapshots from public, anon;
grant select, insert, update on table public.pilot_workspace_snapshots to authenticated;

drop policy if exists "members read pilot workspace" on public.pilot_workspace_snapshots;
create policy "members read pilot workspace"
on public.pilot_workspace_snapshots
for select
to authenticated
using (private.is_org_member(organization_id));

drop policy if exists "members create pilot workspace" on public.pilot_workspace_snapshots;
create policy "members create pilot workspace"
on public.pilot_workspace_snapshots
for insert
to authenticated
with check (
  private.is_org_member(organization_id)
  and (updated_by is null or updated_by = auth.uid())
);

drop policy if exists "members update pilot workspace" on public.pilot_workspace_snapshots;
create policy "members update pilot workspace"
on public.pilot_workspace_snapshots
for update
to authenticated
using (private.is_org_member(organization_id))
with check (
  private.is_org_member(organization_id)
  and (updated_by is null or updated_by = auth.uid())
);

comment on table public.pilot_workspace_snapshots is
  'Snapshot JSON compatible avec le workspace mobile FORGEO pendant la migration vers le modèle multi-entreprise normalisé.';
