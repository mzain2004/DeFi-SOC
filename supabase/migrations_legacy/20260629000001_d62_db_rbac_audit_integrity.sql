-- D62 DB/RBAC parity and audit log integrity.
--
-- Sensitive case, client, investigation, invite, and audit mutations are
-- server-only. App routes perform Clerk auth + capability checks, then write
-- through the service-role Supabase client. Normal authenticated Data API
-- access remains read-only where existing SELECT RLS policies allow it.

do $$
declare
  sensitive_table text;
  sensitive_tables text[] := array[
    'audit_logs',
    'security_cases',
    'case_events',
    'case_notes',
    'case_alert_links',
    'case_report_links',
    'case_execution_links',
    'case_investigation_links',
    'client_accounts',
    'investigation_steps',
    'analyst_decisions',
    'workspace_invites',
    'security_alerts'
  ];
begin
  foreach sensitive_table in array sensitive_tables loop
    if to_regclass(format('public.%I', sensitive_table)) is not null then
      execute format('alter table public.%I enable row level security', sensitive_table);
      execute format('revoke insert, update, delete, truncate, references, trigger on table public.%I from authenticated', sensitive_table);
      execute format('revoke all on table public.%I from anon', sensitive_table);
      execute format('grant select, insert, update, delete on table public.%I to service_role', sensitive_table);
    end if;
  end loop;
end $$;

do $$
begin
  if to_regclass('public.audit_logs') is not null then
    drop policy if exists "org members can insert audit logs" on public.audit_logs;
    comment on table public.audit_logs is
      'D62: audit log writes are server-only via service-role app/API paths after Clerk RBAC. Authenticated Data API users may read org-scoped rows but cannot insert, update, or delete.';
  end if;

  if to_regclass('public.security_cases') is not null then
    drop policy if exists "org members can insert security cases" on public.security_cases;
    drop policy if exists "org members can update security cases" on public.security_cases;
    comment on table public.security_cases is
      'D62: case mutations are server-only through Clerk RBAC routes or trusted ingest paths; authenticated Data API access is read-only under RLS.';
  end if;

  if to_regclass('public.case_events') is not null then
    drop policy if exists "org members can insert case events" on public.case_events;
    comment on table public.case_events is
      'D62: case timeline events are written only by server-side activity logging after app authorization.';
  end if;

  if to_regclass('public.case_notes') is not null then
    drop policy if exists "org members can insert case notes" on public.case_notes;
    drop policy if exists "org members can update case notes" on public.case_notes;
    comment on table public.case_notes is
      'D62: note mutations are server-only through Clerk RBAC routes; authenticated Data API access is read-only under RLS.';
  end if;

  if to_regclass('public.case_alert_links') is not null then
    drop policy if exists "org members can insert case alert links" on public.case_alert_links;
    comment on table public.case_alert_links is
      'D62: case alert links are server-only writes through app capability checks.';
  end if;

  if to_regclass('public.case_report_links') is not null then
    drop policy if exists "org members can insert case report links" on public.case_report_links;
    drop policy if exists "org members can update case report links" on public.case_report_links;
    comment on table public.case_report_links is
      'D62: case report links are server-only writes through app capability checks.';
  end if;

  if to_regclass('public.case_execution_links') is not null then
    drop policy if exists "org members can insert case execution links" on public.case_execution_links;
    comment on table public.case_execution_links is
      'D62: case execution links are server-only writes through app capability checks.';
  end if;

  if to_regclass('public.case_investigation_links') is not null then
    drop policy if exists "org members can insert case investigation links" on public.case_investigation_links;
    comment on table public.case_investigation_links is
      'D62: case investigation links are server-only writes through app capability checks.';
  end if;

  if to_regclass('public.client_accounts') is not null then
    drop policy if exists "org members can insert client accounts" on public.client_accounts;
    drop policy if exists "org members can update client accounts" on public.client_accounts;
    comment on table public.client_accounts is
      'D62: client mutations are server-only through Clerk RBAC routes; authenticated Data API access is read-only under RLS.';
  end if;

  if to_regclass('public.investigation_steps') is not null then
    drop policy if exists "org members can insert investigation steps" on public.investigation_steps;
    drop policy if exists "org members can update investigation steps" on public.investigation_steps;
    comment on table public.investigation_steps is
      'D62: investigation step mutations are server-only through Clerk RBAC routes; authenticated Data API access is read-only under RLS.';
  end if;

  if to_regclass('public.analyst_decisions') is not null then
    drop policy if exists "org members can insert analyst decisions" on public.analyst_decisions;
    comment on table public.analyst_decisions is
      'D62: analyst decisions are server-only writes through Clerk RBAC routes; authenticated Data API access is read-only under RLS.';
  end if;

  if to_regclass('public.workspace_invites') is not null then
    drop policy if exists "workspace invite admins can create" on public.workspace_invites;
    drop policy if exists "workspace invite admins can update" on public.workspace_invites;
    comment on table public.workspace_invites is
      'D62: invite create/update/revoke/email delivery writes are server-only through Clerk RBAC routes and service-role RPC paths.';
  end if;
end $$;
