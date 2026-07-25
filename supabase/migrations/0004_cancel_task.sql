-- Declining a queued call.
--
-- A status rather than a delete. The scheduler dials anything still `queued`
-- and dispatchTask claims on the same predicate, so moving the row out of that
-- state is what actually stops the phone ringing — and it stays reversible,
-- which matters for a destructive-feeling action taken mid-clinic. Deleting
-- the row would also take the reason the call ever existed with it.

alter table public.tasks drop constraint if exists tasks_status_check;

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('queued', 'calling', 'completed', 'failed', 'cancelled'));
