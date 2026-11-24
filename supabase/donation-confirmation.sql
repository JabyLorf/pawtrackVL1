-- =============================================================================
-- PawTrack — donations are confirmed by staff before they count
-- Run once in the Supabase SQL Editor on a database created before this
-- feature. New databases created from schema.sql already have it.
--
-- Donors pay with the GCash QR on the Donate page, then submit the amount and
-- GCash reference number (and optionally a receipt screenshot). The donation
-- waits as "pending" until staff check GCash and confirm or reject it. Only
-- confirmed donations count in the totals.
-- =============================================================================

alter type public.donation_method add value if not exists 'GoTyme' after 'GCash';

do $$ begin
  create type public.donation_status as enum ('pending', 'confirmed', 'rejected');
exception when duplicate_object then null; end $$;

alter table public.donations add column if not exists status public.donation_status not null default 'pending';
alter table public.donations add column if not exists reference_no text not null default '';
alter table public.donations add column if not exists receipt_path text not null default '';
alter table public.donations add column if not exists anonymous boolean not null default false;
alter table public.donations add column if not exists decided_at timestamptz;
alter table public.donations add column if not exists decided_by uuid references public.profiles (id) on delete set null;
create index if not exists donations_status_idx on public.donations (status, created_at desc);

-- Visitors can only submit pending donations; staff decide the rest.
drop policy if exists "anyone donate" on public.donations;
create policy "anyone donate" on public.donations
  for insert with check (status = 'pending' and decided_at is null and decided_by is null);

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

-- Inbox/email note now says the donation still needs checking.
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

-- Optional receipt screenshots: anyone can upload, only staff can view.
insert into storage.buckets (id, name, public)
values ('donation-receipts', 'donation-receipts', false)
on conflict (id) do nothing;

drop policy if exists "anyone upload donation receipts" on storage.objects;
create policy "anyone upload donation receipts" on storage.objects
  for insert with check (bucket_id = 'donation-receipts');

drop policy if exists "staff read donation receipts" on storage.objects;
create policy "staff read donation receipts" on storage.objects
  for select using (bucket_id = 'donation-receipts' and public.is_staff());

-- -----------------------------------------------------------------------------
-- Thank-you emails to donors who leave an email address: one when they submit,
-- one when staff confirm. Sent by the notify-admin function (see
-- email-notifications.sql; replace YOUR-PROJECT-REF below too).
-- -----------------------------------------------------------------------------
alter table public.donations add column if not exists thanked_at timestamptz;
alter table public.donations add column if not exists confirmed_email_at timestamptz;

create or replace function public.email_donor()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.email, '') = '' then return new; end if;
  if tg_op = 'INSERT' or (old.status is distinct from new.status and new.status = 'confirmed') then
    perform net.http_post(
      url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/notify-admin',
      body := jsonb_build_object('donation_id', new.id, 'event', case when tg_op = 'INSERT' then 'received' else 'confirmed' end),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end;
$$;

drop trigger if exists donation_email_donor on public.donations;
create trigger donation_email_donor
after insert or update of status on public.donations
for each row execute function public.email_donor();
