-- =============================================================================
-- PawTrack — remove client accounts
-- Run once in the Supabase SQL Editor on a database that was set up with an
-- older schema.sql that still had client sign-up. New databases created from
-- the current schema.sql do not need this.
--
-- What it does:
--   * New logins start as pending staff (no access) instead of clients.
--   * Any existing client accounts become pending staff, so they lose access
--     but are not deleted. Remove them in Authentication → Users if unwanted.
--   * Adoption applications are readable by staff only.
--   * Drops dogs.owner_id and adoptions.user_id, which only linked dogs and
--     applications to client accounts. The values in them are lost.
--
-- The 'client' value stays in the user_role type because Postgres cannot drop
-- an enum value in place; nothing uses it any more.
-- =============================================================================

alter table public.profiles alter column role set default 'staff';
alter table public.profiles alter column status set default 'pending';

update public.profiles
  set role = 'staff', status = 'pending'
  where role = 'client';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uname text;
begin
  uname := coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1));
  insert into public.profiles (id, username, display_name, email, role, status)
  values (
    new.id,
    uname,
    coalesce(new.raw_user_meta_data->>'display_name', uname),
    new.email,
    'staff',
    'pending'
  );
  return new;
end;
$$;

create or replace function public.approve_adoption(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec public.adoptions%rowtype;
begin
  if not public.is_staff() then
    raise exception 'Not allowed';
  end if;
  select * into rec from public.adoptions where id = p_id;
  if rec.id is null then
    raise exception 'Application not found';
  end if;
  update public.adoptions
    set status = 'approved', decided_at = now()
    where id = p_id;
  update public.dogs
    set status = 'Adopted'
    where id = rec.dog_id;
  insert into public.activity_log (text)
  values ('Adoption approved');
end;
$$;

drop policy if exists "own adoptions readable" on public.adoptions;
drop policy if exists "staff read adoptions" on public.adoptions;
create policy "staff read adoptions" on public.adoptions
  for select using (public.is_staff());

drop index if exists public.dogs_owner_idx;
alter table public.dogs drop column if exists owner_id;
alter table public.adoptions drop column if exists user_id;
