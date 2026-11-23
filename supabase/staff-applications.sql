-- =============================================================================
-- PawTrack — staff applications
-- Run once in the Supabase SQL Editor on a database created before staff
-- applications existed. New databases created from schema.sql already have it.
--
-- Flow: someone applies on /staff-apply → verifies their email with a 6-digit
-- code → their account waits as "pending" → an admin approves or rejects it on
-- the Staff page. Pending and rejected accounts cannot use the staff desk.
-- =============================================================================

alter type public.message_kind add value if not exists 'staff';

-- Profiles hold emails, so only the owner and active staff can read them.
drop policy if exists "profiles are readable" on public.profiles;
drop policy if exists "own or staff read profiles" on public.profiles;
create policy "own or staff read profiles" on public.profiles
  for select using (id = auth.uid() or public.is_staff());

-- Lets the apply form check a username without exposing the profiles table.
create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1 from public.profiles where lower(username) = lower(trim(p_username))
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;

-- New logins start as pending staff. Usernames get a number added if taken
-- (e.g. accounts created in the dashboard without a username).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  uname text;
  n int := 1;
begin
  base := coalesce(nullif(trim(new.raw_user_meta_data->>'username'), ''), split_part(new.email, '@', 1));
  uname := base;
  while exists (select 1 from public.profiles where lower(username) = lower(uname)) loop
    n := n + 1;
    uname := base || n::text;
  end loop;
  insert into public.profiles (id, username, display_name, email, role, status)
  values (
    new.id,
    uname,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), uname),
    new.email,
    'staff',
    'pending'
  );
  return new;
end;
$$;

-- When an applicant verifies their email, tell the admins in the inbox.
create or replace function public.on_auth_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
begin
  select * into p from public.profiles where id = new.id;
  if p.id is not null and p.status = 'pending' then
    insert into public.inbox_messages (name, email, subject, body, kind)
    values (
      p.display_name,
      coalesce(p.email, ''),
      'Staff application: ' || p.display_name,
      p.display_name || ' (@' || p.username || ') applied for a staff account. Approve or reject it on the Staff page.',
      'staff'
    );
    insert into public.activity_log (text)
    values ('Staff application from ' || p.display_name);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
after update of email_confirmed_at on auth.users
for each row
when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
execute function public.on_auth_user_confirmed();

-- Applications an admin can act on: pending accounts with a verified email.
create or replace function public.staff_applications()
returns setof public.profiles
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
    and p.status = 'pending'
    and u.email_confirmed_at is not null
  order by p.created_at;
$$;

create or replace function public.decide_staff_application(p_id uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Not allowed';
  end if;
  if p_id = auth.uid() then
    raise exception 'You cannot change your own account';
  end if;
  select * into p from public.profiles where id = p_id;
  if p.id is null then
    raise exception 'Application not found';
  end if;
  update public.profiles
    set status = case when p_approve then 'active' else 'suspended' end::public.account_status
    where id = p_id;
  insert into public.activity_log (text)
  values (case when p_approve then 'Staff approved: ' else 'Staff rejected: ' end || p.display_name);
end;
$$;

revoke execute on function public.staff_applications() from public, anon;
revoke execute on function public.decide_staff_application(uuid, boolean) from public, anon;
grant execute on function public.staff_applications() to authenticated;
grant execute on function public.decide_staff_application(uuid, boolean) to authenticated;
