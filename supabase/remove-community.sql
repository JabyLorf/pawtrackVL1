-- Removes the Community (social media) feature from an EXISTING PawTrack database.
-- Only needed if you already ran an older schema.sql that created the community tables.
-- WARNING: this permanently deletes all posts, comments, likes, follows, reposts,
-- chat messages, notifications and reports. Back up first if you need them.

-- Adoption RPCs without the community notifications
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
    'client',
    'active'
  );
  return new;
end;
$$;

-- Community tables
drop table if exists public.chat_messages;
drop table if exists public.reposts;
drop table if exists public.reports;
drop table if exists public.notifications;
drop table if exists public.follows;
drop table if exists public.comment_likes;
drop table if exists public.post_likes;
drop table if exists public.comments;
drop table if exists public.posts;

drop type if exists public.report_status;
drop type if exists public.media_type;

-- Social profile fields
alter table public.profiles
  drop column if exists bio,
  drop column if exists avatar_url,
  drop column if exists avatar_hue,
  drop column if exists private_account,
  drop column if exists followers_count,
  drop column if exists following_count,
  drop column if exists likes_total;

-- Storage policies for the community buckets
drop policy if exists "public read avatars" on storage.objects;
drop policy if exists "auth write avatars" on storage.objects;
drop policy if exists "public read posts media" on storage.objects;
drop policy if exists "auth write posts media" on storage.objects;

-- The `avatars` and `post-media` buckets themselves: delete them in the
-- Supabase dashboard under Storage (empty each bucket, then delete it).
