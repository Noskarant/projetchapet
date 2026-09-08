-- Phase 4 FORGEO : retrait du mode démo anonyme.
-- À appliquer uniquement en même temps que le déploiement de l'authentification pilote.

-- Les policies anonymes historiques sont supprimées.
drop policy if exists "demo read organization" on public.organizations;
drop policy if exists "demo manage customers" on public.customers;
drop policy if exists "demo manage quotes" on public.quotes;
drop policy if exists "demo manage quote items" on public.quote_items;
drop policy if exists "demo manage invoices" on public.invoices;
drop policy if exists "demo manage invoice items" on public.invoice_items;
drop policy if exists "demo manage payments" on public.payments;

-- Aucun accès direct aux données métier n'est conservé pour anon.
revoke all privileges on table public.organizations from anon;
revoke all privileges on table public.organization_members from anon;
revoke all privileges on table public.customers from anon;
revoke all privileges on table public.quotes from anon;
revoke all privileges on table public.quote_items from anon;
revoke all privileges on table public.invoices from anon;
revoke all privileges on table public.invoice_items from anon;
revoke all privileges on table public.payments from anon;
revoke all privileges on table public.audit_log from anon;

-- Les RPC documentaires ne sont plus exécutables sans session authentifiée.
revoke execute on function public.save_quote_document(uuid, uuid, text, public.quote_status, date, date, text, jsonb) from anon;
revoke execute on function public.save_invoice_document(uuid, uuid, uuid, public.invoice_status, date, date, text, jsonb) from anon;
revoke execute on function public.record_invoice_payment(uuid, numeric, timestamptz, text, text) from anon;
revoke execute on function public.delete_quote_document(uuid) from anon;
revoke execute on function public.delete_invoice_draft(uuid) from anon;

-- Les helpers internes ne doivent plus être accessibles au rôle anon.
revoke execute on function private.active_organization_id() from anon;
revoke execute on function private.next_document_number(uuid, text) from anon;
revoke usage on schema private from anon;
