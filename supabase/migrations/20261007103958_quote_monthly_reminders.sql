-- The dispatch journal is writable only by the cron service; organization members may inspect it.
create table public.quote_reminder_dispatches (
  quote_id uuid primary key references public.quotes(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  status text not null check (status in ('sending','sent','failed','uncertain','cancelled')),
  payload jsonb not null,
  attempts integer not null default 1 check (attempts between 1 and 3),
  next_attempt_at timestamptz,
  provider_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'sent' or (provider_id is not null and sent_at is not null))
);
create index quote_reminder_dispatches_organization_idx on public.quote_reminder_dispatches(organization_id);
alter table public.quote_reminder_dispatches enable row level security;
revoke all on public.quote_reminder_dispatches from anon, authenticated;
grant select on public.quote_reminder_dispatches to authenticated;
grant select,insert,update,delete on public.quote_reminder_dispatches to service_role;
create policy "members read quote reminders" on public.quote_reminder_dispatches
for select to authenticated using (exists (
  select 1 from public.organization_members m
  where m.organization_id=quote_reminder_dispatches.organization_id and m.user_id=(select auth.uid())
));

create or replace function public.due_quote_reminders(p_now timestamptz default now())
returns setof public.quotes language sql stable security invoker set search_path='' as $$
  select q.* from public.quotes q
  join public.pilot_workspace_snapshots s on s.organization_id=q.organization_id
  where s.company_profile->>'automaticQuoteReminderEnabled'='true'
    and q.status='sent' and q.sent_at is not null
    and q.sent_at + interval '1 month' <= p_now
    and q.archived_at is null and q.accepted_at is null and q.signed_at is null
    and not exists (select 1 from public.invoices i where i.quote_id=q.id and i.status<>'cancelled')
    and not exists (select 1 from public.quote_reminder_dispatches d where d.quote_id=q.id
      and (d.status<>'failed' or d.attempts>=3 or d.next_attempt_at>p_now))
  order by q.sent_at,q.id limit 50;
$$;
revoke all on function public.due_quote_reminders(timestamptz) from public,anon,authenticated;
grant execute on function public.due_quote_reminders(timestamptz) to service_role;
