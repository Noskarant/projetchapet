create index if not exists project_notes_created_by_idx
  on public.project_notes (created_by);
create index if not exists project_notes_completed_by_idx
  on public.project_notes (completed_by)
  where completed_by is not null;
create index if not exists project_note_attachments_created_by_idx
  on public.project_note_attachments (created_by);
