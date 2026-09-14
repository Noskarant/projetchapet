create table if not exists public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  label text not null check (length(trim(label)) between 1 and 300),
  description text,
  unit text,
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  cost_price numeric(12,2) check (cost_price is null or cost_price >= 0),
  tax_rate numeric(5,2) not null default 20 check (tax_rate between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists catalog_items_org_label_idx
  on public.catalog_items (organization_id, lower(label));

alter table public.catalog_items enable row level security;

drop policy if exists "members read catalog items" on public.catalog_items;
create policy "members read catalog items" on public.catalog_items for select to authenticated
using (private.is_org_member(organization_id));

drop policy if exists "admins manage catalog items" on public.catalog_items;
create policy "admins manage catalog items" on public.catalog_items for all to authenticated
using (private.has_org_role(organization_id, array['owner','admin','office']))
with check (private.has_org_role(organization_id, array['owner','admin','office']));

revoke all on table public.catalog_items from anon;
revoke all on table public.catalog_items from authenticated;
revoke all on table public.catalog_items from service_role;
grant select, insert, update, delete on table public.catalog_items to authenticated;
grant all on table public.catalog_items to service_role;

alter table public.import_jobs drop constraint if exists import_jobs_status_check;
alter table public.import_jobs add constraint import_jobs_status_check
  check (status in ('preview','ready','importing','completed','failed','cancelled','rolled_back','rollback_partial'));

alter table public.import_staging_rows drop constraint if exists import_staging_rows_status_check;
alter table public.import_staging_rows add constraint import_staging_rows_status_check
  check (status in ('valid','invalid','duplicate','imported','skipped','rolled_back','rollback_blocked'));

create or replace function public.commit_import_job(
  p_job_id uuid,
  p_actor uuid,
  p_duplicate_strategy text default 'skip'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  j public.import_jobs%rowtype;
  r public.import_staging_rows%rowtype;
  target uuid;
  imported_count integer := 0;
  skipped_count integer := 0;
  source_duplicate_count integer := 0;
  expected_address jsonb;
  source_key text;
begin
  if p_duplicate_strategy not in ('skip','create') then
    raise exception 'invalid duplicate strategy';
  end if;

  select * into j
  from public.import_jobs
  where id = p_job_id
  for update;

  if not found then raise exception 'import job not found'; end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = j.organization_id
      and user_id = p_actor
      and role in ('owner','admin')
  ) then
    raise exception 'import job forbidden';
  end if;
  if j.status not in ('preview','failed') then
    raise exception 'import job is not executable';
  end if;
  if j.entity_type not in ('customers','catalog') then
    raise exception 'unsupported import entity type';
  end if;

  update public.import_jobs
  set status = 'importing', error_message = null, updated_at = now()
  where id = j.id;

  for r in
    select * from public.import_staging_rows
    where job_id = j.id and organization_id = j.organization_id
    order by row_index
    for update
  loop
    if r.status = 'invalid' then
      update public.import_staging_rows set status = 'skipped' where id = r.id;
      skipped_count := skipped_count + 1;
      continue;
    end if;

    if r.status = 'duplicate' and p_duplicate_strategy = 'skip' then
      update public.import_staging_rows set status = 'skipped' where id = r.id;
      skipped_count := skipped_count + 1;
      continue;
    end if;

    if r.source_id is not null and btrim(r.source_id) <> '' and exists (
      select 1 from public.external_source_links
      where organization_id = j.organization_id
        and source_system = j.source_system
        and entity_type = j.entity_type
        and source_id = r.source_id
    ) then
      update public.import_staging_rows set status = 'skipped' where id = r.id;
      skipped_count := skipped_count + 1;
      source_duplicate_count := source_duplicate_count + 1;
      continue;
    end if;

    if j.entity_type = 'customers' then
      expected_address := case
        when coalesce(r.normalized_data->>'line1','') <> ''
          or coalesce(r.normalized_data->>'postal_code','') <> ''
          or coalesce(r.normalized_data->>'city','') <> ''
        then jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'label', 'Principale',
          'line1', nullif(r.normalized_data->>'line1',''),
          'postal_code', nullif(r.normalized_data->>'postal_code',''),
          'city', nullif(r.normalized_data->>'city',''),
          'country', 'France'
        )))
        else '[]'::jsonb
      end;

      insert into public.customers (
        organization_id, kind, company_name, civility, last_name, first_name,
        siret, vat_number, emails, phones, addresses, notes
      ) values (
        j.organization_id,
        case when r.normalized_data->>'kind' = 'individual' then 'individual'::public.customer_kind else 'business'::public.customer_kind end,
        nullif(r.normalized_data->>'company_name',''),
        null,
        nullif(r.normalized_data->>'last_name',''),
        nullif(r.normalized_data->>'first_name',''),
        nullif(r.normalized_data->>'siret',''),
        nullif(r.normalized_data->>'vat_number',''),
        case when coalesce(r.normalized_data->>'email','') <> '' then array[r.normalized_data->>'email'] else '{}'::text[] end,
        case when coalesce(r.normalized_data->>'phone','') <> '' then array[r.normalized_data->>'phone'] else '{}'::text[] end,
        expected_address,
        nullif(r.normalized_data->>'notes','')
      ) returning id into target;
    else
      insert into public.catalog_items (
        organization_id, label, description, unit, unit_price, cost_price, tax_rate
      ) values (
        j.organization_id,
        btrim(r.normalized_data->>'label'),
        nullif(r.normalized_data->>'description',''),
        nullif(r.normalized_data->>'unit',''),
        coalesce((r.normalized_data->>'unit_price')::numeric, 0),
        (r.normalized_data->>'cost_price')::numeric,
        coalesce((r.normalized_data->>'tax_rate')::numeric, 20)
      ) returning id into target;
    end if;

    update public.import_staging_rows
    set status = 'imported', imported_record_id = target::text
    where id = r.id;

    source_key := coalesce(nullif(btrim(r.source_id), ''), 'row:' || j.id::text || ':' || r.row_index::text);
    insert into public.external_source_links (
      organization_id, source_system, entity_type, source_id, target_id, import_job_id
    ) values (
      j.organization_id, j.source_system, j.entity_type, source_key, target::text, j.id
    );

    imported_count := imported_count + 1;
  end loop;

  update public.import_jobs
  set status = 'completed',
      committed_at = now(),
      updated_at = now(),
      counters = coalesce(counters, '{}'::jsonb) || jsonb_build_object(
        'imported', imported_count,
        'skipped', skipped_count,
        'sourceDuplicates', source_duplicate_count
      )
  where id = j.id;

  insert into public.audit_log (organization_id, user_id, entity_type, entity_id, action, payload)
  values (
    j.organization_id, p_actor, 'import_job', j.id, 'import_completed',
    jsonb_build_object('entityType', j.entity_type, 'imported', imported_count, 'skipped', skipped_count)
  );

  return jsonb_build_object(
    'jobId', j.id,
    'status', 'completed',
    'imported', imported_count,
    'skipped', skipped_count,
    'sourceDuplicates', source_duplicate_count
  );
end;
$$;

create or replace function public.rollback_import_job(
  p_job_id uuid,
  p_actor uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  j public.import_jobs%rowtype;
  r public.import_staging_rows%rowtype;
  c public.customers%rowtype;
  ci public.catalog_items%rowtype;
  target uuid;
  rolled_back_count integer := 0;
  blocked_count integer := 0;
  expected_address jsonb;
  expected_emails text[];
  expected_phones text[];
begin
  select * into j
  from public.import_jobs
  where id = p_job_id
  for update;

  if not found then raise exception 'import job not found'; end if;
  if not exists (
    select 1 from public.organization_members
    where organization_id = j.organization_id
      and user_id = p_actor
      and role in ('owner','admin')
  ) then
    raise exception 'import job forbidden';
  end if;
  if j.status not in ('completed','rollback_partial') then
    raise exception 'import job is not rollbackable';
  end if;

  for r in
    select * from public.import_staging_rows
    where job_id = j.id
      and organization_id = j.organization_id
      and status in ('imported','rollback_blocked')
    order by row_index
    for update
  loop
    if r.imported_record_id is null then
      update public.import_staging_rows set status = 'rolled_back' where id = r.id;
      rolled_back_count := rolled_back_count + 1;
      continue;
    end if;

    begin
      target := r.imported_record_id::uuid;
    exception when others then
      update public.import_staging_rows set status = 'rollback_blocked' where id = r.id;
      blocked_count := blocked_count + 1;
      continue;
    end;

    if j.entity_type = 'customers' then
      select * into c from public.customers
      where id = target and organization_id = j.organization_id;

      if not found then
        delete from public.external_source_links where import_job_id = j.id and target_id = target::text;
        update public.import_staging_rows set status = 'rolled_back' where id = r.id;
        rolled_back_count := rolled_back_count + 1;
        continue;
      end if;

      if exists (select 1 from public.quotes where organization_id = j.organization_id and customer_id = target)
        or exists (select 1 from public.invoices where organization_id = j.organization_id and customer_id = target)
        or exists (select 1 from public.commercial_projects where organization_id = j.organization_id and customer_id = target::text)
      then
        update public.import_staging_rows set status = 'rollback_blocked' where id = r.id;
        blocked_count := blocked_count + 1;
        continue;
      end if;

      expected_emails := case when coalesce(r.normalized_data->>'email','') <> '' then array[r.normalized_data->>'email'] else '{}'::text[] end;
      expected_phones := case when coalesce(r.normalized_data->>'phone','') <> '' then array[r.normalized_data->>'phone'] else '{}'::text[] end;
      expected_address := case
        when coalesce(r.normalized_data->>'line1','') <> ''
          or coalesce(r.normalized_data->>'postal_code','') <> ''
          or coalesce(r.normalized_data->>'city','') <> ''
        then jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'label', 'Principale',
          'line1', nullif(r.normalized_data->>'line1',''),
          'postal_code', nullif(r.normalized_data->>'postal_code',''),
          'city', nullif(r.normalized_data->>'city',''),
          'country', 'France'
        )))
        else '[]'::jsonb
      end;

      if c.kind::text is distinct from coalesce(nullif(r.normalized_data->>'kind',''), 'business')
        or coalesce(c.company_name,'') is distinct from coalesce(r.normalized_data->>'company_name','')
        or coalesce(c.last_name,'') is distinct from coalesce(r.normalized_data->>'last_name','')
        or coalesce(c.first_name,'') is distinct from coalesce(r.normalized_data->>'first_name','')
        or coalesce(c.siret,'') is distinct from coalesce(r.normalized_data->>'siret','')
        or coalesce(c.vat_number,'') is distinct from coalesce(r.normalized_data->>'vat_number','')
        or c.emails is distinct from expected_emails
        or c.phones is distinct from expected_phones
        or c.addresses is distinct from expected_address
        or coalesce(c.notes,'') is distinct from coalesce(r.normalized_data->>'notes','')
      then
        update public.import_staging_rows set status = 'rollback_blocked' where id = r.id;
        blocked_count := blocked_count + 1;
        continue;
      end if;

      delete from public.customers where id = target and organization_id = j.organization_id;
    elsif j.entity_type = 'catalog' then
      select * into ci from public.catalog_items
      where id = target and organization_id = j.organization_id;

      if not found then
        delete from public.external_source_links where import_job_id = j.id and target_id = target::text;
        update public.import_staging_rows set status = 'rolled_back' where id = r.id;
        rolled_back_count := rolled_back_count + 1;
        continue;
      end if;

      if ci.label is distinct from btrim(r.normalized_data->>'label')
        or coalesce(ci.description,'') is distinct from coalesce(r.normalized_data->>'description','')
        or coalesce(ci.unit,'') is distinct from coalesce(r.normalized_data->>'unit','')
        or ci.unit_price is distinct from coalesce((r.normalized_data->>'unit_price')::numeric, 0)
        or ci.cost_price is distinct from (r.normalized_data->>'cost_price')::numeric
        or ci.tax_rate is distinct from coalesce((r.normalized_data->>'tax_rate')::numeric, 20)
      then
        update public.import_staging_rows set status = 'rollback_blocked' where id = r.id;
        blocked_count := blocked_count + 1;
        continue;
      end if;

      delete from public.catalog_items where id = target and organization_id = j.organization_id;
    else
      update public.import_staging_rows set status = 'rollback_blocked' where id = r.id;
      blocked_count := blocked_count + 1;
      continue;
    end if;

    delete from public.external_source_links where import_job_id = j.id and target_id = target::text;
    update public.import_staging_rows set status = 'rolled_back' where id = r.id;
    rolled_back_count := rolled_back_count + 1;
  end loop;

  update public.import_jobs
  set status = case when blocked_count = 0 then 'rolled_back' else 'rollback_partial' end,
      updated_at = now(),
      counters = coalesce(counters, '{}'::jsonb) || jsonb_build_object(
        'rolledBack', rolled_back_count,
        'rollbackBlocked', blocked_count
      )
  where id = j.id;

  insert into public.audit_log (organization_id, user_id, entity_type, entity_id, action, payload)
  values (
    j.organization_id, p_actor, 'import_job', j.id,
    case when blocked_count = 0 then 'import_rolled_back' else 'import_rollback_partial' end,
    jsonb_build_object('rolledBack', rolled_back_count, 'blocked', blocked_count)
  );

  return jsonb_build_object(
    'jobId', j.id,
    'status', case when blocked_count = 0 then 'rolled_back' else 'rollback_partial' end,
    'rolledBack', rolled_back_count,
    'blocked', blocked_count
  );
end;
$$;

revoke all on function public.commit_import_job(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.rollback_import_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.commit_import_job(uuid, uuid, text) to service_role;
grant execute on function public.rollback_import_job(uuid, uuid) to service_role;
