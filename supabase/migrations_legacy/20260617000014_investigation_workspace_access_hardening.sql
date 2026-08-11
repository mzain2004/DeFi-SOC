revoke all on table public.investigation_steps from anon;
revoke all on table public.analyst_decisions from anon;

revoke delete, truncate, references, trigger on table public.investigation_steps from authenticated;
revoke delete, truncate, references, trigger on table public.analyst_decisions from authenticated;

grant select, insert, update on table public.investigation_steps to authenticated;
grant select, insert, update on table public.analyst_decisions to authenticated;
