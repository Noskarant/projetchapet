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

alter table public.einvoice_provider_connections enable row level security;

revoke all on table public.einvoice_provider_connections from public, anon, authenticated;
grant select, insert, update, delete on table public.einvoice_provider_connections to service_role;

comment on table public.einvoice_provider_connections is
  'Connexions serveur vers une plateforme agréée de facturation électronique. Les jetons sont chiffrés côté application et ne sont jamais exposés aux clients.';
comment on column public.einvoice_provider_connections.access_token_ciphertext is
  'Jeton OAuth chiffré AES-256-GCM côté serveur.';
comment on column public.einvoice_provider_connections.refresh_token_ciphertext is
  'Refresh token OAuth chiffré AES-256-GCM côté serveur.';
