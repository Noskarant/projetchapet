drop policy if exists "members execute action proposals" on public.action_proposals;
create policy "members execute action proposals"
on public.action_proposals
for update
to authenticated
using (
  private.is_org_member(organization_id)
  and (created_by = (select auth.uid()) or private.has_org_role(organization_id, array['owner','admin']))
  and status in ('ready','confirmed')
)
with check (
  private.is_org_member(organization_id)
  and (created_by = (select auth.uid()) or private.has_org_role(organization_id, array['owner','admin']))
  and status in ('confirmed','executed','failed')
);

grant update on table public.action_proposals to authenticated;

create or replace function private.enforce_action_proposal_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if new.organization_id is distinct from old.organization_id
    or new.created_by is distinct from old.created_by
    or new.source_type is distinct from old.source_type
    or new.source_reference is distinct from old.source_reference
    or new.raw_text is distinct from old.raw_text
    or new.intent_type is distinct from old.intent_type
    or new.payload is distinct from old.payload
    or new.risk_level is distinct from old.risk_level
    or new.confidence is distinct from old.confidence
    or new.warnings is distinct from old.warnings
    or new.missing_fields is distinct from old.missing_fields
    or new.created_at is distinct from old.created_at then
    raise exception 'action proposal execution fields are immutable';
  end if;

  if old.status = 'ready' and new.status = 'confirmed' then
    if jsonb_array_length(old.missing_fields) > 0 then
      raise exception 'action proposal still has missing fields';
    end if;
    if new.confirmed_by is distinct from auth.uid() or new.confirmed_at is null then
      raise exception 'confirmation must be attributed to current user';
    end if;
    if new.executed_at is not null or new.execution_result <> '{}'::jsonb then
      raise exception 'confirmed action cannot already contain an execution result';
    end if;
    return new;
  end if;

  if old.status = 'confirmed' and new.status in ('executed','failed') then
    if old.confirmed_by is distinct from auth.uid()
      or new.confirmed_by is distinct from old.confirmed_by
      or new.confirmed_at is distinct from old.confirmed_at then
      raise exception 'only the confirming user can finish this action';
    end if;
    if jsonb_typeof(new.execution_result) <> 'object' or new.execution_result = '{}'::jsonb then
      raise exception 'execution result required';
    end if;
    if new.status = 'executed' and new.executed_at is null then
      raise exception 'executed_at required';
    end if;
    if new.status = 'failed' and new.executed_at is not null then
      raise exception 'failed action cannot be marked executed';
    end if;
    return new;
  end if;

  raise exception 'invalid action proposal status transition: % -> %', old.status, new.status;
end;
$$;

revoke all on function private.enforce_action_proposal_transition() from public, anon, authenticated;

drop trigger if exists action_proposals_enforce_transition on public.action_proposals;
create trigger action_proposals_enforce_transition
before update on public.action_proposals
for each row execute function private.enforce_action_proposal_transition();

create or replace function private.audit_action_proposal_execution()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result_entity_id uuid;
  raw_entity_id text := nullif(new.execution_result ->> 'entityId', '');
begin
  if old.status = 'confirmed' and new.status = 'executed' then
    if raw_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      result_entity_id := raw_entity_id::uuid;
    end if;

    insert into public.audit_log (
      organization_id,
      user_id,
      entity_type,
      entity_id,
      action,
      payload
    ) values (
      new.organization_id,
      new.confirmed_by,
      coalesce(nullif(new.execution_result ->> 'entityType', ''), 'action'),
      result_entity_id,
      'ai_' || new.intent_type || '_executed',
      jsonb_build_object(
        'proposal_id', new.id,
        'source_type', new.source_type,
        'result', new.execution_result
      )
    );
  end if;
  return new;
end;
$$;

revoke all on function private.audit_action_proposal_execution() from public, anon, authenticated;

drop trigger if exists action_proposals_audit_execution on public.action_proposals;
create trigger action_proposals_audit_execution
after update on public.action_proposals
for each row execute function private.audit_action_proposal_execution();
