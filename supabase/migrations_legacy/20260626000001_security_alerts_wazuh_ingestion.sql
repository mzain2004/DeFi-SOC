create table if not exists public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid references public.client_accounts(id) on delete set null,
  case_id uuid references public.security_cases(id) on delete set null,
  source text not null default 'wazuh',
  external_alert_id text,
  rule_id text,
  rule_level integer,
  rule_description text,
  agent_id text,
  agent_name text,
  agent_ip text,
  src_ip text,
  dst_ip text,
  username text,
  event_time timestamptz,
  normalized_severity text not null,
  raw_alert jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint security_alerts_source_check check (source in ('wazuh')),
  constraint security_alerts_severity_check check (normalized_severity in ('low', 'medium', 'high', 'critical'))
);

create index if not exists security_alerts_org_created_idx
  on public.security_alerts (org_id, created_at desc);

create index if not exists security_alerts_client_created_idx
  on public.security_alerts (client_id, created_at desc)
  where client_id is not null;

create index if not exists security_alerts_case_created_idx
  on public.security_alerts (case_id, created_at desc)
  where case_id is not null;

create index if not exists security_alerts_source_idx
  on public.security_alerts (source);

create index if not exists security_alerts_rule_id_idx
  on public.security_alerts (rule_id)
  where rule_id is not null;

create index if not exists security_alerts_severity_idx
  on public.security_alerts (normalized_severity);

create index if not exists security_alerts_src_ip_idx
  on public.security_alerts (src_ip)
  where src_ip is not null;

alter table public.security_alerts enable row level security;

revoke all on table public.security_alerts from anon;
revoke all on table public.security_alerts from authenticated;
grant select on table public.security_alerts to authenticated;
grant select, insert, update on table public.security_alerts to service_role;

drop policy if exists "org members can view security alerts" on public.security_alerts;
create policy "org members can view security alerts"
  on public.security_alerts
  for select
  to authenticated
  using (
    org_id in (
      select om.org_id
      from public.org_members om
      where om.user_id = (auth.jwt() ->> 'sub'::text)
    )
  );

alter table public.case_events
  drop constraint if exists case_events_type_check;

alter table public.case_events
  add constraint case_events_type_check check (event_type in (
    'case_created',
    'case_alert_linked',
    'case_investigation_linked',
    'case_execution_linked',
    'case_note_added',
    'case_status_changed',
    'case_severity_changed',
    'case_client_assigned',
    'case_client_changed',
    'case_client_removed',
    'investigation_step_created',
    'investigation_step_completed',
    'analyst_decision_recorded',
    'wazuh_alert_ingested'
  ));
