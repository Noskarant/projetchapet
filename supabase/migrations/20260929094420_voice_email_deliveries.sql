create table if not exists public.voice_email_deliveries (
  proposal_id uuid primary key references public.action_proposals(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  sent_by uuid not null references auth.users(id) on delete restrict,
  recipient text not null check (length(trim(recipient)) between 3 and 254),
  subject text not null check (length(trim(subject)) between 1 and 998),
  body text not null check (length(trim(body)) between 1 and 6000),
  status text not null check (status in ('sending', 'failed', 'sent')),
  provider_id text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'sent' or (provider_id is not null and sent_at is not null))
);

create index if not exists voice_email_deliveries_org_idx on public.voice_email_deliveries (organization_id, created_at desc);
alter table public.voice_email_deliveries enable row level security;

create policy "members read voice email deliveries"
on public.voice_email_deliveries for select to authenticated
using (private.is_org_member(organization_id));

create policy "members start own executed voice email"
on public.voice_email_deliveries for insert to authenticated
with check (
  private.is_org_member(organization_id)
  and sent_by = (select auth.uid())
  and status = 'sending' and provider_id is null and sent_at is null
  and exists (
    select 1 from public.action_proposals proposal
    where proposal.id = proposal_id
      and proposal.organization_id = voice_email_deliveries.organization_id
      and proposal.intent_type = 'prepare_email'
      and proposal.status = 'executed'
  )
);

create policy "sender finalizes voice email delivery"
on public.voice_email_deliveries for update to authenticated
using (private.is_org_member(organization_id) and sent_by = (select auth.uid()) and status in ('sending', 'failed'))
with check (private.is_org_member(organization_id) and sent_by = (select auth.uid()) and status in ('sending', 'failed', 'sent'));

revoke all on public.voice_email_deliveries from anon;
grant select, insert, update on public.voice_email_deliveries to authenticated;
