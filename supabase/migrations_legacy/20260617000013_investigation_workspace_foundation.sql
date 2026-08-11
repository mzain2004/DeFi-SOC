create table if not exists public.investigation_steps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.security_cases(id) on delete cascade,
  investigation_id uuid references public.alert_investigations(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'open',
  step_type text not null default 'manual',
  assigned_to text,
  created_by text,
  completed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table public.investigation_steps
  add constraint investigation_steps_status_check
  check (status in ('open', 'in_progress', 'completed', 'skipped', 'blocked'));

alter table public.investigation_steps
  add constraint investigation_steps_step_type_check
  check (step_type in ('manual', 'evidence_review', 'containment_review', 'ai_recommendation_review', 'false_positive_check', 'escalation_check'));

create index if not exists investigation_steps_org_case_created_idx
  on public.investigation_steps (org_id, case_id, created_at desc);

create index if not exists investigation_steps_org_investigation_created_idx
  on public.investigation_steps (org_id, investigation_id, created_at desc)
  where investigation_id is not null;

alter table public.investigation_steps enable row level security;

create policy "org members can view investigation steps"
  on public.investigation_steps
  for select
  to authenticated
  using (
    org_id in (
      select om.org_id
      from public.org_members om
      where om.user_id = (auth.jwt() ->> 'sub'::text)
    )
  );

create policy "org members can insert investigation steps"
  on public.investigation_steps
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

create policy "org members can update investigation steps"
  on public.investigation_steps
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

create table if not exists public.analyst_decisions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  case_id uuid not null references public.security_cases(id) on delete cascade,
  investigation_id uuid references public.alert_investigations(id) on delete set null,
  decision text not null,
  rationale text,
  confidence text,
  created_by text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.analyst_decisions
  add constraint analyst_decisions_decision_check
  check (decision in ('true_positive', 'false_positive', 'needs_more_info', 'escalate_l3', 'containment_recommended', 'containment_not_recommended', 'resolved'));

create index if not exists analyst_decisions_org_case_created_idx
  on public.analyst_decisions (org_id, case_id, created_at desc);

create index if not exists analyst_decisions_org_investigation_created_idx
  on public.analyst_decisions (org_id, investigation_id, created_at desc)
  where investigation_id is not null;

alter table public.analyst_decisions enable row level security;

create policy "org members can view analyst decisions"
  on public.analyst_decisions
  for select
  to authenticated
  using (
    org_id in (
      select om.org_id
      from public.org_members om
      where om.user_id = (auth.jwt() ->> 'sub'::text)
    )
  );

create policy "org members can insert analyst decisions"
  on public.analyst_decisions
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
    'analyst_decision_recorded'
  ));
