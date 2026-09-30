-- Financial snapshots must not expose prices or allow edits from a field account.
do $$ declare r record; t text; begin
 for t in select unnest(array['customers','quotes','invoices','quote_items','invoice_items','pilot_workspace_snapshots']) loop
  for r in select policyname from pg_policies where schemaname='public' and tablename=t loop
   execute format('drop policy %I on public.%I',r.policyname,t);
  end loop;
 end loop;
end $$;
create policy "office reads customers" on public.customers for select to authenticated using(private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
create policy "office writes customers" on public.customers for all to authenticated using(private.has_org_role(organization_id,array['owner','admin','office','manager'])) with check(private.has_org_role(organization_id,array['owner','admin','office','manager']));
create policy "billing reads quotes" on public.quotes for select to authenticated using(private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
create policy "office writes quotes" on public.quotes for all to authenticated using(private.has_org_role(organization_id,array['owner','admin','office','manager'])) with check(private.has_org_role(organization_id,array['owner','admin','office','manager']));
create policy "billing reads invoices" on public.invoices for select to authenticated using(private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
create policy "office writes invoices" on public.invoices for all to authenticated using(private.has_org_role(organization_id,array['owner','admin','office','manager'])) with check(private.has_org_role(organization_id,array['owner','admin','office','manager']));
create policy "billing reads quote items" on public.quote_items for select to authenticated using(exists(select 1 from public.quotes q where q.id=quote_id and private.has_org_role(q.organization_id,array['owner','admin','office','manager','accountant'])));
create policy "office writes quote items" on public.quote_items for all to authenticated using(exists(select 1 from public.quotes q where q.id=quote_id and private.has_org_role(q.organization_id,array['owner','admin','office','manager']))) with check(exists(select 1 from public.quotes q where q.id=quote_id and private.has_org_role(q.organization_id,array['owner','admin','office','manager'])));
create policy "billing reads invoice items" on public.invoice_items for select to authenticated using(exists(select 1 from public.invoices i where i.id=invoice_id and private.has_org_role(i.organization_id,array['owner','admin','office','manager','accountant'])));
create policy "office writes invoice items" on public.invoice_items for all to authenticated using(exists(select 1 from public.invoices i where i.id=invoice_id and private.has_org_role(i.organization_id,array['owner','admin','office','manager']))) with check(exists(select 1 from public.invoices i where i.id=invoice_id and private.has_org_role(i.organization_id,array['owner','admin','office','manager'])));
create policy "billing reads snapshots" on public.pilot_workspace_snapshots for select to authenticated using(private.has_org_role(organization_id,array['owner','admin','office','manager','accountant']));
create policy "office inserts snapshots" on public.pilot_workspace_snapshots for insert to authenticated with check(private.has_org_role(organization_id,array['owner','admin','office','manager']) and (updated_by is null or updated_by=auth.uid()));
create policy "office updates snapshots" on public.pilot_workspace_snapshots for update to authenticated using(private.has_org_role(organization_id,array['owner','admin','office','manager'])) with check(private.has_org_role(organization_id,array['owner','admin','office','manager']) and (updated_by is null or updated_by=auth.uid()));
-- Existing transaction RPCs need their privileged implementation, but get explicit
-- business-role checks before any writes. Keep original ownership checks intact.
do $$ declare r record; definition text; roles text; begin
 for r in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('save_quote_document','save_invoice_document','replace_commercial_workspace','create_commercial_collaborator_from_voice','create_commercial_project_from_voice','delete_quote_document') loop
  definition := pg_get_functiondef(r.oid);
  roles := case when r.proname='create_commercial_collaborator_from_voice' then 'array[''owner'',''admin'']' else 'array[''owner'',''admin'',''office'',''manager'']' end;
  definition := regexp_replace(definition,'(?i)(\mbegin\M\s*)', E'\\1 if auth.uid() is null or not private.has_org_role(private.active_organization_id(), ' || roles || ') then raise exception using errcode = ''42501'', message = ''Droits métier insuffisants''; end if; ');
  execute definition;
  execute format('revoke all on function %s from public,anon',r.oid::regprocedure);
 end loop;
end $$;
-- Server-only session operations. Clients cannot revoke another user's sessions.
create function public.manufeo_session_active(p_session_id uuid,p_user_id uuid) returns boolean
language sql security definer set search_path='' as $$select exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id)$$;
revoke all on function public.manufeo_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.manufeo_session_active(uuid,uuid) to service_role;
create function public.manufeo_revoke_sessions(p_user_id uuid) returns void
language sql security definer set search_path='' as $$delete from auth.sessions where user_id=p_user_id$$;
revoke all on function public.manufeo_revoke_sessions(uuid) from public,anon,authenticated;
grant execute on function public.manufeo_revoke_sessions(uuid) to service_role;

-- RLS also rejects the access token of a device whose sessions were revoked.
create or replace function private.is_org_member(target_org uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=auth.uid())
 and exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id')
$$;
create or replace function private.has_org_role(target_org uuid,allowed_roles text[]) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organization_members m where m.organization_id=target_org and m.user_id=auth.uid() and m.role=any(allowed_roles))
 and exists(select 1 from auth.sessions s where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id')
$$;
create function public.manufeo_bump_commercial_revision(p_organization_id uuid) returns void
language sql security definer set search_path='' as $$
 update public.commercial_workspace_meta set revision=revision+1,updated_at=now() where organization_id=p_organization_id
$$;
revoke all on function public.manufeo_bump_commercial_revision(uuid) from public,anon,authenticated;
grant execute on function public.manufeo_bump_commercial_revision(uuid) to service_role;
