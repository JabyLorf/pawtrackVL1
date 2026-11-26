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


-- ---- Community (see community.sql) --------------------------------------------
-- ---- Profiles: public extras ------------------------------------------------
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles add column if not exists avatar_url text not null default '';
alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles add constraint profiles_bio_len check (length(bio) <= 300);
alter table public.profiles drop constraint if exists profiles_display_name_len;
alter table public.profiles add constraint profiles_display_name_len check (length(trim(display_name)) between 1 and 60) not valid;

-- New sign-ups: community members are active at once; everyone else is a
-- pending staff applicant (unchanged).
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
  member boolean := coalesce(new.raw_user_meta_data->>'account_type', '') = 'member';
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
    left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), uname), 60),
    new.email,
    case when member then 'client'::public.user_role else 'staff'::public.user_role end,
    case when member then 'active'::public.account_status else 'pending'::public.account_status end
  );
  return new;
end;
$$;

-- Signed in with an active account (member or staff) = may take part.
create or replace function public.can_post()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;
grant execute on function public.can_post() to anon, authenticated;

create or replace function public.is_active_profile(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = p_id and status = 'active');
$$;
grant execute on function public.is_active_profile(uuid) to anon, authenticated;

-- ---- Tables -----------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null default '' check (length(body) <= 2200),
  photo_url text not null default '',
  dog_id uuid references public.dogs (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint posts_not_empty check (length(trim(body)) > 0 or photo_url <> '')
);
create index if not exists posts_created_idx on public.posts (created_at desc);
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists post_likes_user_idx on public.post_likes (user_id);

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);
create index if not exists post_comments_author_idx on public.post_comments (author_id, created_at desc);

create table if not exists public.follows (
  follower_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_not_self check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows (following_id);

-- ---- Spam limits ------------------------------------------------------------
create or replace function public.community_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'posts' then
    if (select count(*) from public.posts where author_id = new.author_id and created_at > now() - interval '1 hour') >= 10 then
      raise exception 'You can share up to 10 posts an hour. Please try again later.';
    end if;
  elsif tg_table_name = 'post_comments' then
    if (select count(*) from public.post_comments where author_id = new.author_id and created_at > now() - interval '10 minutes') >= 20 then
      raise exception 'You are commenting too fast. Please wait a few minutes.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists posts_rate_trg on public.posts;
create trigger posts_rate_trg before insert on public.posts
for each row execute function public.community_rate_limit();
drop trigger if exists comments_rate_trg on public.post_comments;
create trigger comments_rate_trg before insert on public.post_comments
for each row execute function public.community_rate_limit();
revoke execute on function public.community_rate_limit() from public, anon, authenticated;

-- ---- Row level security -----------------------------------------------------
alter table public.posts enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_comments enable row level security;
alter table public.follows enable row level security;

drop policy if exists "anyone read posts" on public.posts;
drop policy if exists "members add posts" on public.posts;
drop policy if exists "author or staff delete posts" on public.posts;
create policy "anyone read posts" on public.posts for select using (true);
create policy "members add posts" on public.posts
  for insert with check (author_id = auth.uid() and public.can_post()
    and (dog_id is null or public.is_staff()));
-- No update policy: posts can't be edited, only deleted.
create policy "author or staff delete posts" on public.posts
  for delete using (author_id = auth.uid() or public.is_staff());

drop policy if exists "anyone read likes" on public.post_likes;
drop policy if exists "members like" on public.post_likes;
drop policy if exists "members unlike" on public.post_likes;
create policy "anyone read likes" on public.post_likes for select using (true);
create policy "members like" on public.post_likes
  for insert with check (user_id = auth.uid() and public.can_post());
create policy "members unlike" on public.post_likes
  for delete using (user_id = auth.uid());

drop policy if exists "anyone read comments" on public.post_comments;
drop policy if exists "members comment" on public.post_comments;
drop policy if exists "author, post owner or staff delete comments" on public.post_comments;
create policy "anyone read comments" on public.post_comments for select using (true);
create policy "members comment" on public.post_comments
  for insert with check (author_id = auth.uid() and public.can_post());
create policy "author, post owner or staff delete comments" on public.post_comments
  for delete using (
    author_id = auth.uid()
    or public.is_staff()
    or exists (select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid())
  );

drop policy if exists "anyone read follows" on public.follows;
drop policy if exists "members follow" on public.follows;
drop policy if exists "members unfollow" on public.follows;
create policy "anyone read follows" on public.follows for select using (true);
-- The check on the other person runs as definer: members can't read others' profiles.
create policy "members follow" on public.follows
  for insert with check (follower_id = auth.uid() and public.can_post() and public.is_active_profile(following_id));
create policy "members unfollow" on public.follows
  for delete using (follower_id = auth.uid());

grant select on public.posts, public.post_likes, public.post_comments, public.follows to anon, authenticated;
grant insert, delete on public.posts, public.post_likes, public.post_comments, public.follows to authenticated;

-- ---- Read functions (public fields only) ------------------------------------
-- p_scope: 'all' (everyone), 'following' (people I follow + me), 'user' (p_author)
create or replace function public.community_posts(
  p_scope text default 'all',
  p_author uuid default null,
  p_before timestamptz default null,
  p_limit int default 20,
  p_id uuid default null
)
returns table (
  id uuid, body text, photo_url text, dog_id uuid, dog_name text, created_at timestamptz,
  author_id uuid, username text, display_name text, avatar_url text, is_shelter boolean,
  likes int, comments int, liked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.body, p.photo_url, p.dog_id, d.name, p.created_at,
         a.id, a.username, a.display_name, a.avatar_url, a.role in ('staff', 'admin'),
         (select count(*)::int from public.post_likes l where l.post_id = p.id),
         (select count(*)::int from public.post_comments c where c.post_id = p.id),
         exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid())
  from public.posts p
  join public.profiles a on a.id = p.author_id and a.status = 'active'
  left join public.dogs d on d.id = p.dog_id and d.deleted_at is null and d.visible
  where (p_id is null or p.id = p_id)
    and (p_before is null or p.created_at < p_before)
    and case coalesce(p_scope, 'all')
          when 'following' then p.author_id = auth.uid()
            or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.author_id)
          when 'user' then p.author_id = p_author
          else true
        end
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;

create or replace function public.community_comments(p_post uuid)
returns table (
  id uuid, body text, created_at timestamptz,
  author_id uuid, username text, display_name text, avatar_url text, is_shelter boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.body, c.created_at, a.id, a.username, a.display_name, a.avatar_url, a.role in ('staff', 'admin')
  from public.post_comments c
  join public.profiles a on a.id = c.author_id and a.status = 'active'
  where c.post_id = p_post
  order by c.created_at
  limit 500;
$$;

create or replace function public.community_profile(p_username text)
returns table (
  id uuid, username text, display_name text, avatar_url text, bio text, is_shelter boolean,
  joined timestamptz, posts int, followers int, following int, followed_by_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.username, a.display_name, a.avatar_url, a.bio, a.role in ('staff', 'admin'), a.created_at,
         (select count(*)::int from public.posts p where p.author_id = a.id),
         (select count(*)::int from public.follows f where f.following_id = a.id),
         (select count(*)::int from public.follows f where f.follower_id = a.id),
         exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = a.id)
  from public.profiles a
  where lower(a.username) = lower(p_username) and a.status = 'active';
$$;

-- p_kind: 'followers' or 'following'
create or replace function public.community_people(p_user uuid, p_kind text)
returns table (id uuid, username text, display_name text, avatar_url text, is_shelter boolean)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.username, a.display_name, a.avatar_url, a.role in ('staff', 'admin')
  from public.follows f
  join public.profiles a on a.id = case when p_kind = 'following' then f.following_id else f.follower_id end
  where a.status = 'active'
    and case when p_kind = 'following' then f.follower_id = p_user else f.following_id = p_user end
  order by f.created_at desc
  limit 500;
$$;

grant execute on function public.community_posts(text, uuid, timestamptz, int, uuid) to anon, authenticated;
grant execute on function public.community_comments(uuid) to anon, authenticated;
grant execute on function public.community_profile(text) to anon, authenticated;
grant execute on function public.community_people(uuid, text) to anon, authenticated;

-- ---- Photos -----------------------------------------------------------------
-- Public bucket; each person uploads only into a folder named after their id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community', 'community', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

drop policy if exists "public read community photos" on storage.objects;
drop policy if exists "members upload own community photos" on storage.objects;
drop policy if exists "members delete own community photos" on storage.objects;
create policy "public read community photos" on storage.objects
  for select using (bucket_id = 'community');
create policy "members upload own community photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text and public.can_post());
create policy "members delete own community photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'community' and (storage.foldername(name))[1] = auth.uid()::text);


-- ---- Notifications, messages and reports (see social.sql) ----------------------
-- Reports reach the admin's email through the staff inbox.
alter type public.message_kind add value if not exists 'report';

-- ---- Notifications ----------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('like', 'comment', 'follow')),
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.post_comments (id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
-- One "liked your post" / "followed you" per person, however often they toggle.
create unique index if not exists notifications_once on public.notifications
  (user_id, actor_id, kind, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where kind in ('like', 'follow');

alter table public.notifications enable row level security;
drop policy if exists "own notifications" on public.notifications;
drop policy if exists "mark own notifications" on public.notifications;
drop policy if exists "clear own notifications" on public.notifications;
create policy "own notifications" on public.notifications for select using (user_id = auth.uid());
create policy "mark own notifications" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "clear own notifications" on public.notifications for delete using (user_id = auth.uid());
revoke all on public.notifications from anon, authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create or replace function public.notify_on_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare author uuid;
begin
  if tg_op = 'INSERT' then
    select author_id into author from public.posts where id = new.post_id;
    if author is not null and author <> new.user_id then
      insert into public.notifications (user_id, actor_id, kind, post_id)
      values (author, new.user_id, 'like', new.post_id)
      on conflict do nothing;
    end if;
    return new;
  end if;
  delete from public.notifications
    where kind = 'like' and actor_id = old.user_id and post_id = old.post_id and read_at is null;
  return old;
end;
$$;

create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare author uuid;
begin
  select author_id into author from public.posts where id = new.post_id;
  if author is not null and author <> new.author_id then
    insert into public.notifications (user_id, actor_id, kind, post_id, comment_id)
    values (author, new.author_id, 'comment', new.post_id, new.id);
  end if;
  return new;
end;
$$;

create or replace function public.notify_on_follow()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notifications (user_id, actor_id, kind)
    values (new.following_id, new.follower_id, 'follow')
    on conflict do nothing;
    return new;
  end if;
  delete from public.notifications
    where kind = 'follow' and actor_id = old.follower_id and user_id = old.following_id and read_at is null;
  return old;
end;
$$;

drop trigger if exists likes_notify_trg on public.post_likes;
create trigger likes_notify_trg after insert or delete on public.post_likes
for each row execute function public.notify_on_like();
drop trigger if exists comments_notify_trg on public.post_comments;
create trigger comments_notify_trg after insert on public.post_comments
for each row execute function public.notify_on_comment();
drop trigger if exists follows_notify_trg on public.follows;
create trigger follows_notify_trg after insert or delete on public.follows
for each row execute function public.notify_on_follow();

create or replace function public.my_notifications(p_limit int default 50)
returns table (
  id uuid, kind text, created_at timestamptz, is_read boolean,
  actor_id uuid, username text, display_name text, avatar_url text, is_shelter boolean,
  post_id uuid, post_photo text, post_text text, comment_text text, followed_back boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.kind, n.created_at, n.read_at is not null,
         a.id, a.username, a.display_name, a.avatar_url, a.role in ('staff', 'admin'),
         n.post_id, p.photo_url, left(p.body, 80), left(c.body, 120),
         exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = a.id)
  from public.notifications n
  join public.profiles a on a.id = n.actor_id and a.status = 'active'
  left join public.posts p on p.id = n.post_id
  left join public.post_comments c on c.id = n.comment_id
  where n.user_id = auth.uid()
  order by n.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;

-- ---- Conversations ----------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text not null default '' check (length(title) <= 60),
  -- One-to-one chats: "<smaller id>:<larger id>", so each pair has one chat.
  dm_key text unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  is_admin boolean not null default false,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid references public.profiles (id) on delete set null,
  body text not null check (length(trim(body)) between 1 and 2000),
  kind text not null default 'text' check (kind in ('text', 'system')),
  created_at timestamptz not null default now()
);
create index if not exists messages_conv_idx on public.messages (conversation_id, created_at desc);

create or replace function public.is_member(p_conv uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.conversation_members where conversation_id = p_conv and user_id = auth.uid());
$$;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

drop policy if exists "members read conversations" on public.conversations;
create policy "members read conversations" on public.conversations for select using (public.is_member(id));

drop policy if exists "members read members" on public.conversation_members;
drop policy if exists "mark own chat read" on public.conversation_members;
create policy "members read members" on public.conversation_members for select using (public.is_member(conversation_id));
create policy "mark own chat read" on public.conversation_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "members read messages" on public.messages;
drop policy if exists "members send messages" on public.messages;
create policy "members read messages" on public.messages for select using (public.is_member(conversation_id));
create policy "members send messages" on public.messages
  for insert with check (sender_id = auth.uid() and kind = 'text' and public.is_member(conversation_id) and public.can_post());

revoke all on public.conversations, public.conversation_members, public.messages from anon, authenticated;
grant select on public.conversations, public.conversation_members, public.messages to authenticated;
grant insert on public.messages to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;

create or replace function public.on_message_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'text' and (
    select count(*) from public.messages
    where sender_id = new.sender_id and created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'You are sending messages too fast. Please slow down.';
  end if;
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  if new.sender_id is not null then
    update public.conversation_members set last_read_at = new.created_at
      where conversation_id = new.conversation_id and user_id = new.sender_id;
  end if;
  return new;
end;
$$;

drop trigger if exists messages_sent_trg on public.messages;
create trigger messages_sent_trg before insert on public.messages
for each row execute function public.on_message_sent();

-- Live updates for open chats (row level security still applies).
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;

create or replace function public.system_message(p_conv uuid, p_text text)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.messages (conversation_id, sender_id, body, kind) values (p_conv, null, left(p_text, 2000), 'system');
$$;
revoke execute on function public.system_message(uuid, text) from public, anon, authenticated;

create or replace function public.my_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select display_name from public.profiles where id = auth.uid();
$$;
revoke execute on function public.my_name() from public, anon, authenticated;

-- Open (or create) the one-to-one chat with someone.
create or replace function public.start_dm(p_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  k text;
  c uuid;
begin
  if not public.can_post() then raise exception 'Sign in to send messages.'; end if;
  if p_user is null or p_user = me then raise exception 'Choose someone else to message.'; end if;
  if not public.is_active_profile(p_user) then raise exception 'That account is not available.'; end if;
  k := least(me::text, p_user::text) || ':' || greatest(me::text, p_user::text);
  insert into public.conversations (is_group, dm_key, created_by) values (false, k, me)
    on conflict (dm_key) do nothing;
  select id into c from public.conversations where dm_key = k;
  insert into public.conversation_members (conversation_id, user_id) values (c, me), (c, p_user)
    on conflict do nothing;
  return c;
end;
$$;

create or replace function public.create_group(p_title text, p_members uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  t text := trim(coalesce(p_title, ''));
  others uuid[];
  c uuid;
begin
  if not public.can_post() then raise exception 'Sign in to create a group.'; end if;
  if length(t) < 1 or length(t) > 60 then raise exception 'Give the group a name (up to 60 characters).'; end if;
  select array_agg(distinct m) into others from unnest(coalesce(p_members, '{}')) m
    where m <> me and public.is_active_profile(m);
  if coalesce(array_length(others, 1), 0) < 1 then raise exception 'Add at least one person to the group.'; end if;
  if array_length(others, 1) > 49 then raise exception 'A group can have up to 50 people.'; end if;
  insert into public.conversations (is_group, title, created_by) values (true, t, me) returning id into c;
  insert into public.conversation_members (conversation_id, user_id, is_admin) values (c, me, true);
  insert into public.conversation_members (conversation_id, user_id) select c, unnest(others);
  perform public.system_message(c, public.my_name() || ' created the group "' || t || '"');
  return c;
end;
$$;

create or replace function public.add_group_members(p_conv uuid, p_members uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  added text;
begin
  if not public.can_post() or not public.is_member(p_conv) then raise exception 'Not allowed'; end if;
  if not (select is_group from public.conversations where id = p_conv) then raise exception 'People can only be added to groups.'; end if;
  with ins as (
    insert into public.conversation_members (conversation_id, user_id)
    select p_conv, m from unnest(coalesce(p_members, '{}')) m where public.is_active_profile(m)
    on conflict do nothing
    returning user_id
  )
  select string_agg(p.display_name, ', ') into added from ins join public.profiles p on p.id = ins.user_id;
  if (select count(*) from public.conversation_members where conversation_id = p_conv) > 50 then
    raise exception 'A group can have up to 50 people.';
  end if;
  if added is not null then perform public.system_message(p_conv, public.my_name() || ' added ' || added); end if;
end;
$$;

create or replace function public.remove_group_member(p_conv uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare who text;
begin
  if not exists (select 1 from public.conversation_members where conversation_id = p_conv and user_id = auth.uid() and is_admin) then
    raise exception 'Only the group admin can remove people.';
  end if;
  if p_user = auth.uid() then raise exception 'Use "Leave group" instead.'; end if;
  select display_name into who from public.profiles where id = p_user;
  delete from public.conversation_members where conversation_id = p_conv and user_id = p_user;
  if found then perform public.system_message(p_conv, public.my_name() || ' removed ' || coalesce(who, 'someone')); end if;
end;
$$;

create or replace function public.rename_group(p_conv uuid, p_title text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare t text := trim(coalesce(p_title, ''));
begin
  if not public.can_post() or not public.is_member(p_conv) then raise exception 'Not allowed'; end if;
  if length(t) < 1 or length(t) > 60 then raise exception 'Give the group a name (up to 60 characters).'; end if;
  update public.conversations set title = t where id = p_conv and is_group;
  if not found then raise exception 'Only groups can be renamed.'; end if;
  perform public.system_message(p_conv, public.my_name() || ' renamed the group to "' || t || '"');
end;
$$;

create or replace function public.leave_group(p_conv uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if not (select is_group from public.conversations where id = p_conv) then raise exception 'You can only leave groups.'; end if;
  perform public.system_message(p_conv, public.my_name() || ' left the group');
  delete from public.conversation_members where conversation_id = p_conv and user_id = me;
  if not exists (select 1 from public.conversation_members where conversation_id = p_conv) then
    delete from public.conversations where id = p_conv;
  elsif not exists (select 1 from public.conversation_members where conversation_id = p_conv and is_admin) then
    -- Hand the group to the longest-standing member.
    update public.conversation_members set is_admin = true
      where conversation_id = p_conv
        and user_id = (select user_id from public.conversation_members where conversation_id = p_conv order by joined_at limit 1);
  end if;
end;
$$;

create or replace function public.my_conversations()
returns table (
  id uuid, is_group boolean, title text, member_count int,
  other_id uuid, other_username text, other_name text, other_avatar text, other_is_shelter boolean,
  last_body text, last_kind text, last_sender text, last_at timestamptz, unread int
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.is_group, c.title,
         (select count(*)::int from public.conversation_members x where x.conversation_id = c.id),
         o.id, o.username, o.display_name, o.avatar_url, o.role in ('staff', 'admin'),
         lm.body, lm.kind, ls.display_name, coalesce(lm.created_at, c.created_at),
         (select count(*)::int from public.messages m
            where m.conversation_id = c.id and m.created_at > me.last_read_at
              and m.sender_id is distinct from auth.uid() and m.kind = 'text')
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (
    select p.* from public.conversation_members x join public.profiles p on p.id = x.user_id
    where not c.is_group and x.conversation_id = c.id and x.user_id <> auth.uid() limit 1
  ) o on true
  left join lateral (
    select m.* from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  left join public.profiles ls on ls.id = lm.sender_id
  where me.user_id = auth.uid()
    -- A one-to-one chat shows up once someone has written in it.
    and (c.is_group or lm.id is not null or c.created_by = auth.uid())
  order by coalesce(lm.created_at, c.created_at) desc
  limit 200;
$$;

create or replace function public.chat_members(p_conv uuid)
returns table (id uuid, username text, display_name text, avatar_url text, is_shelter boolean, is_admin boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.role in ('staff', 'admin'), m.is_admin
  from public.conversation_members m
  join public.profiles p on p.id = m.user_id
  where m.conversation_id = p_conv and public.is_member(p_conv)
  order by m.is_admin desc, p.display_name;
$$;

create or replace function public.chat_messages(p_conv uuid, p_before timestamptz default null, p_limit int default 50)
returns table (
  id uuid, body text, kind text, created_at timestamptz,
  sender_id uuid, username text, display_name text, avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select m.id, m.body, m.kind, m.created_at, m.sender_id, p.username, p.display_name, p.avatar_url
    from public.messages m
    left join public.profiles p on p.id = m.sender_id
    where m.conversation_id = p_conv and public.is_member(p_conv)
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) x order by created_at;
$$;

-- People search for starting chats and groups.
create or replace function public.community_search(p_q text)
returns table (id uuid, username text, display_name text, avatar_url text, is_shelter boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.role in ('staff', 'admin')
  from public.profiles p
  where p.status = 'active' and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    and length(trim(coalesce(p_q, ''))) >= 1
    and (p.username ilike '%' || trim(p_q) || '%' or p.display_name ilike '%' || trim(p_q) || '%')
  order by (p.role in ('staff', 'admin')) desc, p.display_name
  limit 20;
$$;

create or replace function public.unread_counts()
returns table (notifications int, chats int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null),
    (select count(*)::int from public.conversation_members me
       where me.user_id = auth.uid()
         and exists (select 1 from public.messages m where m.conversation_id = me.conversation_id
                       and m.created_at > me.last_read_at and m.sender_id is distinct from auth.uid() and m.kind = 'text'));
$$;

-- ---- Reports ----------------------------------------------------------------
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  target_kind text not null check (target_kind in ('post', 'comment', 'user', 'message')),
  target_id uuid not null,
  reason text not null check (reason in ('Spam', 'Harassment or bullying', 'Animal cruelty', 'Inappropriate content', 'Scam or fraud', 'Other')),
  details text not null default '' check (length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  resolution text not null default '',
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz
);
create index if not exists reports_status_idx on public.reports (status, created_at desc);
create unique index if not exists reports_once on public.reports (reporter_id, target_kind, target_id) where status = 'open';

alter table public.reports enable row level security;
drop policy if exists "staff read reports" on public.reports;
create policy "staff read reports" on public.reports for select using (public.is_staff());
revoke all on public.reports from anon, authenticated;
grant select on public.reports to authenticated;

create or replace function public.submit_report(p_kind text, p_id uuid, p_reason text, p_details text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  what text;
  who text;
begin
  if not public.can_post() then raise exception 'Sign in to report.'; end if;
  if (select count(*) from public.reports where reporter_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You have sent many reports in the last hour. Please try again later.';
  end if;
  -- The thing must exist, and a message can only be reported by someone in that chat.
  if p_kind = 'post' then
    select 'post by @' || a.username into what from public.posts p join public.profiles a on a.id = p.author_id where p.id = p_id;
  elsif p_kind = 'comment' then
    select 'comment by @' || a.username into what from public.post_comments c join public.profiles a on a.id = c.author_id where c.id = p_id;
  elsif p_kind = 'user' then
    select 'account @' || username into what from public.profiles where id = p_id and status = 'active' and id <> me;
  elsif p_kind = 'message' then
    select 'message by @' || a.username into what from public.messages m join public.profiles a on a.id = m.sender_id
      where m.id = p_id and m.kind = 'text' and public.is_member(m.conversation_id);
  end if;
  if what is null then raise exception 'That can''t be reported.'; end if;

  insert into public.reports (reporter_id, target_kind, target_id, reason, details)
  values (me, p_kind, p_id, p_reason, left(trim(coalesce(p_details, '')), 500))
  on conflict do nothing;
  if not found then return; end if; -- already reported by this person

  select display_name into who from public.profiles where id = me;
  insert into public.inbox_messages (name, email, subject, body, kind)
  values (coalesce(who, 'A member'), '', 'Community report: ' || p_reason,
          coalesce(who, 'A member') || ' reported a ' || what || ' for "' || p_reason || '".'
          || case when trim(coalesce(p_details, '')) <> '' then E'\n\n' || left(trim(p_details), 500) else '' end
          || E'\n\nReview it on the Reports page of the staff desk.',
          'report');
end;
$$;

create or replace function public.staff_reports(p_status text default 'open')
returns table (
  id uuid, target_kind text, target_id uuid, reason text, details text, status text, resolution text,
  created_at timestamptz, reports int,
  reporter_name text, reporter_username text,
  author_id uuid, author_name text, author_username text, author_status text,
  preview_text text, preview_photo text, post_id uuid, exists_still boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id, r.target_kind, r.target_id, r.reason, r.details, r.status, r.resolution, r.created_at,
         (select count(*)::int from public.reports x where x.target_kind = r.target_kind and x.target_id = r.target_id and x.status = 'open'),
         rp.display_name, rp.username,
         a.id, a.display_name, a.username, a.status::text,
         t.txt, t.photo, t.post, coalesce(t.found, false)
  from public.reports r
  left join public.profiles rp on rp.id = r.reporter_id
  left join lateral (
    select p.author_id as author, p.body as txt, p.photo_url as photo, p.id as post, true as found
      from public.posts p where r.target_kind = 'post' and p.id = r.target_id
    union all
    select c.author_id, c.body, '', c.post_id, true from public.post_comments c where r.target_kind = 'comment' and c.id = r.target_id
    union all
    select u.id, u.bio, u.avatar_url, null, true from public.profiles u where r.target_kind = 'user' and u.id = r.target_id
    union all
    select m.sender_id, m.body, '', null, true from public.messages m where r.target_kind = 'message' and m.id = r.target_id
  ) t on true
  left join public.profiles a on a.id = t.author
  where public.is_staff() and r.status = coalesce(p_status, 'open')
  order by r.created_at desc
  limit 200;
$$;

-- p_action: 'dismiss' (nothing wrong), 'remove' (delete the post/comment/message),
-- 'suspend' (admin: suspend the author's member account). Closes every open
-- report about the same thing.
create or replace function public.resolve_report(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.reports%rowtype;
  author uuid;
  note text;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  select * into r from public.reports where id = p_id;
  if r.id is null then raise exception 'Report not found'; end if;

  author := case r.target_kind
    when 'post' then (select author_id from public.posts where id = r.target_id)
    when 'comment' then (select author_id from public.post_comments where id = r.target_id)
    when 'message' then (select sender_id from public.messages where id = r.target_id)
    when 'user' then r.target_id
  end;

  if p_action = 'dismiss' then
    note := 'Dismissed';
  elsif p_action = 'remove' then
    if r.target_kind = 'post' then delete from public.posts where id = r.target_id;
    elsif r.target_kind = 'comment' then delete from public.post_comments where id = r.target_id;
    elsif r.target_kind = 'message' then
      update public.messages set body = 'This message was removed by the PawTrack team.', kind = 'system' where id = r.target_id;
    else raise exception 'Accounts can be suspended, not removed.';
    end if;
    note := 'Removed';
  elsif p_action = 'suspend' then
    if not public.is_admin() then raise exception 'Only administrators can suspend accounts.'; end if;
    if author is null then raise exception 'That account no longer exists.'; end if;
    if (select role from public.profiles where id = author) <> 'client' then
      raise exception 'Staff accounts are managed on the Staff page.';
    end if;
    update public.profiles set status = 'suspended' where id = author;
    note := 'Account suspended';
  else
    raise exception 'Unknown action';
  end if;

  update public.reports
    set status = case when p_action = 'dismiss' then 'dismissed' else 'resolved' end,
        resolution = note, resolved_by = auth.uid(), resolved_at = now()
    where target_kind = r.target_kind and target_id = r.target_id and status = 'open';
  insert into public.activity_log (text) values ('Community report: ' || lower(note));
end;
$$;

-- Admin: list and restore suspended member accounts.
create or replace function public.suspended_members()
returns table (id uuid, username text, display_name text, avatar_url text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.created_at
  from public.profiles p
  where public.is_admin() and p.role = 'client' and p.status = 'suspended'
  order by p.display_name;
$$;

create or replace function public.restore_member(p_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Only administrators can restore accounts.'; end if;
  update public.profiles set status = 'active' where id = p_user and role = 'client' and status = 'suspended';
  if not found then raise exception 'No suspended member account found.'; end if;
  insert into public.activity_log (text) values ('Member account restored');
end;
$$;

-- ---- Function permissions ---------------------------------------------------
revoke execute on function public.notify_on_like() from public, anon, authenticated;
revoke execute on function public.notify_on_comment() from public, anon, authenticated;
revoke execute on function public.notify_on_follow() from public, anon, authenticated;
revoke execute on function public.on_message_sent() from public, anon, authenticated;

revoke execute on function public.my_notifications(int) from public, anon;
revoke execute on function public.mark_notifications_read() from public, anon;
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.start_dm(uuid) from public, anon;
revoke execute on function public.create_group(text, uuid[]) from public, anon;
revoke execute on function public.add_group_members(uuid, uuid[]) from public, anon;
revoke execute on function public.remove_group_member(uuid, uuid) from public, anon;
revoke execute on function public.rename_group(uuid, text) from public, anon;
revoke execute on function public.leave_group(uuid) from public, anon;
revoke execute on function public.my_conversations() from public, anon;
revoke execute on function public.chat_members(uuid) from public, anon;
revoke execute on function public.chat_messages(uuid, timestamptz, int) from public, anon;
revoke execute on function public.community_search(text) from public, anon;
revoke execute on function public.unread_counts() from public, anon;
revoke execute on function public.submit_report(text, uuid, text, text) from public, anon;
revoke execute on function public.staff_reports(text) from public, anon;
revoke execute on function public.resolve_report(uuid, text) from public, anon;
revoke execute on function public.suspended_members() from public, anon;
revoke execute on function public.restore_member(uuid) from public, anon;

grant execute on function public.my_notifications(int) to authenticated;
grant execute on function public.mark_notifications_read() to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.start_dm(uuid) to authenticated;
grant execute on function public.create_group(text, uuid[]) to authenticated;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
grant execute on function public.rename_group(uuid, text) to authenticated;
grant execute on function public.leave_group(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.chat_members(uuid) to authenticated;
grant execute on function public.chat_messages(uuid, timestamptz, int) to authenticated;
grant execute on function public.community_search(text) to authenticated;
grant execute on function public.unread_counts() to authenticated;
grant execute on function public.submit_report(text, uuid, text, text) to authenticated;
grant execute on function public.staff_reports(text) to authenticated;
grant execute on function public.resolve_report(uuid, text) to authenticated;
grant execute on function public.suspended_members() to authenticated;
grant execute on function public.restore_member(uuid) to authenticated;


-- ---- Comment replies, sharing posts into chats (see replies-and-sharing.sql) -----
-- ---- Comment replies (one level, like Instagram) ---------------------------
alter table public.post_comments add column if not exists parent_id uuid references public.post_comments (id) on delete cascade;
create index if not exists post_comments_parent_idx on public.post_comments (parent_id);

-- A reply must be on the same post; a reply to a reply joins the same thread.
create or replace function public.comment_parent_check()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p_post uuid;
  p_parent uuid;
begin
  if new.parent_id is null then return new; end if;
  select post_id, parent_id into p_post, p_parent from public.post_comments where id = new.parent_id;
  if p_post is null or p_post <> new.post_id then raise exception 'The comment you replied to was deleted.'; end if;
  if p_parent is not null then new.parent_id := p_parent; end if;
  return new;
end;
$$;
revoke execute on function public.comment_parent_check() from public, anon, authenticated;

drop trigger if exists comments_parent_trg on public.post_comments;
create trigger comments_parent_trg before insert on public.post_comments
for each row execute function public.comment_parent_check();

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('like', 'comment', 'follow', 'reply'));

-- Post owner: "commented". Person replied to: "replied to your comment".
-- Nobody gets two notifications for the same comment.
create or replace function public.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  post_author uuid;
  parent_author uuid;
begin
  select author_id into post_author from public.posts where id = new.post_id;
  if new.parent_id is not null then
    select author_id into parent_author from public.post_comments where id = new.parent_id;
  end if;
  if parent_author is not null and parent_author <> new.author_id then
    insert into public.notifications (user_id, actor_id, kind, post_id, comment_id)
    values (parent_author, new.author_id, 'reply', new.post_id, new.id);
  end if;
  if post_author is not null and post_author <> new.author_id and post_author is distinct from parent_author then
    insert into public.notifications (user_id, actor_id, kind, post_id, comment_id)
    values (post_author, new.author_id, 'comment', new.post_id, new.id);
  end if;
  return new;
end;
$$;

drop function if exists public.community_comments(uuid);
create function public.community_comments(p_post uuid)
returns table (
  id uuid, body text, created_at timestamptz, parent_id uuid,
  author_id uuid, username text, display_name text, avatar_url text, is_shelter boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.body, c.created_at, c.parent_id, a.id, a.username, a.display_name, a.avatar_url, a.role in ('staff', 'admin')
  from public.post_comments c
  join public.profiles a on a.id = c.author_id and a.status = 'active'
  where c.post_id = p_post
  order by c.created_at
  limit 1000;
$$;
grant execute on function public.community_comments(uuid) to anon, authenticated;

-- ---- Follow state on posts ---------------------------------------------------
drop function if exists public.community_posts(text, uuid, timestamptz, int, uuid);
create function public.community_posts(
  p_scope text default 'all',
  p_author uuid default null,
  p_before timestamptz default null,
  p_limit int default 20,
  p_id uuid default null
)
returns table (
  id uuid, body text, photo_url text, dog_id uuid, dog_name text, created_at timestamptz,
  author_id uuid, username text, display_name text, avatar_url text, is_shelter boolean,
  likes int, comments int, liked boolean, following_author boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.body, p.photo_url, p.dog_id, d.name, p.created_at,
         a.id, a.username, a.display_name, a.avatar_url, a.role in ('staff', 'admin'),
         (select count(*)::int from public.post_likes l where l.post_id = p.id),
         (select count(*)::int from public.post_comments c where c.post_id = p.id),
         exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
         exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = a.id)
  from public.posts p
  join public.profiles a on a.id = p.author_id and a.status = 'active'
  left join public.dogs d on d.id = p.dog_id and d.deleted_at is null and d.visible
  where (p_id is null or p.id = p_id)
    and (p_before is null or p.created_at < p_before)
    and case coalesce(p_scope, 'all')
          when 'following' then p.author_id = auth.uid()
            or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.author_id)
          when 'user' then p.author_id = p_author
          else true
        end
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
grant execute on function public.community_posts(text, uuid, timestamptz, int, uuid) to anon, authenticated;

-- ---- Sharing posts into chats ----------------------------------------------
alter table public.messages add column if not exists post_id uuid references public.posts (id) on delete set null;
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('text', 'system', 'post'));

drop policy if exists "members send messages" on public.messages;
create policy "members send messages" on public.messages
  for insert with check (
    sender_id = auth.uid() and public.is_member(conversation_id) and public.can_post()
    and ((kind = 'text' and post_id is null) or (kind = 'post' and post_id is not null))
  );

create or replace function public.on_message_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind <> 'system' and (
    select count(*) from public.messages
    where sender_id = new.sender_id and created_at > now() - interval '1 minute'
  ) >= 30 then
    raise exception 'You are sending messages too fast. Please slow down.';
  end if;
  update public.conversations set last_message_at = new.created_at where id = new.conversation_id;
  if new.sender_id is not null then
    update public.conversation_members set last_read_at = new.created_at
      where conversation_id = new.conversation_id and user_id = new.sender_id;
  end if;
  return new;
end;
$$;

drop function if exists public.chat_messages(uuid, timestamptz, int);
create function public.chat_messages(p_conv uuid, p_before timestamptz default null, p_limit int default 50)
returns table (
  id uuid, body text, kind text, created_at timestamptz,
  sender_id uuid, username text, display_name text, avatar_url text,
  post_id uuid, post_photo text, post_body text, post_username text, post_display_name text, post_avatar text
)
language sql
stable
security definer
set search_path = public
as $$
  select * from (
    select m.id, m.body, m.kind, m.created_at, m.sender_id, p.username, p.display_name, p.avatar_url,
           sp.id, sp.photo_url, left(sp.body, 140), sa.username, sa.display_name, sa.avatar_url
    from public.messages m
    left join public.profiles p on p.id = m.sender_id
    left join public.posts sp on sp.id = m.post_id
    left join public.profiles sa on sa.id = sp.author_id and sa.status = 'active'
    where m.conversation_id = p_conv and public.is_member(p_conv)
      and (p_before is null or m.created_at < p_before)
    order by m.created_at desc
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  ) x order by created_at;
$$;
revoke execute on function public.chat_messages(uuid, timestamptz, int) from public, anon;
grant execute on function public.chat_messages(uuid, timestamptz, int) to authenticated;

-- Unread counts include shared posts.
create or replace function public.my_conversations()
returns table (
  id uuid, is_group boolean, title text, member_count int,
  other_id uuid, other_username text, other_name text, other_avatar text, other_is_shelter boolean,
  last_body text, last_kind text, last_sender text, last_at timestamptz, unread int
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.is_group, c.title,
         (select count(*)::int from public.conversation_members x where x.conversation_id = c.id),
         o.id, o.username, o.display_name, o.avatar_url, o.role in ('staff', 'admin'),
         lm.body, lm.kind, ls.display_name, coalesce(lm.created_at, c.created_at),
         (select count(*)::int from public.messages m
            where m.conversation_id = c.id and m.created_at > me.last_read_at
              and m.sender_id is distinct from auth.uid() and m.kind <> 'system')
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  left join lateral (
    select p.* from public.conversation_members x join public.profiles p on p.id = x.user_id
    where not c.is_group and x.conversation_id = c.id and x.user_id <> auth.uid() limit 1
  ) o on true
  left join lateral (
    select m.* from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  left join public.profiles ls on ls.id = lm.sender_id
  where me.user_id = auth.uid()
    and (c.is_group or lm.id is not null or c.created_by = auth.uid())
  order by coalesce(lm.created_at, c.created_at) desc
  limit 200;
$$;

create or replace function public.unread_counts()
returns table (notifications int, chats int)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::int from public.notifications where user_id = auth.uid() and read_at is null),
    (select count(*)::int from public.conversation_members me
       where me.user_id = auth.uid()
         and exists (select 1 from public.messages m where m.conversation_id = me.conversation_id
                       and m.created_at > me.last_read_at and m.sender_id is distinct from auth.uid() and m.kind <> 'system'));
$$;

-- Shared posts can be reported like any message.
create or replace function public.submit_report(p_kind text, p_id uuid, p_reason text, p_details text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  what text;
  who text;
begin
  if not public.can_post() then raise exception 'Sign in to report.'; end if;
  if (select count(*) from public.reports where reporter_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You have sent many reports in the last hour. Please try again later.';
  end if;
  if p_kind = 'post' then
    select 'post by @' || a.username into what from public.posts p join public.profiles a on a.id = p.author_id where p.id = p_id;
  elsif p_kind = 'comment' then
    select 'comment by @' || a.username into what from public.post_comments c join public.profiles a on a.id = c.author_id where c.id = p_id;
  elsif p_kind = 'user' then
    select 'account @' || username into what from public.profiles where id = p_id and status = 'active' and id <> me;
  elsif p_kind = 'message' then
    select 'message by @' || a.username into what from public.messages m join public.profiles a on a.id = m.sender_id
      where m.id = p_id and m.kind <> 'system' and public.is_member(m.conversation_id);
  end if;
  if what is null then raise exception 'That can''t be reported.'; end if;

  insert into public.reports (reporter_id, target_kind, target_id, reason, details)
  values (me, p_kind, p_id, p_reason, left(trim(coalesce(p_details, '')), 500))
  on conflict do nothing;
  if not found then return; end if;

  select display_name into who from public.profiles where id = me;
  insert into public.inbox_messages (name, email, subject, body, kind)
  values (coalesce(who, 'A member'), '', 'Community report: ' || p_reason,
          coalesce(who, 'A member') || ' reported a ' || what || ' for "' || p_reason || '".'
          || case when trim(coalesce(p_details, '')) <> '' then E'\n\n' || left(trim(p_details), 500) else '' end
          || E'\n\nReview it on the Reports page of the staff desk.',
          'report');
end;
$$;


-- ---- Reposts (see reposts.sql) ---------------------------------------------------
create table if not exists public.reposts (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists reposts_created_idx on public.reposts (created_at desc);
create index if not exists reposts_user_idx on public.reposts (user_id, created_at desc);

-- Checks the post's author as definer (members can't read other profiles).
create or replace function public.can_repost(p_post uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_post() and exists (
    select 1 from public.posts p join public.profiles a on a.id = p.author_id
    where p.id = p_post and p.author_id <> auth.uid() and a.status = 'active'
  );
$$;
grant execute on function public.can_repost(uuid) to authenticated;
revoke execute on function public.can_repost(uuid) from public, anon;

alter table public.reposts enable row level security;
drop policy if exists "anyone read reposts" on public.reposts;
drop policy if exists "members repost" on public.reposts;
drop policy if exists "members undo repost" on public.reposts;
create policy "anyone read reposts" on public.reposts for select using (true);
create policy "members repost" on public.reposts for insert with check (user_id = auth.uid() and public.can_repost(post_id));
create policy "members undo repost" on public.reposts for delete using (user_id = auth.uid());
revoke all on public.reposts from anon, authenticated;
grant select on public.reposts to anon, authenticated;
grant insert, delete on public.reposts to authenticated;

-- "Maria reposted your post" (once per person and post).
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in ('like', 'comment', 'follow', 'reply', 'repost'));
drop index if exists public.notifications_once;
create unique index notifications_once on public.notifications
  (user_id, actor_id, kind, coalesce(post_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where kind in ('like', 'follow', 'repost');

create or replace function public.notify_on_repost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare author uuid;
begin
  if tg_op = 'INSERT' then
    select author_id into author from public.posts where id = new.post_id;
    if author is not null and author <> new.user_id then
      insert into public.notifications (user_id, actor_id, kind, post_id)
      values (author, new.user_id, 'repost', new.post_id)
      on conflict do nothing;
    end if;
    return new;
  end if;
  delete from public.notifications
    where kind = 'repost' and actor_id = old.user_id and post_id = old.post_id and read_at is null;
  return old;
end;
$$;
revoke execute on function public.notify_on_repost() from public, anon, authenticated;

drop trigger if exists reposts_notify_trg on public.reposts;
create trigger reposts_notify_trg after insert or delete on public.reposts
for each row execute function public.notify_on_repost();

-- Timeline: posts plus reposts, newest first. A repost row carries who reposted
-- it; item_at is when it appeared on the timeline (used for "load more").
drop function if exists public.community_posts(text, uuid, timestamptz, int, uuid);
create function public.community_posts(
  p_scope text default 'all',
  p_author uuid default null,
  p_before timestamptz default null,
  p_limit int default 20,
  p_id uuid default null
)
returns table (
  id uuid, body text, photo_url text, dog_id uuid, dog_name text, created_at timestamptz,
  author_id uuid, username text, display_name text, avatar_url text, is_shelter boolean,
  likes int, comments int, liked boolean, following_author boolean,
  reposts int, reposted boolean, item_at timestamptz,
  reposted_by_id uuid, reposted_by_username text, reposted_by_name text
)
language sql
stable
security definer
set search_path = public
as $$
  with items as (
    select p.id as post_id, p.created_at as item_at, null::uuid as by_id
    from public.posts p
    where (p_id is null or p.id = p_id)
      and case coalesce(p_scope, 'all')
            when 'following' then p.author_id = auth.uid()
              or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.author_id)
            when 'user' then p.author_id = p_author
            else true
          end
    union all
    select r.post_id, r.created_at, r.user_id
    from public.reposts r
    where p_id is null
      and coalesce(p_scope, 'all') in ('all', 'following')
      and (coalesce(p_scope, 'all') = 'all'
           or r.user_id = auth.uid()
           or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = r.user_id))
  )
  select p.id, p.body, p.photo_url, p.dog_id, d.name, p.created_at,
         a.id, a.username, a.display_name, a.avatar_url, a.role in ('staff', 'admin'),
         (select count(*)::int from public.post_likes l where l.post_id = p.id),
         (select count(*)::int from public.post_comments c where c.post_id = p.id),
         exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = auth.uid()),
         exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = a.id),
         (select count(*)::int from public.reposts r where r.post_id = p.id),
         exists (select 1 from public.reposts r where r.post_id = p.id and r.user_id = auth.uid()),
         i.item_at,
         rb.id, rb.username, rb.display_name
  from items i
  join public.posts p on p.id = i.post_id
  join public.profiles a on a.id = p.author_id and a.status = 'active'
  left join public.profiles rb on rb.id = i.by_id
  left join public.dogs d on d.id = p.dog_id and d.deleted_at is null and d.visible
  where (p_before is null or i.item_at < p_before)
    and (i.by_id is null or rb.status = 'active')
  order by i.item_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
grant execute on function public.community_posts(text, uuid, timestamptz, int, uuid) to anon, authenticated;
