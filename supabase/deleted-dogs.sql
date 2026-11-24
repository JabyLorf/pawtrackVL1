-- =============================================================================
-- PawTrack — recently deleted dogs + deleting staff accounts
-- Run once in the Supabase SQL Editor on a database created before this
-- feature. New databases created from schema.sql already have it.
--
-- Deleting a dog hides it everywhere and puts it in "Recently deleted" for
-- 7 days, where an admin can restore it. A daily job then deletes it for good
-- (its adoption applications go with it).
-- =============================================================================

create extension if not exists pg_cron;

alter table public.dogs add column if not exists deleted_at timestamptz;
alter table public.dogs add column if not exists deleted_by uuid references public.profiles (id) on delete set null;
create index if not exists dogs_deleted_idx on public.dogs (deleted_at) where deleted_at is not null;

-- Deleted dogs are invisible to normal queries (website and staff desk).
drop policy if exists "public read visible dogs" on public.dogs;
create policy "public read visible dogs" on public.dogs
  for select using (visible = true and deleted_at is null);

drop policy if exists "staff manage dogs" on public.dogs;
drop policy if exists "staff read dogs" on public.dogs;
drop policy if exists "staff add dogs" on public.dogs;
drop policy if exists "staff edit dogs" on public.dogs;
create policy "staff read dogs" on public.dogs
  for select using (public.is_staff() and deleted_at is null);
create policy "staff add dogs" on public.dogs
  for insert with check (public.is_staff());
create policy "staff edit dogs" on public.dogs
  for update using (public.is_staff() and deleted_at is null) with check (public.is_staff());
-- No delete policy: dogs are only removed through the functions below.

create or replace function public.delete_dog(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.dogs%rowtype;
begin
  if not public.is_admin() then raise exception 'Only administrators can delete dogs'; end if;
  select * into d from public.dogs where id = p_id and deleted_at is null;
  if d.id is null then raise exception 'Dog not found'; end if;
  update public.dogs set deleted_at = now(), deleted_by = auth.uid() where id = p_id;
  insert into public.activity_log (text) values ('Dog deleted: ' || d.name || ' (restorable for 7 days)');
end;
$$;

create or replace function public.restore_dog(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.dogs%rowtype;
begin
  if not public.is_admin() then raise exception 'Only administrators can restore dogs'; end if;
  select * into d from public.dogs where id = p_id and deleted_at is not null;
  if d.id is null then raise exception 'Dog not found in Recently deleted'; end if;
  update public.dogs set deleted_at = null, deleted_by = null where id = p_id;
  insert into public.activity_log (text) values ('Dog restored: ' || d.name);
end;
$$;

-- Deleting for good right away, from the Recently deleted page.
create or replace function public.purge_dog(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.dogs%rowtype;
begin
  if not public.is_admin() then raise exception 'Only administrators can delete dogs'; end if;
  select * into d from public.dogs where id = p_id and deleted_at is not null;
  if d.id is null then raise exception 'Dog not found in Recently deleted'; end if;
  delete from public.dogs where id = p_id;
  insert into public.activity_log (text) values ('Dog permanently deleted: ' || d.name);
end;
$$;

create or replace function public.deleted_dogs()
returns table (
  id uuid, name text, oso_id text, sex public.dog_sex, age public.dog_age, breed text,
  status public.dog_status, photo_url text, deleted_at timestamptz, deleted_by_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.name, d.oso_id, d.sex, d.age, d.breed, d.status, d.photo_url, d.deleted_at,
         coalesce(p.display_name, '') as deleted_by_name
  from public.dogs d
  left join public.profiles p on p.id = d.deleted_by
  where public.is_admin() and d.deleted_at is not null
  order by d.deleted_at desc;
$$;

-- Daily clean-up, run by pg_cron.
create or replace function public.purge_deleted_dogs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.dogs where deleted_at < now() - interval '7 days';
  get diagnostics n = row_count;
  if n > 0 then
    insert into public.activity_log (text) values (n || ' deleted dog(s) removed for good after 7 days');
  end if;
  return n;
end;
$$;

select cron.unschedule('purge-deleted-dogs') where exists (select 1 from cron.job where jobname = 'purge-deleted-dogs');
select cron.schedule('purge-deleted-dogs', '0 3 * * *', 'select public.purge_deleted_dogs()');

-- Admins can delete staff and volunteer accounts (not other admins, not themselves).
create or replace function public.delete_staff_account(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles%rowtype;
begin
  if not public.is_admin() then raise exception 'Only administrators can delete accounts'; end if;
  if p_id = auth.uid() then raise exception 'You cannot delete your own account'; end if;
  select * into p from public.profiles where id = p_id;
  if p.id is null then raise exception 'Account not found'; end if;
  if p.role = 'admin' then raise exception 'Administrator accounts cannot be deleted here'; end if;
  delete from auth.users where id = p_id;
  insert into public.activity_log (text) values ('Staff account deleted: ' || p.display_name);
end;
$$;

revoke execute on function public.delete_dog(uuid) from public, anon;
revoke execute on function public.restore_dog(uuid) from public, anon;
revoke execute on function public.purge_dog(uuid) from public, anon;
revoke execute on function public.deleted_dogs() from public, anon;
revoke execute on function public.purge_deleted_dogs() from public, anon, authenticated;
revoke execute on function public.delete_staff_account(uuid) from public, anon;
grant execute on function public.delete_dog(uuid) to authenticated;
grant execute on function public.restore_dog(uuid) to authenticated;
grant execute on function public.purge_dog(uuid) to authenticated;
grant execute on function public.deleted_dogs() to authenticated;
grant execute on function public.delete_staff_account(uuid) to authenticated;
