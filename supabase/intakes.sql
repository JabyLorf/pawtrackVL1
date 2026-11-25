-- =============================================================================
-- PawTrack — intake records
-- Run once in the Supabase SQL Editor on a database created before this
-- feature. New databases created from schema.sql already have it.
--
-- Dogs that just arrived and can't be adopted yet (injured, sick, quarantine…)
-- are recorded in their own table, separate from the adoptable dogs. Staff only:
-- the public website never reads it. "Ready for adoption" moves a record into
-- public.dogs; "Mark deceased" moves it into the mortality records.
-- =============================================================================

create table if not exists public.intakes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  sex public.dog_sex not null default 'Female',
  age public.dog_age not null default 'Young Adult',
  breed text not null default 'Aspin',
  color text not null default '',
  size public.dog_size not null default 'Medium',
  photo_url text not null default '',
  reason text not null default 'Under treatment'
    check (reason in ('Under treatment', 'Injured', 'Sick', 'Quarantine', 'Too young', 'Behavior assessment', 'Other')),
  found_at text not null default '',
  rescued_by text not null default '',
  notes text not null default '',
  temperament text not null default '',
  vax_5in1 boolean not null default false,
  anti_rabies boolean not null default false,
  dewormed boolean not null default false,
  spayed boolean not null default false,
  intake_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Filled in when the dog leaves intake.
  moved_at timestamptz,
  moved_to text check (moved_to in ('Available', 'Deceased')),
  moved_dog_id uuid references public.dogs (id) on delete set null
);

create index if not exists intakes_open_idx on public.intakes (intake_at desc) where moved_at is null;

create or replace function public.intakes_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists intakes_touch_trg on public.intakes;
create trigger intakes_touch_trg
before update on public.intakes
for each row execute function public.intakes_touch();

alter table public.intakes enable row level security;

drop policy if exists "staff read intakes" on public.intakes;
drop policy if exists "staff add intakes" on public.intakes;
drop policy if exists "staff edit intakes" on public.intakes;
drop policy if exists "admin delete intakes" on public.intakes;
create policy "staff read intakes" on public.intakes
  for select using (public.is_staff());
create policy "staff add intakes" on public.intakes
  for insert with check (public.is_staff() and moved_at is null);
-- Records that already left intake are history and can't be edited.
create policy "staff edit intakes" on public.intakes
  for update using (public.is_staff() and moved_at is null) with check (public.is_staff() and moved_at is null);
create policy "admin delete intakes" on public.intakes
  for delete using (public.is_admin() and moved_at is null);

revoke all on public.intakes from anon;
grant select, insert, update, delete on public.intakes to authenticated;

-- Move an intake record out: 'Available' (up for adoption) or 'Deceased'.
-- Returns the new dog's id.
create or replace function public.finish_intake(p_id uuid, p_outcome text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.intakes%rowtype;
  new_id uuid;
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  if p_outcome not in ('Available', 'Deceased') then raise exception 'Unknown outcome'; end if;
  select * into r from public.intakes where id = p_id for update;
  if r.id is null then raise exception 'Intake record not found'; end if;
  if r.moved_at is not null then raise exception '% already left intake', r.name; end if;

  insert into public.dogs (name, sex, age, breed, color, size, photo_url, status,
                           vax_5in1, anti_rabies, dewormed, spayed, temperament, story,
                           visible, intake_at, died_at)
  values (r.name, r.sex, r.age, r.breed, r.color, r.size, r.photo_url, p_outcome::public.dog_status,
          r.vax_5in1, r.anti_rabies, r.dewormed, r.spayed, r.temperament, '',
          p_outcome = 'Available', r.intake_at, case when p_outcome = 'Deceased' then now() end)
  returning id into new_id;

  update public.intakes
    set moved_at = now(), moved_to = p_outcome, moved_dog_id = new_id
    where id = p_id;

  insert into public.activity_log (text)
  values (case when p_outcome = 'Available'
               then r.name || ' moved from intake to adoption'
               else r.name || ' died in intake' end);
  return new_id;
end;
$$;

revoke execute on function public.finish_intake(uuid, text) from public, anon;
grant execute on function public.finish_intake(uuid, text) to authenticated;
