-- Two fixes for the Google Calendar sync, both of which silently lost every
-- incoming event.

-- 1. The arbiter index behind ON CONFLICT (calendar_event_id) must not be
--    partial. Postgres infers it from the column list and will not consider a
--    partial index unless the statement repeats the predicate, which
--    PostgREST's upsert cannot express. The partial version failed every
--    pulled event with "there is no unique or exclusion constraint matching
--    the ON CONFLICT specification", while the push path — a plain UPDATE —
--    kept working. One direction healthy, the other dropping everything.
--
--    A plain unique index is correct anyway: Postgres treats NULLs as
--    distinct, so any number of bookings may still have no Google event.
drop index if exists bookings_calendar_event_id_key;
create unique index if not exists bookings_calendar_event_id_key
  on public.bookings (calendar_event_id);

-- 2. The calendar page subscribes to `bookings` and never heard anything.
--    0001 published `tasks` and `calls`, 0005 added `inbox_items`, but
--    `bookings` was never added — so a booking written by the sync landed in
--    the database while the open dashboard showed a stale calendar and no
--    error, which is the worst shape a failure can take here.
alter publication supabase_realtime add table public.bookings;
