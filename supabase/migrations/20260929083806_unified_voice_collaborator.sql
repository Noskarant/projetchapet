alter table public.action_proposals drop constraint if exists action_proposals_intent_type_check;
alter table public.action_proposals add constraint action_proposals_intent_type_check
  check (intent_type in ('create_customer','create_collaborator','create_project','prepare_quote','update_project_note','prepare_supplier_order','schedule_task','prepare_invoice','mark_payment','prepare_email'));
alter table public.action_proposals drop constraint if exists action_proposals_risk_matches_intent;
alter table public.action_proposals add constraint action_proposals_risk_matches_intent check (
  case
    when intent_type in ('prepare_supplier_order','prepare_invoice','mark_payment','prepare_email') then risk_level = 'explicit_confirmation'
    when intent_type in ('create_customer','create_collaborator','create_project','prepare_quote','schedule_task') then risk_level in ('review','explicit_confirmation')
    else true
  end
);

create or replace function public.create_commercial_collaborator_from_voice(
  p_organization_id uuid,
  p_collaborator_id text,
  p_name text,
  p_role text,
  p_phone text
) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  target_org uuid;
  clean_name text := trim(coalesce(p_name, ''));
  clean_role text := trim(coalesce(p_role, ''));
  clean_phone text := trim(coalesce(p_phone, ''));
  name_parts text[];
  collaborator_initials text;
begin
  target_org := private.active_organization_id();
  if auth.uid() is null or target_org is distinct from p_organization_id
     or not private.is_org_member(p_organization_id) then
    raise exception using errcode = '42501', message = 'organisation non autorisée';
  end if;
  if length(trim(coalesce(p_collaborator_id, ''))) not between 1 and 160
     or length(clean_name) not between 1 and 240
     or length(clean_role) > 120 or length(clean_phone) > 40 then
    raise exception 'collaborateur invalide';
  end if;

  insert into public.commercial_workspace_meta (organization_id, revision, updated_by)
  values (p_organization_id, 0, auth.uid()) on conflict (organization_id) do nothing;
  perform 1 from public.commercial_workspace_meta where organization_id = p_organization_id for update;
  if exists (
    select 1 from public.commercial_collaborators
    where organization_id = p_organization_id and id = p_collaborator_id
  ) then return p_collaborator_id; end if;
  if exists (
    select 1 from public.commercial_collaborators
    where organization_id = p_organization_id and active and lower(trim(name)) = lower(clean_name)
  ) then raise exception 'collaborateur déjà existant'; end if;
  if (select count(*) from public.commercial_collaborators where organization_id = p_organization_id) >= 200 then
    raise exception 'limite de collaborateurs atteinte';
  end if;

  name_parts := regexp_split_to_array(clean_name, '\s+');
  collaborator_initials := upper(left(name_parts[1], 1) ||
    case when cardinality(name_parts) > 1 then left(name_parts[cardinality(name_parts)], 1) else '' end);
  insert into public.commercial_collaborators (organization_id, id, position, name, role, phone, initials)
  values (p_organization_id, p_collaborator_id,
    (select count(*)::integer from public.commercial_collaborators where organization_id = p_organization_id),
    clean_name, clean_role, clean_phone, collaborator_initials);
  update public.commercial_workspace_meta
    set revision = revision + 1, updated_by = auth.uid(), updated_at = now()
    where organization_id = p_organization_id;
  return p_collaborator_id;
end;
$$;
revoke all on function public.create_commercial_collaborator_from_voice(uuid,text,text,text,text) from public, anon;
grant execute on function public.create_commercial_collaborator_from_voice(uuid,text,text,text,text) to authenticated;
