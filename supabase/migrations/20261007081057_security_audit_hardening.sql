-- Security audit: direct Data API access must enforce the same authority as the UI.
begin;
create or replace function private.request_session_active()
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id'
 and (s.not_after is null or s.not_after>now()) and u.deleted_at is null
 and (u.banned_until is null or u.banned_until<=now()));
$$;
revoke all on function private.request_session_active() from public, anon;
grant execute on function private.request_session_active() to authenticated;

CREATE OR REPLACE FUNCTION private.is_org_member(target_org uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=auth.uid())
 and private.request_session_active()
$function$
;

CREATE OR REPLACE FUNCTION private.has_org_role(target_org uuid, allowed_roles text[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=auth.uid() and m.role=any(allowed_roles))
 and private.request_session_active()
$function$
;

CREATE OR REPLACE FUNCTION private.create_organization(org_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  new_org_id uuid;
begin
  if auth.uid() is null or not private.request_session_active() then
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
$function$
;

CREATE OR REPLACE FUNCTION private.ensure_personal_organization()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  existing_org uuid;
  new_org uuid;
  display_name text;
  invited record;
  login_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
begin
  if auth.uid() is null or not private.request_session_active() then
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

  if login_email <> '' then
    select id, organization_id, role into invited
    from public.organization_invitations
    where lower(email) = login_email and status = 'pending'
    order by created_at asc
    limit 1
    for update skip locked;

    if invited.id is not null then
      insert into public.organization_members (organization_id, user_id, role)
      values (invited.organization_id, auth.uid(), invited.role)
      on conflict (organization_id, user_id) do update set role = excluded.role;

      update public.organization_invitations
      set status = 'accepted', accepted_by = auth.uid(), accepted_at = now(), updated_at = now()
      where id = invited.id;

      return invited.organization_id;
    end if;
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
$function$
;

create or replace function public.manufeo_session_active(p_session_id uuid,p_user_id uuid)
returns boolean language sql security definer set search_path = '' as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id
 where s.id=p_session_id and s.user_id=p_user_id and (s.not_after is null or s.not_after>now())
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()));
$$;
create or replace function private.guard_membership_authority()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare actor_role text; target_org uuid;
begin
  -- Trusted provisioning functions and server-only administration remain available.
  if current_user in ('postgres','service_role','supabase_admin') then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;
  target_org := case when TG_OP = 'INSERT' then NEW.organization_id else OLD.organization_id end;
  select role into actor_role from public.organization_members
    where organization_id = target_org and user_id = auth.uid();
  if TG_OP = 'UPDATE' and (NEW.organization_id is distinct from OLD.organization_id or NEW.user_id is distinct from OLD.user_id) then
    raise exception using errcode='42501', message='Membership identity is immutable';
  end if;
  if TG_OP <> 'INSERT' and (OLD.role = 'owner' or OLD.user_id = auth.uid()) then
    raise exception using errcode='42501', message='Owner and own membership cannot be changed';
  end if;
  if TG_OP <> 'DELETE' and NEW.role = 'owner' then
    raise exception using errcode='42501', message='Owner provisioning requires trusted administration';
  end if;
  if actor_role = 'admin' and ((TG_OP <> 'INSERT' and OLD.role = 'admin') or (TG_OP <> 'DELETE' and NEW.role = 'admin')) then
    raise exception using errcode='42501', message='Only owners manage administrators';
  end if;
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end $$;
revoke all on function private.guard_membership_authority() from public, anon, authenticated;
create trigger guard_membership_authority before insert or update or delete on public.organization_members
for each row execute function private.guard_membership_authority();

create or replace function private.can_access_project(target_org uuid, target_project text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_org_role(target_org,array['owner','admin','office','manager'])
    or (private.has_org_role(target_org,array['worker']) and exists (
      select 1 from public.commercial_project_members pm
      join public.artisan_workflow_records contact
        on contact.organization_id=pm.organization_id and contact.id=pm.collaborator_id and contact.kind='collaborator_contact'
      join auth.users u on u.id=auth.uid()
      where pm.organization_id=target_org and pm.project_id=target_project
        and lower(trim(contact.payload->>'email'))=lower(u.email)
    ));
$$;
revoke all on function private.can_access_project(uuid,text) from public, anon;
grant execute on function private.can_access_project(uuid,text) to authenticated;

-- Field workers use the sanitized, assignment-scoped server API. Raw commercial
-- rows include document references and unrelated team information.
alter policy "members read commercial activity" on public.commercial_activity_events using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
alter policy "members read commercial collaborators" on public.commercial_collaborators using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
alter policy "members read commercial projects" on public.commercial_projects using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
alter policy "members read commercial project members" on public.commercial_project_members using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
alter policy "members read commercial project photos" on public.commercial_project_photos using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
alter policy "members read commercial project steps" on public.commercial_project_steps using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
alter policy "members read commercial project issues" on public.commercial_project_issues using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
alter policy "members read commercial workspace meta" on public.commercial_workspace_meta using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
alter policy "members read supplier orders" on public.supplier_orders using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
alter policy "members read voice email deliveries" on public.voice_email_deliveries using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
alter policy "members read action proposals" on public.action_proposals using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
alter policy "members read project notes" on public.project_notes using (private.can_access_project(organization_id,project_id));
alter policy "members create project notes" on public.project_notes with check (private.can_access_project(organization_id,project_id) and created_by=auth.uid());
alter policy "authors update project notes" on public.project_notes
 using (private.can_access_project(organization_id,project_id) and (created_by=auth.uid() or private.has_org_role(organization_id,array['owner','admin','manager'])))
 with check (private.can_access_project(organization_id,project_id) and (created_by=auth.uid() or private.has_org_role(organization_id,array['owner','admin','manager'])));
alter policy "authors delete project notes" on public.project_notes
 using (private.can_access_project(organization_id,project_id) and (created_by=auth.uid() or private.has_org_role(organization_id,array['owner','admin','manager'])));
alter policy "members read project note attachments" on public.project_note_attachments using (private.can_access_project(organization_id,project_id));

-- Atomic fixed-window counters, accessible only to the server, without request bodies.
create table private.ai_request_counters (
 scope text not null, window_start timestamptz not null, requests integer not null,
 primary key(scope,window_start)
);
revoke all on private.ai_request_counters from public, anon, authenticated;
alter table private.ai_request_counters enable row level security;
create or replace function public.manufeo_consume_ai_quota(p_user_id uuid,p_organization_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare user_count integer; org_count integer;
begin
 if not exists(select 1 from public.organization_members where user_id=p_user_id and organization_id=p_organization_id) then return false; end if;
 insert into private.ai_request_counters(scope,window_start,requests)
 values ('user:'||p_user_id::text,date_trunc('minute',now()),1)
 on conflict(scope,window_start) do update set requests=private.ai_request_counters.requests+1
 returning requests into user_count;
 if user_count>120 then return false; end if;
 insert into private.ai_request_counters(scope,window_start,requests)
 values ('org:'||p_organization_id::text,date_trunc('day',now()),1)
 on conflict(scope,window_start) do update set requests=private.ai_request_counters.requests+1
 returning requests into org_count;
 delete from private.ai_request_counters where window_start<now()-interval '2 days';
 return org_count<=2000;
end $$;
revoke all on function public.manufeo_consume_ai_quota(uuid,uuid) from public, anon, authenticated;
grant execute on function public.manufeo_consume_ai_quota(uuid,uuid) to service_role;
-- Invitation roles must not provide an alternative path around membership controls.
alter policy "admins manage organization invitations" on public.organization_invitations
 using (private.has_org_role(organization_id,array['owner']) or (role<>'admin' and private.has_org_role(organization_id,array['admin'])))
 with check (private.has_org_role(organization_id,array['owner']) or (role<>'admin' and private.has_org_role(organization_id,array['admin'])));
alter policy "members read document signatures" on public.document_signatures
 using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));

-- Accountants can consult receipts, without recording/changing payments.
drop policy "members manage payments" on public.payments;
create policy "billing reads payments" on public.payments for select to authenticated using (
 exists(select 1 from public.invoices i where i.id=invoice_id and private.has_org_role(i.organization_id,array['owner','admin','office','manager','accountant'])));
create policy "operations manage payments" on public.payments for all to authenticated using (
 exists(select 1 from public.invoices i where i.id=invoice_id and private.has_org_role(i.organization_id,array['owner','admin','office','manager']))) with check (
 exists(select 1 from public.invoices i where i.id=invoice_id and private.has_org_role(i.organization_id,array['owner','admin','office','manager'])));

-- Raw bucket access is reserved for operations; field workers receive only
-- short-lived URLs and uploads through their assignment-scoped API.
alter policy "members read commercial project photo objects" on storage.objects
 using ((bucket_id='commercial-project-photos')
 and ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
 and private.has_org_role(((storage.foldername(name))[1])::uuid,array['owner','admin','office','manager']));
alter policy "members delete commercial project photo objects" on storage.objects
 using ((bucket_id='commercial-project-photos')
 and ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
 and private.has_org_role(((storage.foldername(name))[1])::uuid,array['owner','admin','office','manager']));
alter policy "members upload commercial project photo objects" on storage.objects
 with check ((bucket_id='commercial-project-photos')
 and ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
 and private.has_org_role(((storage.foldername(name))[1])::uuid,array['owner','admin','office','manager']));
alter policy "members update commercial project photo objects" on storage.objects
 using ((bucket_id='commercial-project-photos')
 and ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
 and private.has_org_role(((storage.foldername(name))[1])::uuid,array['owner','admin','office','manager'])) with check ((bucket_id='commercial-project-photos') and ((storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') and private.has_org_role(((storage.foldername(name))[1])::uuid,array['owner','admin','office','manager']));
-- Keep cross-organization references out of documents even through direct REST.
create or replace function private.guard_document_tenant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if TG_OP='UPDATE' and NEW.organization_id is distinct from OLD.organization_id then
  raise exception using errcode='42501',message='Document organization is immutable';
 end if;
 if not exists(select 1 from public.customers c where c.id=NEW.customer_id and c.organization_id=NEW.organization_id) then
  raise exception using errcode='42501',message='Customer outside document organization';
 end if;
 if TG_TABLE_NAME='invoices' then
  if NEW.quote_id is not null and not exists(select 1 from public.quotes q where q.id=NEW.quote_id and q.organization_id=NEW.organization_id) then
   raise exception using errcode='42501',message='Quote outside document organization';
  end if;
 end if;
 return NEW;
end $$;
revoke all on function private.guard_document_tenant() from public, anon, authenticated;
create trigger guard_quote_tenant before insert or update of organization_id,customer_id on public.quotes
 for each row execute function private.guard_document_tenant();
create trigger guard_invoice_tenant before insert or update of organization_id,customer_id,quote_id on public.invoices
 for each row execute function private.guard_document_tenant();
alter policy "members read audit log" on public.audit_log
 using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
alter policy "members read catalog items" on public.catalog_items
 using (private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
create index ai_request_counters_window_idx on private.ai_request_counters(window_start);
alter policy "members create own action proposals" on public.action_proposals
 with check (private.has_org_role(organization_id,array['owner','admin','office','manager']) and created_by=auth.uid()
 and status in ('draft','needs_input','ready') and confirmed_by is null and confirmed_at is null and executed_at is null and execution_result='{}'::jsonb);
alter policy "members execute action proposals" on public.action_proposals
 using (private.has_org_role(organization_id,array['owner','admin','office','manager']) and (created_by=auth.uid() or private.has_org_role(organization_id,array['owner','admin'])) and status in ('ready','confirmed'))
 with check (private.has_org_role(organization_id,array['owner','admin','office','manager']) and (created_by=auth.uid() or private.has_org_role(organization_id,array['owner','admin'])) and status in ('confirmed','executed','failed'));
commit;
