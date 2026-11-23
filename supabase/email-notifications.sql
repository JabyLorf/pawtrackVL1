-- =============================================================================
-- PawTrack — email the admin about every new inbox message
-- (contact messages, adoption applications, donations, staff applications).
--
-- Before running:
--   1. Deploy the edge function in supabase/functions/notify-admin
--      (no JWT check: `supabase functions deploy notify-admin --no-verify-jwt`).
--   2. Replace YOUR-PROJECT-REF below with your project ref
--      (the part before .supabase.co in your project URL).
--   3. Set the RESEND_API_KEY secret (Edge Functions → Secrets).
-- =============================================================================

create extension if not exists pg_net;

alter table public.inbox_messages add column if not exists notified_at timestamptz;

create or replace function public.notify_admin_of_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/notify-admin',
    body := jsonb_build_object('id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end;
$$;

drop trigger if exists inbox_notify_admin on public.inbox_messages;
create trigger inbox_notify_admin
after insert on public.inbox_messages
for each row execute function public.notify_admin_of_message();

-- -----------------------------------------------------------------------------
-- Replies sent from the staff Inbox. The notify-admin function emails the
-- sender and records the reply here; staff can read the history.
-- -----------------------------------------------------------------------------
create table if not exists public.inbox_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.inbox_messages (id) on delete cascade,
  body text not null,
  sent_by uuid references public.profiles (id) on delete set null,
  sent_by_name text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists inbox_replies_message_idx on public.inbox_replies (message_id, created_at);

alter table public.inbox_replies enable row level security;

drop policy if exists "staff read replies" on public.inbox_replies;
create policy "staff read replies" on public.inbox_replies
  for select using (public.is_staff());
