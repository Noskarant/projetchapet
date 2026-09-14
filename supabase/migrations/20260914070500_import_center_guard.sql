create or replace function private.enforce_import_job_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.status = 'failed' and new.status = 'importing' then
    raise exception 'failed import must be previewed again before execution';
  end if;
  if old.status in ('completed','rolled_back') and new.status = 'importing' then
    raise exception 'completed import cannot be executed again';
  end if;
  return new;
end;
$$;

drop trigger if exists import_jobs_enforce_transition on public.import_jobs;
create trigger import_jobs_enforce_transition
before update of status on public.import_jobs
for each row execute function private.enforce_import_job_transition();
