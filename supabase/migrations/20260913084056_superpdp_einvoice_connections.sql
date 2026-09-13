create table if not exists public.einvoice_provider_connections (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  provider text not null default 'superpdp' check (provider = 'superpdp'),
  access_token_ciphertext text not null,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  provider_company_id text,
  provider_company_number text,
  provider_company_name text,
  verification_status text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.einvoice_transmissions (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  local_invoice_id text not null,
  invoice_number text not null,
  provider text not null default 'superpdp' check (provider = 'superpdp'),
  provider_invoice_id text,
  external_id text not null,
  direction text not null default 'out' check (direction in ('in', 'out')),
  status text not null default 'submitted',
  submitted_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  primary key (organization_id, local_invoice_id),
  unique (organization_id, external_id),
  check (length(local_invoice_id) between 1 and 180),
  check (length(invoice_number) between 1 and 120),
  check (length(external_id) between 1 and 180),
  check (length(status) between 1 and 120)
);

alter table public.einvoice_provider_connections enable row level security;
alter table public.einvoice_transmissions enable row level security;

revoke all on table public.einvoice_provider_connections from public, anon, authenticated;
revoke all on table public.einvoice_transmissions from public, anon, authenticated;
grant select, insert, update, delete on table public.einvoice_provider_connections to service_role;
grant select, insert, update, delete on table public.einvoice_transmissions to service_role;

comment on table public.einvoice_provider_connections is
  'Connexions serveur vers une plateforme agréée de facturation électronique. Les jetons sont chiffrés côté application et ne sont jamais exposés aux clients.';
comment on column public.einvoice_provider_connections.access_token_ciphertext is
  'Jeton OAuth chiffré AES-256-GCM côté serveur.';
comment on column public.einvoice_provider_connections.refresh_token_ciphertext is
  'Refresh token OAuth chiffré AES-256-GCM côté serveur.';
comment on table public.einvoice_transmissions is
  'Journal minimal des factures transmises à une plateforme agréée. Aucun jeton ni fichier de facture n’est stocké dans cette table.';
