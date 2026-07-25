-- The inbox.
--
-- A call can end well and still leave something a doctor has to do — "I'm fine,
-- but I've run out of my tablets" is a good call and a prescription request.
-- The summary already says that, but a summary is something you read when you
-- open a call, and the whole point of this product is that nothing waits for
-- someone to remember to look.
--
-- So this table holds only the things that need a person: what it is, what the
-- patient actually said, and whether it has been dealt with. A routine call
-- where everything was fine produces no rows at all. That restraint is the
-- feature — an inbox that catches everything is one nobody reads.

create table if not exists public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id),
  -- Where it came from. Nullable so an item can outlive the call it came from,
  -- and so one could later be raised by something other than a call.
  call_id uuid references public.calls (id) on delete set null,
  task_id uuid references public.tasks (id) on delete set null,
  kind text not null check (kind in (
    'prescription',
    'appointment-request',
    'symptom-concern',
    'medication-issue',
    'safeguarding',
    'low-mood',
    'callback-request',
    'other'
  )),
  -- What the doctor needs to do, in a few words.
  title text not null,
  -- The evidence, in the patient's own terms. Without this the doctor has to
  -- open the transcript to know whether the flag is real.
  detail text,
  urgency text not null default 'routine' check (urgency in ('routine', 'soon', 'urgent')),
  status text not null default 'open' check (status in ('open', 'done', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- Every read is "what is still open, newest first".
create index if not exists inbox_items_open_idx
  on public.inbox_items (status, created_at desc);

grant select, insert, update, delete on public.inbox_items to service_role;
grant select on public.inbox_items to anon, authenticated;

alter publication supabase_realtime add table public.inbox_items;
