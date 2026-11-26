-- =============================================================================
-- PawTrack — Community notifications, messages (1:1 and groups) and reports
-- Run once in the Supabase SQL Editor after community.sql. New databases
-- created from schema.sql already have it.
-- =============================================================================

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
