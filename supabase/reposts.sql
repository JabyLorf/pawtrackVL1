-- =============================================================================
-- PawTrack — reposts
-- Run once in the Supabase SQL Editor after replies-and-sharing.sql. New
-- databases created from schema.sql already have it.
--
-- Reposting puts someone else's post back on the timeline ("Maria reposted"),
-- for everyone on "For you" and for the reposter's followers on "Following".
-- =============================================================================

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
