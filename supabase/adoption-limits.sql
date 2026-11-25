-- =============================================================================
-- PawTrack — adoption request limit + editable donations
-- Run once in the Supabase SQL Editor on a database created before this
-- feature. New databases created from schema.sql already have it.
--
-- Adoptions: a dog stays listed while applications are reviewed ("Finalizing")
-- and takes at most 5 pending applications. Approving one closes the others.
-- Donations: amounts are capped at 6 digits and admins can correct mistakes.
-- =============================================================================

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
