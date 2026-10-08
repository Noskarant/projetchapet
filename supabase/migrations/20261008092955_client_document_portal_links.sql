-- Private links received from customers, kept outside public document notes/PDFs.
-- Existing customer organization/office-role policies protect this column.
alter table public.customers
  add column if not exists portal_links jsonb not null default '{}'::jsonb;

alter table public.customers
  add constraint customers_portal_links_object check (
    jsonb_typeof(portal_links) = 'object' and length(portal_links::text) <= 100000
  );
