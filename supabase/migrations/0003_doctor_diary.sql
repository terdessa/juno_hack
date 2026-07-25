-- The doctor's own diary lives in `bookings`, which already had the right
-- shape: a patient, a start and an end, and a nullable task_id so an ordinary
-- clinic appointment and a follow-up Medley booked off the back of a call are
-- the same kind of row. It only lacked a way to say what the appointment is.
--
-- Two calendars, one table. The calendar page separates them by asking whether
-- a row came from a task or was already in the diary — not by storing the
-- answer twice.

alter table public.bookings
  add column if not exists reason text,
  add column if not exists kind text not null default 'appointment'
    check (kind in ('appointment', 'review', 'test', 'vaccination', 'home-visit'));

-- The calendar reads a week at a time, always ordered by start.
create index if not exists bookings_start_at_idx on public.bookings (start_at);

grant select, insert, update, delete on public.bookings to service_role;
grant select on public.bookings to anon, authenticated;
