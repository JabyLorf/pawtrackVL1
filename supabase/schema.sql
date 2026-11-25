-- =============================================================================
-- PawTrack — Ormoc Strays Oasis
-- Paste this entire file into the Supabase SQL Editor and Run.
-- Then run seed.sql.
-- =============================================================================

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists pg_cron;

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
    'GoTyme',
    'Bank Transfer',
    'Cash / Walk-in',
    'In-kind Donation'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.donation_status as enum ('pending', 'confirmed', 'rejected');
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
  deleted_at timestamptz, -- set when moved to Recently deleted (see purge job)
  deleted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dogs_status_idx on public.dogs (status);
create index if not exists dogs_mother_idx on public.dogs (mother_id);
create index if not exists dogs_search_idx on public.dogs (name, age, color, sex);
create index if not exists dogs_deleted_idx on public.dogs (deleted_at) where deleted_at is not null;

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
  -- Donors submit after paying; staff confirm before it counts in totals.
  status public.donation_status not null default 'pending',
  reference_no text not null default '',
  receipt_path text not null default '',
  anonymous boolean not null default false,
  decided_at timestamptz,
  decided_by uuid references public.profiles (id) on delete set null,
  thanked_at timestamptz,          -- thank-you email sent on submit (donation-confirmation.sql)
  confirmed_email_at timestamptz,  -- thank-you email sent on confirm
  created_at timestamptz not null default now()
);

create index if not exists donations_status_idx on public.donations (status, created_at desc);
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
  notified_at timestamptz, -- when the admin was emailed (see email-notifications.sql)
  created_at timestamptz not null default now()
);

create index if not exists inbox_unread_idx on public.inbox_messages (read, created_at desc);

-- Replies sent from the staff Inbox (written by the notify-admin function).
create table if not exists public.inbox_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.inbox_messages (id) on delete cascade,
  body text not null,
  sent_by uuid references public.profiles (id) on delete set null,
  sent_by_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists inbox_replies_message_idx on public.inbox_replies (message_id, created_at);

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
declare
  amt text := trim(to_char(new.amount, '999,999,999.00'));
begin
  insert into public.inbox_messages (name, email, subject, body, kind, dog_id)
  values (
    new.name,
    new.email,
    'Donation to confirm: ₱' || amt || ' via ' || new.method::text,
    new.name || ' says they sent ₱' || amt || ' via ' || new.method::text ||
      case when new.reference_no <> '' then ' (reference no. ' || new.reference_no || ')' else '' end ||
      ' for ' || new.purpose || '.' ||
      case when new.message <> '' then ' Note: ' || new.message else '' end ||
      ' Check the payment, then confirm or reject it on the Donations page.',
    'donation',
    new.dog_id
  );
  insert into public.activity_log (text)
  values ('Donation of ₱' || amt || ' waiting for confirmation');
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
alter table public.inbox_replies enable row level security;

-- Profiles
-- Profiles hold emails, so only the owner and active staff can read them.
drop policy if exists "own or staff read profiles" on public.profiles;
create policy "own or staff read profiles" on public.profiles
  for select using (id = auth.uid() or public.is_staff());

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile" on public.profiles
  for update using (id = auth.uid())
  -- Users may edit their own profile but never their own role or status
  -- (otherwise a pending applicant could approve themselves).
  with check (
    id = auth.uid()
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and status = (select p.status from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "admin manage profiles" on public.profiles;
create policy "admin manage profiles" on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- Dogs: public sees visible adoptable-ish rows; staff sees all
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
-- No delete policy: dogs are only removed through delete/purge functions.


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
  for insert with check (status = 'pending' and decided_at is null and decided_by is null);

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

drop policy if exists "staff read replies" on public.inbox_replies;
create policy "staff read replies" on public.inbox_replies
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
  ('id-photos', 'id-photos', false),
  ('donation-receipts', 'donation-receipts', false)
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

-- -----------------------------------------------------------------------------
-- Recently deleted dogs (7 days, then purged daily) and deleting staff accounts
-- -----------------------------------------------------------------------------
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

-- Donation receipts (staff only) and confirming donations
drop policy if exists "anyone upload donation receipts" on storage.objects;
create policy "anyone upload donation receipts" on storage.objects
  for insert with check (bucket_id = 'donation-receipts');

drop policy if exists "staff read donation receipts" on storage.objects;
create policy "staff read donation receipts" on storage.objects
  for select using (bucket_id = 'donation-receipts' and public.is_staff());

create or replace function public.decide_donation(p_id uuid, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.donations%rowtype;
begin
  if not public.is_staff() then raise exception 'Only staff can confirm donations'; end if;
  select * into d from public.donations where id = p_id;
  if d.id is null then raise exception 'Donation not found'; end if;
  update public.donations
    set status = case when p_confirm then 'confirmed' else 'rejected' end::public.donation_status,
        decided_at = now(),
        decided_by = auth.uid()
    where id = p_id;
  insert into public.activity_log (text)
  values (case when p_confirm then 'Donation confirmed: ₱' else 'Donation rejected: ₱' end
          || trim(to_char(d.amount, '999,999,999.00')) || ' from ' || d.name);
end;
$$;

revoke execute on function public.decide_donation(uuid, boolean) from public, anon;
grant execute on function public.decide_donation(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Adoption request limit (5 per dog) and admin-editable donations.
-- These replace the earlier approve/reject functions and adoption insert policy.
-- -----------------------------------------------------------------------------
-- ---- Adoptions --------------------------------------------------------------
create or replace function public.adoption_request_count(p_dog uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int from public.adoptions where dog_id = p_dog and status = 'pending';
$$;

create or replace function public.adoption_open(p_dog uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dogs d
    where d.id = p_dog
      and d.deleted_at is null
      and d.visible
      and d.status in ('Available', 'Pending Adoption')
  ) and public.adoption_request_count(p_dog) < 5;
$$;

grant execute on function public.adoption_request_count(uuid) to anon, authenticated;
grant execute on function public.adoption_open(uuid) to anon, authenticated;

drop policy if exists "anyone apply adopt" on public.adoptions;
create policy "anyone apply adopt" on public.adoptions
  for insert with check (status = 'pending' and decided_at is null and public.adoption_open(dog_id));

-- Re-check under a lock so two people applying at once can't make it 6.
create or replace function public.adoptions_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('adopt:' || new.dog_id::text));
  if public.adoption_request_count(new.dog_id) >= 5 then
    raise exception 'This dog already has 5 adoption requests being reviewed.';
  end if;
  return new;
end;
$$;

drop trigger if exists adoptions_limit_trg on public.adoptions;
create trigger adoptions_limit_trg
before insert on public.adoptions
for each row execute function public.adoptions_enforce_limit();

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
  -- The dog has a home now: close the other requests for it.
  update public.adoptions
    set status = 'rejected', decided_at = now()
    where dog_id = rec.dog_id and status = 'pending' and id <> p_id;
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
  -- Back to Available only when nobody else is still waiting.
  update public.dogs
    set status = 'Available'
    where id = rec.dog_id
      and status = 'Pending Adoption'
      and not exists (select 1 from public.adoptions a where a.dog_id = rec.dog_id and a.status = 'pending');
end;
$$;

revoke execute on function public.approve_adoption(uuid) from public, anon;
revoke execute on function public.reject_adoption(uuid) from public, anon;
grant execute on function public.approve_adoption(uuid) to authenticated;
grant execute on function public.reject_adoption(uuid) to authenticated;

-- ---- Donations --------------------------------------------------------------
alter table public.donations drop constraint if exists donations_amount_max;
alter table public.donations add constraint donations_amount_max check (amount <= 999999.99);

create or replace function public.update_donation(
  p_id uuid,
  p_amount numeric,
  p_method public.donation_method,
  p_reference text,
  p_name text,
  p_email text,
  p_purpose text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.donations%rowtype;
begin
  if not public.is_admin() then raise exception 'Only administrators can edit donations'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 999999.99 then
    raise exception 'Amount must be between 1 and 999,999';
  end if;
  select * into d from public.donations where id = p_id;
  if d.id is null then raise exception 'Donation not found'; end if;
  update public.donations
    set amount = round(p_amount, 2),
        method = p_method,
        reference_no = trim(coalesce(p_reference, '')),
        name = coalesce(nullif(trim(p_name), ''), 'Anonymous'),
        anonymous = coalesce(nullif(trim(p_name), ''), 'Anonymous') = 'Anonymous',
        email = trim(coalesce(p_email, '')),
        purpose = coalesce(nullif(trim(p_purpose), ''), 'General Fund')
    where id = p_id;
  insert into public.activity_log (text)
  values ('Donation edited: ₱' || trim(to_char(d.amount, '999,999,999.00')) || ' → ₱'
          || trim(to_char(round(p_amount, 2), '999,999,999.00')) || ' (' || coalesce(nullif(trim(p_name), ''), 'Anonymous') || ')');
end;
$$;

revoke execute on function public.update_donation(uuid, numeric, public.donation_method, text, text, text, text) from public, anon;
grant execute on function public.update_donation(uuid, numeric, public.donation_method, text, text, text, text) to authenticated;


-- ---- Intake records (see intakes.sql) ----------------------------------------
create table if not exists public.intakes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  sex public.dog_sex not null default 'Female',
  age public.dog_age not null default 'Young Adult',
  breed text not null default 'Aspin',
  color text not null default '',
  size public.dog_size not null default 'Medium',
  photo_url text not null default '',
  reason text not null default 'Under treatment'
    check (reason in ('Under treatment', 'Injured', 'Sick', 'Quarantine', 'Too young', 'Behavior assessment', 'Other')),
  found_at text not null default '',
  rescued_by text not null default '',
  notes text not null default '',
  temperament text not null default '',
  vax_5in1 boolean not null default false,
  anti_rabies boolean not null default false,
  dewormed boolean not null default false,
  spayed boolean not null default false,
  intake_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Filled in when the dog leaves intake.
  moved_at timestamptz,
  moved_to text check (moved_to in ('Available', 'Deceased')),
  moved_dog_id uuid references public.dogs (id) on delete set null
);

create index if not exists intakes_open_idx on public.intakes (intake_at desc) where moved_at is null;

create or replace function public.intakes_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists intakes_touch_trg on public.intakes;
create trigger intakes_touch_trg
before update on public.intakes
for each row execute function public.intakes_touch();

alter table public.intakes enable row level security;

drop policy if exists "staff read intakes" on public.intakes;
drop policy if exists "staff add intakes" on public.intakes;
drop policy if exists "staff edit intakes" on public.intakes;
drop policy if exists "admin delete intakes" on public.intakes;
create policy "staff read intakes" on public.intakes
  for select using (public.is_staff());
create policy "staff add intakes" on public.intakes
  for insert with check (public.is_staff() and moved_at is null);
-- Records that already left intake are history and can't be edited.
create policy "staff edit intakes" on public.intakes
  for update using (public.is_staff() and moved_at is null) with check (public.is_staff() and moved_at is null);
create policy "admin delete intakes" on public.intakes
  for delete using (public.is_admin() and moved_at is null);

revoke all on public.intakes from anon;
grant select, insert, update, delete on public.intakes to authenticated;

-- Move an intake record out: 'Available' (up for adoption) or 'Deceased'.
-- Returns the new dog's id.
create or replace function public.finish_intake(p_id uuid, p_outcome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.intakes%rowtype;
  new_id uuid;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  if p_outcome not in ('Available', 'Deceased') then raise exception 'Unknown outcome'; end if;
  select * into r from public.intakes where id = p_id for update;
  if r.id is null then raise exception 'Intake record not found'; end if;
  if r.moved_at is not null then raise exception '% already left intake', r.name; end if;

  insert into public.dogs (name, sex, age, breed, color, size, photo_url, status,
                           vax_5in1, anti_rabies, dewormed, spayed, temperament, story,
                           visible, intake_at, died_at)
  values (r.name, r.sex, r.age, r.breed, r.color, r.size, r.photo_url, p_outcome::public.dog_status,
          r.vax_5in1, r.anti_rabies, r.dewormed, r.spayed, r.temperament, '',
          p_outcome = 'Available', r.intake_at, case when p_outcome = 'Deceased' then now() end)
  returning id into new_id;

  update public.intakes
    set moved_at = now(), moved_to = p_outcome, moved_dog_id = new_id
    where id = p_id;

  insert into public.activity_log (text)
  values (case when p_outcome = 'Available'
               then r.name || ' moved from intake to adoption'
               else r.name || ' died in intake' end);
  return new_id;
end;
$$;

revoke execute on function public.finish_intake(uuid, text) from public, anon;
grant execute on function public.finish_intake(uuid, text) to authenticated;
