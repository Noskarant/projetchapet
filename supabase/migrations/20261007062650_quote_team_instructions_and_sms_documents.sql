alter table public.quote_private_meta add column if not exists team_instructions text not null default '' check (length(team_instructions) <= 5000);

-- PDFs are private. The server creates a seven-day capability URL only after
-- checking the document's organization and the user's commercial role.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('document-shares','document-shares',false,10000000,array['application/pdf'])
on conflict (id) do nothing;
