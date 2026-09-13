create table if not exists public.action_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  source_type text not null check (source_type in ('voice','text','email','document','form','system','import')),
  source_reference text,
  raw_text text not null default '' check (length(raw_text) <= 20000),
  intent_type text not null check (intent_type in ('create_customer','prepare_quote','update_project_note','prepare_supplier_order','schedule_task','prepare_invoice','mark_payment','prepare_email')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  risk_level text not null check (risk_level in ('low','review','explicit_confirmation')),
  status text not null default 'draft' check (status in ('draft','needs_input','ready','confirmed','executed','rejected','failed')),
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  missing_fields jsonb not null default '[]'::jsonb check (jsonb_typeof(missing_fields) = 'array'),
  confirmed_by uuid references auth.users(id) on delete restrict,
  confirmed_at timestamptz,
  executed_at timestamptz,
  execution_result jsonb not null default '{}'::jsonb check (jsonb_typeof(execution_result) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists action_proposals_org_created_idx on public.action_proposals (organization_id, created_at desc);
create index if not exists action_proposals_org_status_idx on public.action_proposals (organization_id, status, created_at desc);
alter table public.action_proposals enable row level security;

drop policy if exists "members read action proposals" on public.action_proposals;
create policy "members read action proposals" on public.action_proposals for select to authenticated
using (private.is_org_member(organization_id));

drop policy if exists "members create own action proposals" on public.action_proposals;
create policy "members create own action proposals" on public.action_proposals for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and created_by = auth.uid()
  and status in ('draft','needs_input','ready')
  and confirmed_by is null
  and confirmed_at is null
  and executed_at is null
);

drop policy if exists "authors update unexecuted action proposals" on public.action_proposals;
create policy "authors update unexecuted action proposals" on public.action_proposals for update to authenticated
using (private.is_org_member(organization_id) and created_by = auth.uid() and status in ('draft','needs_input','ready','rejected'))
with check (
  private.is_org_member(organization_id)
  and created_by = auth.uid()
  and status in ('draft','needs_input','ready','rejected')
  and confirmed_by is null
  and confirmed_at is null
  and executed_at is null
);

create table if not exists public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  file_name text not null check (length(trim(file_name)) between 1 and 240),
  source_system text not null default 'generic' check (source_system in ('generic','tolteck','obat','costructor','ebp','other')),
  entity_type text not null check (entity_type in ('customers','catalog','suppliers','quotes','invoices','payments','projects')),
  status text not null default 'preview' check (status in ('preview','ready','importing','completed','failed','cancelled')),
  mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping) = 'object'),
  counters jsonb not null default '{}'::jsonb check (jsonb_typeof(counters) = 'object'),
  error_message text,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists import_jobs_org_created_idx on public.import_jobs (organization_id, created_at desc);
alter table public.import_jobs enable row level security;

drop policy if exists "admins manage import jobs" on public.import_jobs;
create policy "admins manage import jobs" on public.import_jobs for all to authenticated
using (private.has_org_role(organization_id, array['owner','admin']))
with check (private.has_org_role(organization_id, array['owner','admin']) and created_by = auth.uid());

create table if not exists public.import_staging_rows (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.import_jobs(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  row_index integer not null check (row_index >= 1),
  entity_type text not null,
  source_id text,
  raw_data jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_data) = 'object'),
  normalized_data jsonb not null default '{}'::jsonb check (jsonb_typeof(normalized_data) = 'object'),
  validation_errors jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_errors) = 'array'),
  status text not null default 'valid' check (status in ('valid','invalid','duplicate','imported','skipped')),
  duplicate_of text,
  imported_record_id text,
  created_at timestamptz not null default now(),
  unique (job_id, row_index, entity_type)
);
create index if not exists import_staging_rows_job_status_idx on public.import_staging_rows (job_id, status, row_index);
alter table public.import_staging_rows enable row level security;

drop policy if exists "admins manage import staging rows" on public.import_staging_rows;
create policy "admins manage import staging rows" on public.import_staging_rows for all to authenticated
using (private.has_org_role(organization_id, array['owner','admin']))
with check (private.has_org_role(organization_id, array['owner','admin']));

create table if not exists public.external_source_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null,
  entity_type text not null,
  source_id text not null,
  target_id text not null,
  import_job_id uuid references public.import_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, source_system, entity_type, source_id)
);
create index if not exists external_source_links_target_idx on public.external_source_links (organization_id, entity_type, target_id);
alter table public.external_source_links enable row level security;

drop policy if exists "admins manage external source links" on public.external_source_links;
create policy "admins manage external source links" on public.external_source_links for all to authenticated
using (private.has_org_role(organization_id, array['owner','admin']))
with check (private.has_org_role(organization_id, array['owner','admin']));

revoke all on table public.action_proposals, public.import_jobs, public.import_staging_rows, public.external_source_links from anon;
grant select, insert, update on table public.action_proposals to authenticated;
grant select, insert, update, delete on table public.import_jobs, public.import_staging_rows, public.external_source_links to authenticated;
grant all on table public.action_proposals, public.import_jobs, public.import_staging_rows, public.external_source_links to service_role;
