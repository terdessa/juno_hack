-- Bookings made in Calendly.
--
-- The call agent books people there, so the doctor's diary in this app has to
-- be fed by it or it is lying. Same table as the clinic's own appointments:
-- from the doctor's side "I am seeing someone at ten" is one fact regardless
-- of which system took the booking.
--
-- patient_id becomes nullable, which is the important part. Calendly knows an
-- invitee by name and email, and that will sometimes not match anyone on the
-- list — a relative booking on someone's behalf, a new patient, a typo. An
-- appointment we can't attribute still has to appear in the diary, because the
-- failure we cannot afford is a doctor with someone in the waiting room and a
-- blank calendar.

alter table public.bookings
  alter column patient_id drop not null;

alter table public.bookings
  add column if not exists source text not null default 'clinic'
    check (source in ('clinic', 'calendly')),
  -- Calendly's invitee URI. Unique so a retried delivery updates the row it
  -- already wrote instead of booking the same person twice.
  add column if not exists external_id text,
  add column if not exists invitee_name text,
  add column if not exists invitee_email text,
  add column if not exists status text not null default 'confirmed'
    check (status in ('confirmed', 'cancelled'));

create unique index if not exists bookings_external_id_key
  on public.bookings (external_id)
  where external_id is not null;

grant select, insert, update, delete on public.bookings to service_role;
grant select on public.bookings to anon, authenticated;
