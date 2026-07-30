grant usage on schema private to anon, authenticated;

create or replace function private.create_organization(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_org_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if length(trim(org_name)) < 2 then
    raise exception 'organization name is required';
  end if;

  insert into public.organizations (name)
  values (trim(org_name))
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, auth.uid(), 'owner');

  return new_org_id;
end;
$$;

create or replace function private.ensure_personal_organization()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  existing_org uuid;
  new_org uuid;
  display_name text;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select organization_id into existing_org
  from public.organization_members
  where user_id = auth.uid()
  order by created_at asc
  limit 1;

  if existing_org is not null then
    return existing_org;
  end if;

  display_name := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'company_name', ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'full_name', ''),
    split_part(coalesce(auth.jwt() ->> 'email', 'Mon entreprise'), '@', 1)
  );

  insert into public.organizations (name)
  values (display_name)
  returning id into new_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org, auth.uid(), 'owner');

  return new_org;
end;
$$;

revoke all on function private.create_organization(text) from public, anon;
revoke all on function private.ensure_personal_organization() from public, anon;
grant execute on function private.create_organization(text) to authenticated;
grant execute on function private.ensure_personal_organization() to authenticated;

create or replace function public.create_organization(org_name text)
returns uuid
language sql
security invoker
set search_path = private, public, pg_temp
as $$
  select private.create_organization(org_name);
$$;

create or replace function public.ensure_personal_organization()
returns uuid
language sql
security invoker
set search_path = private, public, pg_temp
as $$
  select private.ensure_personal_organization();
$$;

revoke all on function public.create_organization(text) from public, anon;
revoke all on function public.ensure_personal_organization() from public, anon;
grant execute on function public.create_organization(text) to authenticated;
grant execute on function public.ensure_personal_organization() to authenticated;

create or replace function private.active_organization_id()
returns uuid
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if auth.uid() is null then
    return '11111111-1111-4111-8111-111111111111'::uuid;
  end if;
  return private.ensure_personal_organization();
end;
$$;

revoke all on function private.active_organization_id() from public;
grant execute on function private.active_organization_id() to anon, authenticated;
grant execute on function private.next_document_number(uuid, text) to anon, authenticated;

alter function public.save_quote_document(uuid, uuid, text, public.quote_status, date, date, text, jsonb) security invoker;
alter function public.save_invoice_document(uuid, uuid, uuid, public.invoice_status, date, date, text, jsonb) security invoker;
alter function public.record_invoice_payment(uuid, numeric, timestamptz, text, text) security invoker;
alter function public.delete_quote_document(uuid) security invoker;
alter function public.delete_invoice_draft(uuid) security invoker;
