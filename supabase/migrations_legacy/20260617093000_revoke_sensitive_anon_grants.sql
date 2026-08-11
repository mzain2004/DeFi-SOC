revoke all on table public.security_cases from anon;
revoke all on table public.case_events from anon;
revoke all on table public.case_notes from anon;
revoke all on table public.case_alert_links from anon;
revoke all on table public.case_investigation_links from anon;
revoke all on table public.case_execution_links from anon;
revoke all on table public.audit_logs from anon;
revoke all on table public.client_accounts from anon;

revoke delete, truncate, references, trigger on table public.security_cases from authenticated;
revoke delete, truncate, references, trigger, update on table public.case_events from authenticated;
revoke delete, truncate, references, trigger, update on table public.audit_logs from authenticated;
revoke delete, truncate, references, trigger, update on table public.case_alert_links from authenticated;
revoke delete, truncate, references, trigger, update on table public.case_investigation_links from authenticated;
revoke delete, truncate, references, trigger, update on table public.case_execution_links from authenticated;
revoke delete, truncate, references, trigger on table public.case_notes from authenticated;
revoke delete, truncate, references, trigger on table public.client_accounts from authenticated;

grant select, insert, update on table public.security_cases to authenticated;
grant select, insert on table public.case_events to authenticated;
grant select, insert, update on table public.case_notes to authenticated;
grant select, insert on table public.case_alert_links to authenticated;
grant select, insert on table public.case_investigation_links to authenticated;
grant select, insert on table public.case_execution_links to authenticated;
grant select, insert on table public.audit_logs to authenticated;
grant select, insert, update on table public.client_accounts to authenticated;
