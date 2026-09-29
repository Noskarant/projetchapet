alter table public.action_proposals drop constraint if exists action_proposals_intent_type_check;
alter table public.action_proposals add constraint action_proposals_intent_type_check
  check (intent_type in ('create_customer','create_project','prepare_quote','update_project_note','prepare_supplier_order','schedule_task','prepare_invoice','mark_payment','prepare_email'));
alter table public.action_proposals drop constraint if exists action_proposals_risk_matches_intent;
alter table public.action_proposals add constraint action_proposals_risk_matches_intent check (
  case
    when intent_type in ('prepare_supplier_order','prepare_invoice','mark_payment','prepare_email') then risk_level = 'explicit_confirmation'
    when intent_type in ('create_customer','create_project','prepare_quote','schedule_task') then risk_level in ('review','explicit_confirmation')
    else true
  end
);

-- One transaction creates the project, its members, activity and workspace revision.
create or replace function public.create_commercial_project_from_voice(
  p_organization_id uuid,
  p_project_id text,
  p_name text,
  p_subtitle text,
  p_customer_id text,
  p_quote_id text,
  p_address text,
  p_start_date date,
  p_next_visit date,
  p_collaborator_ids text[]
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  target_org uuid;
  member_id text;
  position_index integer := 0;
begin
  target_org := private.active_organization_id();
  if auth.uid() is null or target_org is distinct from p_organization_id
     or not private.is_org_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'organisation non autorisée';
  end if;
  if length(trim(coalesce(p_project_id, ''))) not between 1 and 160
     or length(trim(coalesce(p_name, ''))) not between 1 and 300
     or length(coalesce(p_subtitle, '')) > 500
     or length(coalesce(p_address, '')) > 320
     or cardinality(coalesce(p_collaborator_ids, array[]::text[])) > 20 then
    raise exception 'chantier invalide';
  end if;
  if nullif(p_customer_id, '') is not null and not exists (
    select 1 from public.customers where organization_id = p_organization_id and id::text = p_customer_id
  ) then raise exception 'client introuvable'; end if;
  if nullif(p_quote_id, '') is not null and not exists (
    select 1 from public.quotes where organization_id = p_organization_id and id::text = p_quote_id
  ) then raise exception 'devis introuvable'; end if;
  if nullif(p_quote_id, '') is not null and nullif(p_customer_id, '') is null then
    select customer_id::text into p_customer_id from public.quotes
      where organization_id = p_organization_id and id::text = p_quote_id;
  end if;
  if exists (
    select 1 from unnest(coalesce(p_collaborator_ids, array[]::text[])) as member(id)
    where not exists (
      select 1 from public.commercial_collaborators c
      where c.organization_id = p_organization_id and c.id = member.id and c.active
    )
  ) then raise exception 'collaborateur introuvable'; end if;

  insert into public.commercial_workspace_meta (organization_id, revision, updated_by)
  values (p_organization_id, 0, auth.uid()) on conflict (organization_id) do nothing;
  perform 1 from public.commercial_workspace_meta where organization_id = p_organization_id for update;
  if exists (select 1 from public.commercial_projects where organization_id = p_organization_id and id = p_project_id) then
    return p_project_id;
  end if;
  if (select count(*) from public.commercial_projects where organization_id = p_organization_id) >= 500 then
    raise exception 'limite de chantiers atteinte';
  end if;
  insert into public.commercial_projects
    (organization_id,id,position,name,subtitle,customer_id,quote_id,address,status,start_date,next_visit)
  values (p_organization_id,p_project_id,
    (select count(*)::integer from public.commercial_projects where organization_id = p_organization_id),
    trim(p_name),coalesce(p_subtitle,''),coalesce(p_customer_id,''),nullif(p_quote_id,''),
    coalesce(p_address,''),'À planifier',p_start_date,p_next_visit);
  for member_id in select distinct id from unnest(coalesce(p_collaborator_ids, array[]::text[])) as m(id) loop
    insert into public.commercial_project_members (organization_id,project_id,collaborator_id,position)
    values (p_organization_id,p_project_id,member_id,position_index);
    position_index := position_index + 1;
  end loop;
  insert into public.commercial_activity_events (organization_id,id,position,kind,message,project_id)
  values (p_organization_id,'activity-' || p_project_id,
    (select count(*)::integer from public.commercial_activity_events where organization_id = p_organization_id),
    'chantier','Chantier « ' || trim(p_name) || ' » créé par MANUFEO.',p_project_id);
  update public.commercial_workspace_meta
    set revision = revision + 1, updated_by = auth.uid(), updated_at = now()
    where organization_id = p_organization_id;
  return p_project_id;
end;
$$;
revoke all on function public.create_commercial_project_from_voice(uuid,text,text,text,text,text,text,date,date,text[]) from public, anon;
grant execute on function public.create_commercial_project_from_voice(uuid,text,text,text,text,text,text,date,date,text[]) to authenticated;
