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
  create type public.user_role as enum ('client', 'staff', 'admin', 'volunteer');
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
  create type public.message_kind as enum ('contact', 'adoption', 'donation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.report_status as enum ('pending', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.media_type as enum ('photo', 'video');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  display_name text not null,
  email text,
  role public.user_role not null default 'client',
  status public.account_status not null default 'active',
  bio text not null default '',
  avatar_url text not null default '',
  avatar_hue integer not null default 200,
  private_account boolean not null default false,
  followers_count integer not null default 0,
  following_count integer not null default 0,
  likes_total integer not null default 0,
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
  owner_id uuid references public.profiles (id) on delete set null,
  mother_id uuid references public.dogs (id) on delete set null,
  intake_at timestamptz not null default now(),
  died_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dogs_status_idx on public.dogs (status);
create index if not exists dogs_mother_idx on public.dogs (mother_id);
create index if not exists dogs_owner_idx on public.dogs (owner_id);
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
  user_id uuid references public.profiles (id) on delete set null,
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
-- Community
-- -----------------------------------------------------------------------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  media_url text not null default '',
  media_type public.media_type not null default 'photo',
  caption text not null default '',
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  reposts_count integer not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  parent_id uuid references public.comments (id) on delete cascade,
  text text not null,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);

create table if not exists public.follows (
  id uuid primary key default gen_random_uuid(),
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  to_user_id uuid not null references public.profiles (id) on delete cascade,
  from_user_id uuid references public.profiles (id) on delete set null,
  text text not null,
  type text not null default '',
  post_id uuid references public.posts (id) on delete cascade,
  dog_id uuid references public.dogs (id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  target text not null default 'post',
  post_id uuid references public.posts (id) on delete cascade,
  comment_id uuid references public.comments (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete set null,
  reported_by uuid references public.profiles (id) on delete set null,
  reason text not null default 'Spam',
  status public.report_status not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.reposts (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread text not null,
  from_id uuid not null references public.profiles (id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_thread_idx on public.chat_messages (thread, created_at);

-- -----------------------------------------------------------------------------
-- Auth → profile
-- -----------------------------------------------------------------------------
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
  insert into public.profiles (id, username, display_name, email, role, status, avatar_hue)
  values (
    new.id,
    uname,
    coalesce(new.raw_user_meta_data->>'display_name', uname),
    new.email,
    'client',
    'active',
    floor(random() * 360)::int
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
    set status = 'Adopted', owner_id = rec.user_id
    where id = rec.dog_id;
  if rec.user_id is not null then
    insert into public.notifications (to_user_id, text, type, dog_id)
    values (rec.user_id, 'approved your adoption of this dog', 'adopt', rec.dog_id);
  end if;
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
  if rec.user_id is not null then
    insert into public.notifications (to_user_id, text, type, dog_id)
    values (rec.user_id, 'did not approve your adoption of this dog', 'adopt', rec.dog_id);
  end if;
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
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.comment_likes enable row level security;
alter table public.follows enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;
alter table public.reposts enable row level security;
alter table public.chat_messages enable row level security;

-- Profiles
drop policy if exists "profiles are readable" on public.profiles;
create policy "profiles are readable" on public.profiles
  for select using (true);

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

-- Adoptions: anyone can apply; staff manage; users see own
drop policy if exists "anyone apply adopt" on public.adoptions;
create policy "anyone apply adopt" on public.adoptions
  for insert with check (true);

drop policy if exists "own adoptions readable" on public.adoptions;
create policy "own adoptions readable" on public.adoptions
  for select using (user_id = auth.uid() or public.is_staff());

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

-- Community posts
drop policy if exists "read unhidden posts" on public.posts;
create policy "read unhidden posts" on public.posts
  for select using (hidden = false or user_id = auth.uid() or public.is_staff());

drop policy if exists "auth create posts" on public.posts;
create policy "auth create posts" on public.posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "own or staff posts" on public.posts;
create policy "own or staff posts" on public.posts
  for update using (user_id = auth.uid() or public.is_staff());

drop policy if exists "read comments" on public.comments;
create policy "read comments" on public.comments
  for select using (hidden = false or user_id = auth.uid() or public.is_staff());

drop policy if exists "auth comment" on public.comments;
create policy "auth comment" on public.comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "read likes" on public.post_likes;
create policy "read likes" on public.post_likes for select using (true);

drop policy if exists "auth like" on public.post_likes;
create policy "auth like" on public.post_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "auth unlike" on public.post_likes;
create policy "auth unlike" on public.post_likes
  for delete using (auth.uid() = user_id);

drop policy if exists "read comment likes" on public.comment_likes;
create policy "read comment likes" on public.comment_likes for select using (true);

drop policy if exists "auth comment like" on public.comment_likes;
create policy "auth comment like" on public.comment_likes
  for insert with check (auth.uid() = user_id);

drop policy if exists "auth comment unlike" on public.comment_likes;
create policy "auth comment unlike" on public.comment_likes
  for delete using (auth.uid() = user_id);

drop policy if exists "read follows" on public.follows;
create policy "read follows" on public.follows for select using (true);

drop policy if exists "auth follow" on public.follows;
create policy "auth follow" on public.follows
  for insert with check (auth.uid() = follower_id);

drop policy if exists "auth unfollow" on public.follows;
create policy "auth unfollow" on public.follows
  for delete using (auth.uid() = follower_id);

drop policy if exists "own notifications" on public.notifications;
create policy "own notifications" on public.notifications
  for select using (to_user_id = auth.uid() or public.is_staff());

drop policy if exists "update own notifications" on public.notifications;
create policy "update own notifications" on public.notifications
  for update using (to_user_id = auth.uid());

drop policy if exists "auth report" on public.reports;
create policy "auth report" on public.reports
  for insert with check (auth.uid() = reported_by);

drop policy if exists "staff reports" on public.reports;
create policy "staff reports" on public.reports
  for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists "read reposts" on public.reposts;
create policy "read reposts" on public.reposts for select using (true);

drop policy if exists "auth repost" on public.reposts;
create policy "auth repost" on public.reposts
  for insert with check (auth.uid() = user_id);

drop policy if exists "auth unrepost" on public.reposts;
create policy "auth unrepost" on public.reposts
  for delete using (auth.uid() = user_id);

drop policy if exists "auth notify" on public.notifications;
create policy "auth notify" on public.notifications
  for insert with check (auth.uid() = from_user_id);

drop policy if exists "read chats" on public.chat_messages;
create policy "read chats" on public.chat_messages
  for select using (auth.uid() is not null);

drop policy if exists "auth chat" on public.chat_messages;
create policy "auth chat" on public.chat_messages
  for insert with check (auth.uid() = from_id);

-- -----------------------------------------------------------------------------
-- Storage buckets
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('dog-photos', 'dog-photos', true),
  ('avatars', 'avatars', true),
  ('post-media', 'post-media', true),
  ('id-photos', 'id-photos', false)
on conflict (id) do nothing;

drop policy if exists "public read dog photos" on storage.objects;
create policy "public read dog photos" on storage.objects
  for select using (bucket_id = 'dog-photos');

drop policy if exists "staff write dog photos" on storage.objects;
create policy "staff write dog photos" on storage.objects
  for all using (bucket_id = 'dog-photos' and public.is_staff())
  with check (bucket_id = 'dog-photos' and public.is_staff());

drop policy if exists "public read avatars" on storage.objects;
create policy "public read avatars" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "auth write avatars" on storage.objects;
create policy "auth write avatars" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.uid() is not null);

drop policy if exists "public read posts media" on storage.objects;
create policy "public read posts media" on storage.objects
  for select using (bucket_id = 'post-media');

drop policy if exists "auth write posts media" on storage.objects;
create policy "auth write posts media" on storage.objects
  for insert with check (bucket_id = 'post-media' and auth.uid() is not null);

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
