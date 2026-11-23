-- =============================================================================
-- PawTrack — Ormoc Strays Oasis
-- Paste this entire file into the Supabase SQL Editor and Run.
-- Then run seed.sql.
-- =============================================================================

-- Extensions
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('staff', 'admin', 'volunteer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('active', 'pending', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dog_sex as enum ('Female', 'Male');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dog_age as enum ('Puppy', 'Young Adult', 'Adult', 'Senior');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dog_size as enum ('Small', 'Medium', 'Large');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.dog_status as enum (
    'Available',
    'Under Treatment',
    'Pending Adoption',
    'Fostered',
    'Adopted',
    'Deceased'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.adoption_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.donation_method as enum (
    'GCash',
    'Bank Transfer',
    'Cash / Walk-in',
    'In-kind Donation'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.message_kind as enum ('contact', 'adoption', 'donation', 'staff');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text not null,
  email text,
  role public.user_role not null default 'staff',
  status public.account_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_email_idx on public.profiles (email);

-- -----------------------------------------------------------------------------
-- Dogs
-- -----------------------------------------------------------------------------
create sequence if not exists public.dogs_oso_seq start 1;

create table if not exists public.dogs (
  id uuid primary key default gen_random_uuid(),
  oso_id text unique not null,
  name text not null,
  sex public.dog_sex not null default 'Female',
  age public.dog_age not null default 'Young Adult',
  breed text not null default 'Aspin',
  color text not null default '',
  size public.dog_size not null default 'Medium',
  status public.dog_status not null default 'Available',
  vax_5in1 boolean not null default true,
  anti_rabies boolean not null default true,
  dewormed boolean not null default true,
  spayed boolean not null default false,
  temperament text not null default '',
  story text not null default '',
  photo_url text not null default '',
  visible boolean not null default true,
  mother_id uuid references public.dogs (id) on delete set null,
  intake_at timestamptz not null default now(),
  died_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dogs_status_idx on public.dogs (status);
create index if not exists dogs_mother_idx on public.dogs (mother_id);
create index if not exists dogs_search_idx on public.dogs (name, age, color, sex);

create or replace function public.dogs_set_oso_id()
returns trigger
language plpgsql
as $$
begin
  if new.oso_id is null or new.oso_id = '' then
    new.oso_id := 'OSO-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.dogs_oso_seq')::text, 3, '0');
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists dogs_oso_id_trg on public.dogs;
create trigger dogs_oso_id_trg
before insert or update on public.dogs
for each row execute function public.dogs_set_oso_id();

-- -----------------------------------------------------------------------------
-- Adoptions
-- -----------------------------------------------------------------------------
create table if not exists public.adoptions (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs (id) on delete cascade,
  applicant text not null,
  email text not null default '',
  phone text not null,
  address text not null default '',
  home text not null default 'House with yard',
  pets text not null default 'None',
  note text not null,
  id_photo_url text not null,
  status public.adoption_status not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create index if not exists adoptions_status_idx on public.adoptions (status);
create index if not exists adoptions_dog_idx on public.adoptions (dog_id);

-- -----------------------------------------------------------------------------
-- Donations (auto-accepted)
-- -----------------------------------------------------------------------------
create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null default '',
  amount numeric(12,2) not null check (amount > 0),
  purpose text not null default 'General Fund',
  method public.donation_method not null default 'GCash',
  message text not null default '',
  dog_id uuid references public.dogs (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists donations_created_idx on public.donations (created_at desc);

-- -----------------------------------------------------------------------------
-- Staff / admin inbox
-- -----------------------------------------------------------------------------
create table if not exists public.inbox_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null default '',
  subject text not null,
  body text not null,
  kind public.message_kind not null default 'contact',
  dog_id uuid references public.dogs (id) on delete set null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists inbox_unread_idx on public.inbox_messages (read, created_at desc);

-- -----------------------------------------------------------------------------
-- Activity log
-- -----------------------------------------------------------------------------
create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  text text not null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Auth → profile
-- Every new login (staff application or dashboard-created user) starts as
-- pending staff with no access until an admin approves it.
-- -----------------------------------------------------------------------------
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Role helpers
-- -----------------------------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role in ('staff', 'admin')
      and status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and status = 'active'
  );
$$;

-- -----------------------------------------------------------------------------
-- Staff applications
-- Applicants sign up on /staff-apply, verify their email with a 6-digit code
-- and wait as pending staff until an admin approves them on the Staff page.
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Adoption / donation side effects
-- -----------------------------------------------------------------------------
create or replace function public.on_adoption_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  dog_name text;
begin
  select name into dog_name from public.dogs where id = new.dog_id;
  update public.dogs
    set status = 'Pending Adoption'
    where id = new.dog_id and status = 'Available';
  insert into public.inbox_messages (name, email, subject, body, kind, dog_id)
  values (
    new.applicant,
    new.email,
    'Adoption application: ' || coalesce(dog_name, 'a dog'),
    new.applicant || ' wants to adopt ' || coalesce(dog_name, 'a dog') ||
      '. Phone: ' || new.phone ||
      '. Who wants to adopt: ' || new.note,
    'adoption',
    new.dog_id
  );
  insert into public.activity_log (text)
  values ('Adoption application for ' || coalesce(dog_name, 'a dog'));
  return new;
end;
$$;

drop trigger if exists adoption_inserted_trg on public.adoptions;
create trigger adoption_inserted_trg
after insert on public.adoptions
for each row execute function public.on_adoption_inserted();

create or replace function public.on_donation_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.inbox_messages (name, email, subject, body, kind, dog_id)
  values (
    new.name,
    new.email,
    'Donation received: ₱' || trim(to_char(new.amount, '999,999,999.00')),
    new.name || ' donated ₱' || trim(to_char(new.amount, '999,999,999.00')) ||
      ' for ' || new.purpose || ' via ' || new.method::text ||
      case when new.message <> '' then '. Note: ' || new.message else '.' end,
    'donation',
    new.dog_id
  );
  insert into public.activity_log (text)
  values ('Donation ₱' || trim(to_char(new.amount, '999,999,999.00')) || ' received');
  return new;
end;
$$;

drop trigger if exists donation_inserted_trg on public.donations;
create trigger donation_inserted_trg
after insert on public.donations
for each row execute function public.on_donation_inserted();

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

create or replace function public.reject_adoption(p_id uuid)
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
  update public.adoptions
    set status = 'rejected', decided_at = now()
    where id = p_id;
  update public.dogs
    set status = 'Available'
    where id = rec.dog_id and status = 'Pending Adoption';
end;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.dogs enable row level security;
alter table public.adoptions enable row level security;
alter table public.donations enable row level security;
alter table public.inbox_messages enable row level security;
alter table public.activity_log enable row level security;

-- Profiles
-- Profiles hold emails, so only the owner and active staff can read them.
drop policy if exists "own or staff read profiles" on public.profiles;
create policy "own or staff read profiles" on public.profiles
  for select using (id = auth.uid() or public.is_staff());

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists "admin manage profiles" on public.profiles;
create policy "admin manage profiles" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Dogs: public sees visible adoptable-ish rows; staff sees all
drop policy if exists "public read visible dogs" on public.dogs;
create policy "public read visible dogs" on public.dogs
  for select using (visible = true);

drop policy if exists "staff manage dogs" on public.dogs;
create policy "staff manage dogs" on public.dogs
  for all using (public.is_staff()) with check (public.is_staff());

-- Adoptions: anyone can apply; staff read and manage
drop policy if exists "anyone apply adopt" on public.adoptions;
create policy "anyone apply adopt" on public.adoptions
  for insert with check (true);

drop policy if exists "staff read adoptions" on public.adoptions;
create policy "staff read adoptions" on public.adoptions
  for select using (public.is_staff());

drop policy if exists "staff manage adoptions" on public.adoptions;
create policy "staff manage adoptions" on public.adoptions
  for update using (public.is_staff()) with check (public.is_staff());

-- Donations
drop policy if exists "anyone donate" on public.donations;
create policy "anyone donate" on public.donations
  for insert with check (true);

drop policy if exists "staff read donations" on public.donations;
create policy "staff read donations" on public.donations
  for select using (public.is_staff());

-- Inbox
drop policy if exists "anyone write inbox" on public.inbox_messages;
create policy "anyone write inbox" on public.inbox_messages
  for insert with check (true);

drop policy if exists "staff read inbox" on public.inbox_messages;
create policy "staff read inbox" on public.inbox_messages
  for select using (public.is_staff());

drop policy if exists "staff update inbox" on public.inbox_messages;
create policy "staff update inbox" on public.inbox_messages
  for update using (public.is_staff()) with check (public.is_staff());

-- Activity
drop policy if exists "staff read activity" on public.activity_log;
create policy "staff read activity" on public.activity_log
  for select using (public.is_staff());

drop policy if exists "staff write activity" on public.activity_log;
create policy "staff write activity" on public.activity_log
  for insert with check (public.is_staff());

-- -----------------------------------------------------------------------------
-- Storage buckets
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('dog-photos', 'dog-photos', true),
  ('id-photos', 'id-photos', false)
on conflict (id) do nothing;

drop policy if exists "public read dog photos" on storage.objects;
create policy "public read dog photos" on storage.objects
  for select using (bucket_id = 'dog-photos');

drop policy if exists "staff write dog photos" on storage.objects;
create policy "staff write dog photos" on storage.objects
  for all using (bucket_id = 'dog-photos' and public.is_staff())
  with check (bucket_id = 'dog-photos' and public.is_staff());

drop policy if exists "anyone upload id photos" on storage.objects;
create policy "anyone upload id photos" on storage.objects
  for insert with check (bucket_id = 'id-photos');

drop policy if exists "staff read id photos" on storage.objects;
create policy "staff read id photos" on storage.objects
  for select using (bucket_id = 'id-photos' and public.is_staff());

-- Grant RPC
grant execute on function public.approve_adoption(uuid) to authenticated;
grant execute on function public.reject_adoption(uuid) to authenticated;
grant execute on function public.is_staff() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
revoke execute on function public.staff_applications() from public, anon;
revoke execute on function public.decide_staff_application(uuid, boolean) from public, anon;
grant execute on function public.staff_applications() to authenticated;
grant execute on function public.decide_staff_application(uuid, boolean) to authenticated;
grant execute on function public.username_available(text) to anon, authenticated;
