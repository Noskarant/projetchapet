alter table public.voice_email_deliveries
  add column attachment_quote_id uuid references public.quotes(id) on delete set null,
  add column attachment_filename text,
  add column attachment_base64 text;

alter table public.voice_email_deliveries
  add constraint voice_email_attachment_pair check (
    (attachment_filename is null and attachment_base64 is null)
    or (attachment_filename is not null and attachment_base64 is not null
      and length(attachment_filename) between 5 and 120
      and length(attachment_base64) <= 10000000)
  );
