create index if not exists action_proposals_created_by_idx on public.action_proposals (created_by);
create index if not exists action_proposals_confirmed_by_idx on public.action_proposals (confirmed_by);
create index if not exists import_jobs_created_by_idx on public.import_jobs (created_by);
create index if not exists import_staging_rows_job_org_idx on public.import_staging_rows (job_id, organization_id);
create index if not exists import_staging_rows_org_idx on public.import_staging_rows (organization_id);
create index if not exists external_source_links_job_org_idx on public.external_source_links (import_job_id, organization_id);

drop policy if exists "members create own action proposals" on public.action_proposals;
create policy "members create own action proposals" on public.action_proposals for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and created_by = (select auth.uid())
  and status in ('draft','needs_input','ready')
  and confirmed_by is null
  and confirmed_at is null
  and executed_at is null
  and execution_result = '{}'::jsonb
);

drop policy if exists "admins create import jobs" on public.import_jobs;
create policy "admins create import jobs" on public.import_jobs for insert to authenticated
with check (
  private.has_org_role(organization_id, array['owner','admin'])
  and created_by = (select auth.uid())
  and status = 'preview'
  and committed_at is null
  and error_message is null
);
