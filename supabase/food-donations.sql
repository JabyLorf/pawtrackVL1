-- =============================================================================
-- PawTrack — food and supplies donations
-- Run once in the Supabase SQL Editor. New databases created from schema.sql
-- already have it.
--
-- A food/supplies donation is a donation with method 'In-kind Donation': it
-- lists the items, whether the donor drops them off or wants them picked up,
-- a phone number and a preferred date. Its peso value is optional (0 = not given)
-- and it never counts toward the money totals.
-- =============================================================================

alter table public.donations add column if not exists items text not null default '';
alter table public.donations add column if not exists delivery text not null default '';
alter table public.donations add column if not exists phone text not null default '';
alter table public.donations add column if not exists preferred_date date;

alter table public.donations drop constraint if exists donations_items_len;
alter table public.donations add constraint donations_items_len check (length(items) <= 1000);
alter table public.donations drop constraint if exists donations_delivery_check;
alter table public.donations add constraint donations_delivery_check check (delivery in ('', 'Drop off', 'Pick up'));
alter table public.donations drop constraint if exists donations_phone_len;
alter table public.donations add constraint donations_phone_len check (length(phone) <= 40);

-- Money must be more than zero; goods may leave the value at zero.
alter table public.donations drop constraint if exists donations_amount_check;
alter table public.donations add constraint donations_amount_check
  check (amount > 0 or (method = 'In-kind Donation' and amount >= 0));
-- Goods must say what they are (older rows are left as they were).
alter table public.donations drop constraint if exists donations_goods_items;
alter table public.donations add constraint donations_goods_items
  check (method <> 'In-kind Donation' or length(trim(items)) > 0) not valid;
-- A pick-up needs a phone number to arrange it.
alter table public.donations drop constraint if exists donations_pickup_phone;
alter table public.donations add constraint donations_pickup_phone
  check (delivery <> 'Pick up' or length(trim(phone)) >= 7) not valid;

create or replace function public.on_donation_inserted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  amt text := trim(to_char(new.amount, '999,999,999.00'));
  goods boolean := new.method = 'In-kind Donation';
begin
  if goods then
    insert into public.inbox_messages (name, email, subject, body, kind, dog_id)
    values (
      new.name,
      new.email,
      'Food & supplies donation: ' || left(new.items, 60) || case when length(new.items) > 60 then '…' else '' end,
      new.name || ' wants to donate: ' || new.items || '.' ||
        case when new.delivery = 'Pick up' then ' Please pick it up.' when new.delivery = 'Drop off' then ' They will drop it off at the shelter.' else '' end ||
        case when new.preferred_date is not null then ' Preferred date: ' || to_char(new.preferred_date, 'Mon DD, YYYY') || '.' else '' end ||
        case when new.phone <> '' then ' Phone: ' || new.phone || '.' else '' end ||
        case when new.amount > 0 then ' Estimated value: ₱' || amt || '.' else '' end ||
        case when new.message <> '' then ' Note: ' || new.message else '' end ||
        ' Confirm it on the Donations page once the items arrive.',
      'donation',
      new.dog_id
    );
    insert into public.activity_log (text) values ('Food & supplies donation offered by ' || new.name);
    return new;
  end if;

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

create or replace function public.decide_donation(p_id uuid, p_confirm boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.donations%rowtype;
  what text;
begin
  if not public.is_staff() then raise exception 'Only staff can confirm donations'; end if;
  select * into d from public.donations where id = p_id;
  if d.id is null then raise exception 'Donation not found'; end if;
  update public.donations
    set status = case when p_confirm then 'confirmed' else 'rejected' end::public.donation_status,
        decided_at = now(),
        decided_by = auth.uid()
    where id = p_id;
  what := case when d.method = 'In-kind Donation' then 'food & supplies (' || left(d.items, 60) || ')'
               else '₱' || trim(to_char(d.amount, '999,999,999.00')) end;
  insert into public.activity_log (text)
  values (case when p_confirm then 'Donation confirmed: ' else 'Donation rejected: ' end || what || ' from ' || d.name);
end;
$$;

-- Admin edits: goods may keep a value of zero.
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
  if p_amount is null or p_amount < 0 or p_amount > 999999.99
     or (p_amount = 0 and p_method <> 'In-kind Donation') then
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
