create table public.quote_signature_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  quote_id uuid not null references public.quotes(id) on delete cascade,
  token_hash text not null unique check (length(token_hash)=64),
  signer_email text not null check (length(signer_email) between 3 and 254),
  document_number text not null,
  document_snapshot jsonb not null,
  pdf_hash text not null check (length(pdf_hash)=64),
  storage_path text not null,
  status text not null default 'ready' check (status in ('ready','signed','revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 days',
  signed_at timestamptz,
  check (split_part(storage_path,'/',1)=organization_id::text)
);
create index quote_signature_requests_quote_idx on public.quote_signature_requests(organization_id,quote_id);
alter table public.quote_signature_requests enable row level security;
revoke all on public.quote_signature_requests from public,anon,authenticated;
grant all on public.quote_signature_requests to service_role;

alter table public.document_signatures alter column signed_by_user drop not null;
alter table public.document_signatures add column signature_request_id uuid unique references public.quote_signature_requests(id) on delete restrict;
alter table public.document_signatures add constraint signature_attribution check (signed_by_user is not null or signature_request_id is not null);

-- Only the server can read a frozen snapshot or accept a capability token.
create function public.quote_signature_snapshot(p_quote_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'quote', to_jsonb(q)-array['status','sent_at','accepted_at','updated_at','created_at'],
  'customer',jsonb_build_object('kind',c.kind,'company_name',c.company_name,'civility',c.civility,'last_name',c.last_name,'first_name',c.first_name,'addresses',c.addresses),
  'items',coalesce((select jsonb_agg(to_jsonb(i)-array['id','quote_id'] order by i.position,i.id) from public.quote_items i where i.quote_id=q.id),'[]'::jsonb),
  'discount_percent',coalesce((select m.discount_percent from public.quote_private_meta m where m.organization_id=q.organization_id and m.quote_number=q.number),0)
 ) from public.quotes q join public.customers c on c.id=q.customer_id and c.organization_id=q.organization_id where q.id=p_quote_id;
$$;
revoke all on function public.quote_signature_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.quote_signature_snapshot(uuid) to service_role;

create function public.accept_quote_signature(p_token_hash text,p_signer_name text,p_ip_hash text,p_user_agent text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare r public.quote_signature_requests; q public.quotes; signature_id uuid;
begin
 select * into r from public.quote_signature_requests where token_hash=p_token_hash for update;
 if not found then raise exception 'signature_link_invalid'; end if;
 if r.status='signed' then
  select id into signature_id from public.document_signatures where signature_request_id=r.id;
  return signature_id;
 end if;
 if r.status<>'ready' or r.expires_at<=now() then raise exception 'signature_link_expired'; end if;
 select * into q from public.quotes where id=r.quote_id and organization_id=r.organization_id for update;
 if not found or q.status not in ('draft','sent') then raise exception 'quote_not_signable'; end if;
 perform 1 from public.quote_items where quote_id=q.id for share;
 perform 1 from public.customers where id=q.customer_id for share;
 perform 1 from public.quote_private_meta where organization_id=q.organization_id and quote_number=q.number for share;
 if public.quote_signature_snapshot(q.id) is distinct from r.document_snapshot then raise exception 'quote_changed'; end if;
 insert into public.document_signatures(organization_id,document_kind,document_number,signer_name,signer_email,consent_text,document_hash,ip_hash,user_agent,signed_by_user,signature_request_id)
 values(r.organization_id,'quote',r.document_number,p_signer_name,r.signer_email,
  'Je confirme avoir lu le devis '||r.document_number||', en accepter le contenu et donner mon bon pour accord par signature électronique.',
  r.pdf_hash,p_ip_hash,left(p_user_agent,500),null,r.id) returning id into signature_id;
 update public.quotes set status='accepted',accepted_at=now() where id=q.id;
 update public.quote_signature_requests set status='signed',signed_at=now() where id=r.id;
 return signature_id;
end $$;
revoke all on function public.accept_quote_signature(text,text,text,text) from public,anon,authenticated;
grant execute on function public.accept_quote_signature(text,text,text,text) to service_role;
