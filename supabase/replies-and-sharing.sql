-- =============================================================================
-- PawTrack — comment replies, sharing posts into chats, follow state on posts
-- Run once in the Supabase SQL Editor after social.sql. New databases created
-- from schema.sql already have it.
-- =============================================================================

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
