alter default privileges in schema public
  revoke all on tables from anon;

alter default privileges in schema public
  revoke all on tables from authenticated;

revoke update on table public.analyst_decisions from authenticated;
