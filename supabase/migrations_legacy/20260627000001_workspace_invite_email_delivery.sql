alter table public.workspace_invites
  add column if not exists email_sent_at timestamptz null,
  add column if not exists last_email_error text null,
  add column if not exists email_send_attempts integer not null default 0;

alter table public.workspace_invites
  drop constraint if exists workspace_invites_status_check;

alter table public.workspace_invites
  add constraint workspace_invites_status_check
  check (status in ('pending', 'sent', 'failed', 'accepted', 'revoked', 'expired'));

drop index if exists idx_workspace_invites_pending_email;

create unique index if not exists idx_workspace_invites_active_email
  on public.workspace_invites (organization_id, lower(email))
  where status in ('pending', 'sent', 'failed');

create or replace function public.accept_workspace_invite(
  p_token_hash text,
  p_user_id text,
  p_user_email text
)
returns table (
  status text,
  membership_id uuid,
  organization_id uuid,
  organization_name text,
  role text,
  invite_id uuid,
  accepted_at timestamptz
)
language plpgsql
as $$
declare
  v_invite public.workspace_invites%rowtype;
  v_membership public.org_members%rowtype;
  v_organization_name text;
  v_normalized_email text := lower(trim(p_user_email));
  v_stored_role text;
  v_accepted_at timestamptz := now();
begin
  select *
  into v_invite
  from public.workspace_invites wi
  where wi.token_hash = p_token_hash
  for update;

  if not found then
    return query
    select 'invalid'::text, null::uuid, null::uuid, null::text, null::text, null::uuid, null::timestamptz;
    return;
  end if;

  select o.name into v_organization_name
  from public.organizations o
  where o.id = v_invite.organization_id;

  if v_invite.status not in ('pending', 'sent') then
    return query
    select v_invite.status, null::uuid, v_invite.organization_id, v_organization_name, v_invite.role, v_invite.id, v_invite.accepted_at;
    return;
  end if;

  if v_invite.expires_at <= now() then
    update public.workspace_invites
    set status = 'expired',
        updated_at = now()
    where id = v_invite.id;

    return query
    select 'expired'::text, null::uuid, v_invite.organization_id, v_organization_name, v_invite.role, v_invite.id, null::timestamptz;
    return;
  end if;

  if lower(trim(v_invite.email)) <> v_normalized_email then
    return query
    select 'email_mismatch'::text, null::uuid, v_invite.organization_id, v_organization_name, v_invite.role, v_invite.id, null::timestamptz;
    return;
  end if;

  v_stored_role := case v_invite.role
    when 'operator' then 'analyst_l3'
    when 'admin' then 'admin'
    when 'viewer' then 'viewer'
    else null
  end;

  if v_stored_role is null then
    return query
    select 'invalid_role'::text, null::uuid, v_invite.organization_id, v_organization_name, v_invite.role, v_invite.id, null::timestamptz;
    return;
  end if;

  select *
  into v_membership
  from public.org_members om
  where om.org_id = v_invite.organization_id
    and om.user_id = p_user_id
  for update;

  if found then
    update public.workspace_invites
    set status = 'accepted',
        accepted_by = p_user_id,
        accepted_at = coalesce(accepted_at, v_accepted_at),
        updated_at = now()
    where id = v_invite.id;

    return query
    select 'already_member'::text, v_membership.id, v_invite.organization_id, v_organization_name, v_invite.role, v_invite.id, coalesce(v_invite.accepted_at, v_accepted_at);
    return;
  end if;

  insert into public.org_members (org_id, user_id, role)
  values (v_invite.organization_id, p_user_id, v_stored_role)
  returning * into v_membership;

  update public.workspace_invites
  set status = 'accepted',
      accepted_by = p_user_id,
      accepted_at = v_accepted_at,
      updated_at = now()
  where id = v_invite.id;

  return query
  select 'accepted'::text, v_membership.id, v_invite.organization_id, v_organization_name, v_invite.role, v_invite.id, v_accepted_at;
end;
$$;

revoke execute on function public.accept_workspace_invite(text, text, text) from public;
revoke execute on function public.accept_workspace_invite(text, text, text) from anon;
revoke execute on function public.accept_workspace_invite(text, text, text) from authenticated;
grant execute on function public.accept_workspace_invite(text, text, text) to service_role;
