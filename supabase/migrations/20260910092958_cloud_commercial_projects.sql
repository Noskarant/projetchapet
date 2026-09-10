-- FORGEO commercial cloud foundation
-- Chantiers, collaborateurs, étapes, signalements, photos et activité deviennent
-- des données organisation-scopées. Les écritures passent par un RPC transactionnel
-- avec contrôle d'optimistic concurrency ; les photos restent dans un bucket privé.

create table if not exists public.commercial_workspace_meta (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  revision bigint not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.commercial_collaborators (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  position integer not null default 0,
  name text not null,
  role text not null default '',
  phone text not null default '',
  initials text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  check (length(id) between 1 and 160),
  check (length(name) between 1 and 240),
  check (position >= 0)
);

create table if not exists public.commercial_projects (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  position integer not null default 0,
  name text not null,
  subtitle text not null default '',
  customer_id text not null default '',
  quote_id text,
  invoice_id text,
  address text not null default '',
  status text not null default 'À planifier',
  start_date date,
  next_visit date,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  check (length(id) between 1 and 160),
  check (length(name) between 1 and 300),
  check (position >= 0),
  check (status in ('À planifier', 'En cours', 'Bloqué', 'Terminé'))
);

create table if not exists public.commercial_project_members (
  organization_id uuid not null,
  project_id text not null,
  collaborator_id text not null,
  position integer not null default 0,
  primary key (organization_id, project_id, collaborator_id),
  foreign key (organization_id, project_id)
    references public.commercial_projects(organization_id, id) on delete cascade,
  foreign key (organization_id, collaborator_id)
    references public.commercial_collaborators(organization_id, id) on delete cascade,
  check (position >= 0)
);

create table if not exists public.commercial_project_steps (
  organization_id uuid not null,
  project_id text not null,
  id text not null,
  position integer not null default 0,
  label text not null,
  assignee_id text,
  due_date date,
  done boolean not null default false,
  primary key (organization_id, project_id, id),
  foreign key (organization_id, project_id)
    references public.commercial_projects(organization_id, id) on delete cascade,
  check (length(id) between 1 and 160),
  check (length(label) between 1 and 500),
  check (assignee_id is null or length(assignee_id) between 1 and 160),
  check (position >= 0)
);

create table if not exists public.commercial_project_issues (
  organization_id uuid not null,
  project_id text not null,
  id text not null,
  position integer not null default 0,
  title text not null,
  detail text not null default '',
  severity text not null default 'À surveiller',
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (organization_id, project_id, id),
  foreign key (organization_id, project_id)
    references public.commercial_projects(organization_id, id) on delete cascade,
  check (length(id) between 1 and 160),
  check (length(title) between 1 and 500),
  check (position >= 0),
  check (severity in ('Information', 'À surveiller', 'Bloquant'))
);

create table if not exists public.commercial_project_photos (
  organization_id uuid not null,
  project_id text not null,
  id text not null,
  position integer not null default 0,
  name text not null default '',
  caption text not null default 'Photo chantier',
  storage_path text,
  created_at timestamptz not null default now(),
  primary key (organization_id, project_id, id),
  foreign key (organization_id, project_id)
    references public.commercial_projects(organization_id, id) on delete cascade,
  unique (organization_id, storage_path),
  check (length(id) between 1 and 160),
  check (position >= 0)
);

create table if not exists public.commercial_activity_events (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  position integer not null default 0,
  kind text not null,
  message text not null,
  document_number text,
  project_id text,
  created_at timestamptz not null default now(),
  primary key (organization_id, id),
  check (length(id) between 1 and 180),
  check (length(message) between 1 and 2000),
  check (position >= 0),
  check (kind in ('document', 'status', 'chantier', 'email', 'data', 'settings'))
);

alter table public.commercial_workspace_meta enable row level security;
alter table public.commercial_collaborators enable row level security;
alter table public.commercial_projects enable row level security;
alter table public.commercial_project_members enable row level security;
alter table public.commercial_project_steps enable row level security;
alter table public.commercial_project_issues enable row level security;
alter table public.commercial_project_photos enable row level security;
alter table public.commercial_activity_events enable row level security;

-- Lecture directe seulement. Les modifications relationnelles passent par le RPC atomique.
revoke all on table public.commercial_workspace_meta from anon, authenticated;
revoke all on table public.commercial_collaborators from anon, authenticated;
revoke all on table public.commercial_projects from anon, authenticated;
revoke all on table public.commercial_project_members from anon, authenticated;
revoke all on table public.commercial_project_steps from anon, authenticated;
revoke all on table public.commercial_project_issues from anon, authenticated;
revoke all on table public.commercial_project_photos from anon, authenticated;
revoke all on table public.commercial_activity_events from anon, authenticated;

grant select on table public.commercial_workspace_meta to authenticated;
grant select on table public.commercial_collaborators to authenticated;
grant select on table public.commercial_projects to authenticated;
grant select on table public.commercial_project_members to authenticated;
grant select on table public.commercial_project_steps to authenticated;
grant select on table public.commercial_project_issues to authenticated;
grant select on table public.commercial_project_photos to authenticated;
grant select on table public.commercial_activity_events to authenticated;

create policy "members read commercial workspace meta"
  on public.commercial_workspace_meta for select to authenticated
  using (private.is_org_member(organization_id));
create policy "members read commercial collaborators"
  on public.commercial_collaborators for select to authenticated
  using (private.is_org_member(organization_id));
create policy "members read commercial projects"
  on public.commercial_projects for select to authenticated
  using (private.is_org_member(organization_id));
create policy "members read commercial project members"
  on public.commercial_project_members for select to authenticated
  using (private.is_org_member(organization_id));
create policy "members read commercial project steps"
  on public.commercial_project_steps for select to authenticated
  using (private.is_org_member(organization_id));
create policy "members read commercial project issues"
  on public.commercial_project_issues for select to authenticated
  using (private.is_org_member(organization_id));
create policy "members read commercial project photos"
  on public.commercial_project_photos for select to authenticated
  using (private.is_org_member(organization_id));
create policy "members read commercial activity"
  on public.commercial_activity_events for select to authenticated
  using (private.is_org_member(organization_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'commercial-project-photos',
  'commercial-project-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Le premier dossier d'un objet est l'UUID de l'organisation. Le bucket est privé.
create policy "members read commercial project photo objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'commercial-project-photos'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and private.is_org_member(((storage.foldername(name))[1])::uuid)
  );
create policy "members upload commercial project photo objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'commercial-project-photos'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and private.is_org_member(((storage.foldername(name))[1])::uuid)
  );
create policy "members update commercial project photo objects"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'commercial-project-photos'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and private.is_org_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'commercial-project-photos'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and private.is_org_member(((storage.foldername(name))[1])::uuid)
  );
create policy "members delete commercial project photo objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'commercial-project-photos'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and private.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create or replace function public.replace_commercial_workspace(
  p_state jsonb,
  p_expected_revision bigint default 0
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_org uuid;
  current_revision bigint;
  next_revision bigint;
  collaborators jsonb := coalesce(p_state->'collaborators', '[]'::jsonb);
  projects jsonb := coalesce(p_state->'projects', '[]'::jsonb);
  activity jsonb := coalesce(p_state->'activity', '[]'::jsonb);
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'authentication required';
  end if;

  target_org := private.active_organization_id();
  if target_org is null or not private.is_org_member(target_org) then
    raise exception using errcode = '42501', message = 'active organization unavailable';
  end if;

  if p_state is null or jsonb_typeof(p_state) <> 'object'
     or jsonb_typeof(collaborators) <> 'array'
     or jsonb_typeof(projects) <> 'array'
     or jsonb_typeof(activity) <> 'array' then
    raise exception 'invalid commercial workspace';
  end if;

  if jsonb_array_length(collaborators) > 200
     or jsonb_array_length(projects) > 500
     or jsonb_array_length(activity) > 200 then
    raise exception 'commercial workspace is too large';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(projects) p
    where jsonb_typeof(coalesce(p->'teamIds', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(p->'steps', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(p->'issues', '[]'::jsonb)) <> 'array'
       or jsonb_typeof(coalesce(p->'photos', '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p->'teamIds', '[]'::jsonb)) > 100
       or jsonb_array_length(coalesce(p->'steps', '[]'::jsonb)) > 300
       or jsonb_array_length(coalesce(p->'issues', '[]'::jsonb)) > 300
       or jsonb_array_length(coalesce(p->'photos', '[]'::jsonb)) > 100
  ) then
    raise exception 'invalid commercial project payload';
  end if;

  if exists (
    select 1 from jsonb_array_elements(collaborators) c
    where length(trim(coalesce(c->>'id', ''))) not between 1 and 160
       or length(trim(coalesce(c->>'name', ''))) not between 1 and 240
  ) or exists (
    select 1 from jsonb_array_elements(projects) p
    where length(trim(coalesce(p->>'id', ''))) not between 1 and 160
       or length(trim(coalesce(p->>'name', ''))) not between 1 and 300
       or coalesce(nullif(p->>'status', ''), 'À planifier') not in ('À planifier', 'En cours', 'Bloqué', 'Terminé')
  ) or exists (
    select 1 from jsonb_array_elements(activity) a
    where length(trim(coalesce(a->>'id', ''))) not between 1 and 180
       or length(trim(coalesce(a->>'message', ''))) not between 1 and 2000
       or coalesce(a->>'kind', '') not in ('document', 'status', 'chantier', 'email', 'data', 'settings')
  ) then
    raise exception 'invalid commercial identifier or label';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(projects) p
    cross join lateral jsonb_array_elements(coalesce(p->'steps', '[]'::jsonb)) step
    where length(trim(coalesce(step->>'id', ''))) not between 1 and 160
       or length(trim(coalesce(step->>'label', ''))) not between 1 and 500
       or length(coalesce(step->>'assigneeId', '')) > 160
  ) or exists (
    select 1
    from jsonb_array_elements(projects) p
    cross join lateral jsonb_array_elements(coalesce(p->'issues', '[]'::jsonb)) issue
    where length(trim(coalesce(issue->>'id', ''))) not between 1 and 160
       or length(trim(coalesce(issue->>'title', ''))) not between 1 and 500
       or coalesce(nullif(issue->>'severity', ''), 'À surveiller') not in ('Information', 'À surveiller', 'Bloquant')
  ) or exists (
    select 1
    from jsonb_array_elements(projects) p
    cross join lateral jsonb_array_elements(coalesce(p->'photos', '[]'::jsonb)) photo
    where length(trim(coalesce(photo->>'id', ''))) not between 1 and 160
  ) then
    raise exception 'invalid nested commercial item';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(projects) p
    cross join lateral jsonb_array_elements_text(coalesce(p->'teamIds', '[]'::jsonb)) member
    where not exists (
      select 1 from jsonb_array_elements(collaborators) c
      where trim(c->>'id') = member
    )
  ) or exists (
    select 1
    from jsonb_array_elements(projects) p
    cross join lateral jsonb_array_elements(coalesce(p->'steps', '[]'::jsonb)) step
    where nullif(step->>'assigneeId', '') is not null
      and not exists (
        select 1 from jsonb_array_elements(collaborators) c
        where trim(c->>'id') = step->>'assigneeId'
      )
  ) then
    raise exception 'unknown commercial collaborator reference';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(projects) p
    cross join lateral jsonb_array_elements(coalesce(p->'photos', '[]'::jsonb)) photo
    where nullif(photo->>'storagePath', '') is not null
      and (photo->>'storagePath') not like target_org::text || '/%'
  ) then
    raise exception 'photo path outside active organization';
  end if;

  insert into public.commercial_workspace_meta (organization_id, revision, updated_by)
  values (target_org, 0, auth.uid())
  on conflict (organization_id) do nothing;

  select revision into current_revision
  from public.commercial_workspace_meta
  where organization_id = target_org
  for update;

  if current_revision <> coalesce(p_expected_revision, 0) then
    raise exception using errcode = '40001', message = 'commercial workspace conflict';
  end if;

  delete from public.commercial_activity_events where organization_id = target_org;
  delete from public.commercial_project_photos where organization_id = target_org;
  delete from public.commercial_project_issues where organization_id = target_org;
  delete from public.commercial_project_steps where organization_id = target_org;
  delete from public.commercial_project_members where organization_id = target_org;
  delete from public.commercial_projects where organization_id = target_org;
  delete from public.commercial_collaborators where organization_id = target_org;

  insert into public.commercial_collaborators (
    organization_id, id, position, name, role, phone, initials, active
  )
  select target_org, trim(c.value->>'id'), c.ordinality - 1, trim(c.value->>'name'),
         coalesce(c.value->>'role', ''), coalesce(c.value->>'phone', ''),
         coalesce(c.value->>'initials', ''), coalesce((c.value->>'active')::boolean, true)
  from jsonb_array_elements(collaborators) with ordinality as c(value, ordinality);

  insert into public.commercial_projects (
    organization_id, id, position, name, subtitle, customer_id, quote_id, invoice_id,
    address, status, start_date, next_visit
  )
  select target_org, trim(p.value->>'id'), p.ordinality - 1, trim(p.value->>'name'),
         coalesce(p.value->>'subtitle', ''), coalesce(p.value->>'customerId', ''),
         nullif(p.value->>'quoteId', ''), nullif(p.value->>'invoiceId', ''),
         coalesce(p.value->>'address', ''), coalesce(nullif(p.value->>'status', ''), 'À planifier'),
         nullif(p.value->>'startDate', '')::date, nullif(p.value->>'nextVisit', '')::date
  from jsonb_array_elements(projects) with ordinality as p(value, ordinality);

  insert into public.commercial_project_members (
    organization_id, project_id, collaborator_id, position
  )
  select target_org, p.value->>'id', member.value, member.ordinality - 1
  from jsonb_array_elements(projects) as p(value)
  cross join lateral jsonb_array_elements_text(coalesce(p.value->'teamIds', '[]'::jsonb))
    with ordinality as member(value, ordinality);

  insert into public.commercial_project_steps (
    organization_id, project_id, id, position, label, assignee_id, due_date, done
  )
  select target_org, p.value->>'id', trim(step.value->>'id'), step.ordinality - 1,
         trim(step.value->>'label'), nullif(step.value->>'assigneeId', ''),
         nullif(step.value->>'dueDate', '')::date, coalesce((step.value->>'done')::boolean, false)
  from jsonb_array_elements(projects) as p(value)
  cross join lateral jsonb_array_elements(coalesce(p.value->'steps', '[]'::jsonb))
    with ordinality as step(value, ordinality);

  insert into public.commercial_project_issues (
    organization_id, project_id, id, position, title, detail, severity, resolved, created_at
  )
  select target_org, p.value->>'id', trim(issue.value->>'id'), issue.ordinality - 1,
         trim(issue.value->>'title'), coalesce(issue.value->>'detail', ''),
         coalesce(nullif(issue.value->>'severity', ''), 'À surveiller'),
         coalesce((issue.value->>'resolved')::boolean, false),
         coalesce(nullif(issue.value->>'createdAt', '')::timestamptz, now())
  from jsonb_array_elements(projects) as p(value)
  cross join lateral jsonb_array_elements(coalesce(p.value->'issues', '[]'::jsonb))
    with ordinality as issue(value, ordinality);

  insert into public.commercial_project_photos (
    organization_id, project_id, id, position, name, caption, storage_path, created_at
  )
  select target_org, p.value->>'id', trim(photo.value->>'id'), photo.ordinality - 1,
         coalesce(photo.value->>'name', ''), coalesce(nullif(photo.value->>'caption', ''), 'Photo chantier'),
         nullif(photo.value->>'storagePath', ''),
         coalesce(nullif(photo.value->>'createdAt', '')::timestamptz, now())
  from jsonb_array_elements(projects) as p(value)
  cross join lateral jsonb_array_elements(coalesce(p.value->'photos', '[]'::jsonb))
    with ordinality as photo(value, ordinality);

  insert into public.commercial_activity_events (
    organization_id, id, position, kind, message, document_number, project_id, created_at
  )
  select target_org, trim(a.value->>'id'), a.ordinality - 1, a.value->>'kind', trim(a.value->>'message'),
         nullif(a.value->>'documentNumber', ''), nullif(a.value->>'projectId', ''),
         coalesce(nullif(a.value->>'createdAt', '')::timestamptz, now())
  from jsonb_array_elements(activity) with ordinality as a(value, ordinality);

  update public.commercial_workspace_meta
  set revision = revision + 1,
      updated_by = auth.uid(),
      updated_at = now()
  where organization_id = target_org
  returning revision into next_revision;

  return next_revision;
end;
$$;

revoke execute on function public.replace_commercial_workspace(jsonb, bigint) from public, anon;
grant execute on function public.replace_commercial_workspace(jsonb, bigint) to authenticated;
