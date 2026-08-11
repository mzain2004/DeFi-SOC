create table if not exists public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text,
  display_name text,
  status text not null default 'active',
  industry text,
  region text,
  primary_contact_name text,
  primary_contact_email text,
  notes text,
  risk_level text not null default 'medium',
  metadata jsonb not null default '{}'::jsonb,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table public.client_accounts
  add constraint client_accounts_status_check
  check (status in ('active', 'onboarding', 'paused', 'archived'));

alter table public.client_accounts
  add constraint client_accounts_risk_level_check
  check (risk_level in ('low', 'medium', 'high', 'critical'));

alter table public.client_accounts
  add constraint client_accounts_id_org_unique unique (id, org_id);

create unique index if not exists client_accounts_org_slug_unique_idx
  on public.client_accounts (org_id, lower(slug))
  where slug is not null;

create index if not exists client_accounts_org_status_idx
  on public.client_accounts (org_id, status, updated_at desc);

create index if not exists client_accounts_org_risk_idx
  on public.client_accounts (org_id, risk_level, created_at desc);

alter table public.client_accounts enable row level security;

create policy "org members can view client accounts"
  on public.client_accounts
  for select
  to authenticated
  using (
    org_id in (
      select om.org_id
      from public.org_members om
      where om.user_id = (auth.jwt() ->> 'sub'::text)
    )
  );

create policy "org members can insert client accounts"
  on public.client_accounts
  for insert
  to authenticated
  with check (
    org_id in (
      select om.org_id
      from public.org_members om
      where om.user_id = (auth.jwt() ->> 'sub'::text)
    )
    and (created_by is null or created_by = (auth.jwt() ->> 'sub'::text))
  );

create policy "org members can update client accounts"
  on public.client_accounts
  for update
  to authenticated
  using (
    org_id in (
      select om.org_id
      from public.org_members om
      where om.user_id = (auth.jwt() ->> 'sub'::text)
    )
  )
  with check (
    org_id in (
      select om.org_id
      from public.org_members om
      where om.user_id = (auth.jwt() ->> 'sub'::text)
    )
  );

alter table public.security_cases
  add column if not exists client_id uuid;

alter table public.security_cases
  drop constraint if exists security_cases_client_id_org_id_fkey;

alter table public.security_cases
  add constraint security_cases_client_id_org_id_fkey
  foreign key (client_id, org_id)
  references public.client_accounts(id, org_id)
  on update cascade
  on delete restrict;

create index if not exists security_cases_org_client_idx
  on public.security_cases (org_id, client_id, updated_at desc)
  where client_id is not null;
