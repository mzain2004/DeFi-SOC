create table if not exists public.case_observables (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.security_cases(id) on delete cascade,
  observable_type text not null check (observable_type in ('ipv4', 'domain', 'url', 'sha256', 'sha1', 'md5')),
  observable_value text not null,
  value_hash text not null,
  source text not null default 'case_text',
  created_by text,
  created_at timestamptz not null default now(),
  unique (org_id, case_id, observable_type, value_hash)
);

create table if not exists public.case_osint_enrichments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.security_cases(id) on delete cascade,
  observable_id uuid not null references public.case_observables(id) on delete cascade,
  provider text not null check (provider in ('abuseipdb', 'urlhaus', 'threatfox', 'malwarebazaar')),
  mode text not null check (mode in ('fixture', 'live')),
  status text not null check (status in ('completed', 'cached', 'not_configured', 'skipped', 'error')),
  verdict text not null check (verdict in ('benign', 'suspicious', 'malicious', 'unknown')),
  risk_score integer not null default 0 check (risk_score between 0 and 100),
  confidence numeric(4,3) not null default 0 check (confidence between 0 and 1),
  summary text not null,
  indicators jsonb not null default '{}'::jsonb,
  error_code text,
  requested_by text,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.osint_provider_cache (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('abuseipdb', 'urlhaus', 'threatfox', 'malwarebazaar')),
  observable_type text not null check (observable_type in ('ipv4', 'domain', 'url', 'sha256', 'sha1', 'md5')),
  value_hash text not null,
  normalized_result jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  unique (org_id, provider, observable_type, value_hash)
);

create index if not exists case_observables_org_case_created_idx
  on public.case_observables (org_id, case_id, created_at desc);
create index if not exists case_observables_value_hash_idx
  on public.case_observables (org_id, value_hash);
create index if not exists case_osint_enrichments_org_case_created_idx
  on public.case_osint_enrichments (org_id, case_id, created_at desc);
create index if not exists case_osint_enrichments_observable_provider_idx
  on public.case_osint_enrichments (observable_id, provider, created_at desc);
create index if not exists osint_provider_cache_lookup_idx
  on public.osint_provider_cache (org_id, provider, observable_type, value_hash, expires_at);

alter table public.case_observables enable row level security;
alter table public.case_osint_enrichments enable row level security;
alter table public.osint_provider_cache enable row level security;

create policy "org members can view case observables"
  on public.case_observables for select to authenticated
  using (org_id in (select om.org_id from public.org_members om where om.user_id = (auth.jwt() ->> 'sub')));

create policy "org members can view case osint enrichments"
  on public.case_osint_enrichments for select to authenticated
  using (org_id in (select om.org_id from public.org_members om where om.user_id = (auth.jwt() ->> 'sub')));

revoke all on table public.case_observables from anon;
revoke all on table public.case_osint_enrichments from anon;
revoke all on table public.osint_provider_cache from anon;
revoke insert, update, delete, truncate, references, trigger on table public.case_observables from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.case_osint_enrichments from authenticated;
revoke all on table public.osint_provider_cache from authenticated;
grant select on table public.case_observables to authenticated;
grant select on table public.case_osint_enrichments to authenticated;
grant all on table public.case_observables to service_role;
grant all on table public.case_osint_enrichments to service_role;
grant all on table public.osint_provider_cache to service_role;
