alter table public.project_notes
  add column if not exists kind text not null default 'note',
  add column if not exists status text not null default 'open',
  add column if not exists due_at timestamptz,
  add column if not exists pinned boolean not null default false,
  add column if not exists mentions uuid[] not null default '{}'::uuid[],
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists source text not null default 'manual',
  add column if not exists edited_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references auth.users(id) on delete set null;

alter table public.project_notes drop constraint if exists project_notes_kind_check;
alter table public.project_notes
  add constraint project_notes_kind_check check (kind in ('note', 'task'));

alter table public.project_notes drop constraint if exists project_notes_status_check;
alter table public.project_notes
  add constraint project_notes_status_check check (status in ('open', 'done'));

alter table public.project_notes drop constraint if exists project_notes_source_check;
alter table public.project_notes
  add constraint project_notes_source_check check (source in ('manual', 'voice'));

alter table public.project_notes drop constraint if exists project_notes_mentions_limit_check;
alter table public.project_notes
  add constraint project_notes_mentions_limit_check check (cardinality(mentions) <= 20);

alter table public.project_notes drop constraint if exists project_notes_tags_limit_check;
alter table public.project_notes
  add constraint project_notes_tags_limit_check check (cardinality(tags) <= 8);

create index if not exists project_notes_activity_idx
  on public.project_notes (organization_id, project_id, pinned desc, created_at desc);
create index if not exists project_notes_mentions_gin_idx
  on public.project_notes using gin (mentions);
create index if not exists project_notes_tags_gin_idx
  on public.project_notes using gin (tags);

create or replace function private.touch_project_note_activity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

revoke all on function private.touch_project_note_activity() from public, anon, authenticated;

drop trigger if exists project_notes_touch_activity on public.project_notes;
create trigger project_notes_touch_activity
before update on public.project_notes
for each row execute function private.touch_project_note_activity();

create table if not exists public.project_note_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  note_id uuid not null references public.project_notes(id) on delete cascade,
  project_id text not null check (length(project_id) between 1 and 160),
  file_name text not null check (length(trim(file_name)) between 1 and 200),
  storage_path text not null unique check (length(storage_path) between 1 and 500),
  mime_type text not null check (length(trim(mime_type)) between 3 and 160),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 15728640),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists project_note_attachments_note_idx
  on public.project_note_attachments (note_id, created_at);
create index if not exists project_note_attachments_org_project_idx
  on public.project_note_attachments (organization_id, project_id, created_at desc);

alter table public.project_note_attachments enable row level security;

drop policy if exists "members read project note attachments" on public.project_note_attachments;
create policy "members read project note attachments"
on public.project_note_attachments for select to authenticated
using (private.is_org_member(organization_id));

revoke all on table public.project_note_attachments from anon, authenticated;
grant select on table public.project_note_attachments to authenticated;
grant all on table public.project_note_attachments to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-activity',
  'project-activity',
  false,
  15728640,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
