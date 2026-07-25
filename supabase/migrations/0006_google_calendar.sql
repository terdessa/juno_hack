-- The doctor's Google Calendar and the clinic diary here are the same thing.
--
-- An appointment the call agent books appears in Google; anything added in
-- Google appears here. Same `bookings` table as before — from the doctor's
-- side "I'm seeing someone at ten" is one fact whichever system took it.
--
-- patient_id is nullable, which is the part that matters. Google knows an
-- attendee by name and email and that won't always match anyone on the list —
-- a relative booking on someone's behalf, a new patient, a typo. An
-- appointment nobody can attribute still has to appear in the diary, because
-- the failure we cannot afford is a doctor with someone in the waiting room
-- and a blank calendar.
--
-- `calendar_event_id` has been on this table since 0001 and unused; it is
-- Google's event id now. Unique so a sync that runs twice updates the row it
-- already wrote rather than booking the same person again.

alter table public.bookings
  alter column patient_id drop not null;

alter table public.bookings
  add column if not exists source text not null default 'clinic',
  add column if not exists invitee_name text,
  add column if not exists invitee_email text,
  add column if not exists status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled'));

alter table public.bookings drop constraint if exists bookings_source_check;
alter table public.bookings
  add constraint bookings_source_check check (source in ('clinic', 'google'));

create unique index if not exists bookings_calendar_event_id_key
  on public.bookings (calendar_event_id)
  where calendar_event_id is not null;

-- Where the incremental sync keeps its place. Google hands back a syncToken
-- with every list; presenting it next time returns only what changed, which is
-- the difference between a cron job that costs nothing and one that re-reads
-- the whole calendar every minute.
create table if not exists public.sync_state (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);

grant select, insert, update, delete on public.bookings to service_role;
grant select on public.bookings to anon, authenticated;
grant select, insert, update, delete on public.sync_state to service_role;
