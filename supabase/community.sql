-- =============================================================================
-- PawTrack — Community (the shelter's own social feed)
-- Run once in the Supabase SQL Editor on a database created before this
-- feature. New databases created from schema.sql already have it.
--
-- Anyone can create a member account (role 'client', active straight away,
-- no access to the staff desk) to post photos, like, comment and follow.
-- Staff and admins use the same feed and are shown with a "Shelter" badge.
-- Email addresses are never exposed: the public reads people through the
-- community_* functions, which return only public profile fields.
-- =============================================================================

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
