# Plan 1: Website Backend (Supabase + API layer)

Owner: backend track. Integrates with the agent call workflow (Plan 2)
purely through Supabase tables — no direct calls between the two tracks
except via webhooks noted below.

## Goal

Everything the dashboard needs to read/write, minus the call itself:
patient records, task creation via the copilot, and a trigger to kick off
a call. Frontend is scraped from Lovable and wired to this.

## Schema (Supabase, `supabase/migrations/0001_init.sql`)

- `patients` — id, name, dob, last_seen_at, status (active/archived), notes,
  vaccinations (jsonb), other record fields.
- `tasks` — id, patient_id, instruction_raw, questions (jsonb), due_at,
  status (pending/in_progress/done), urgency, created_at.
- `calls` — id, task_id, started_at, ended_at, transcript, extracted_answers
  (jsonb), mood_score, status.
- `bookings` — id, patient_id, task_id, calendar_event_id, start_at, end_at.

Realtime enabled on `tasks` and `calls` so the dashboard updates live
without polling. No RLS needed for the demo (single doctor, no multi-tenant
data) — flip on later if genuinely needed.

## Steps

1. Create Supabase project, apply schema migration.
2. Seed 4-5 demo patients with varied `last_seen_at` dates (for the
   recency-sort demo) and 1-2 pre-existing tasks/calls so the dashboard
   isn't empty on first load.
3. Build the copilot endpoint (Supabase Edge Function, `POST /copilot`):
   - Input: raw doctor instruction (text, or transcribed voice — voice
     transcription can reuse ElevenLabs/OpenAI, doesn't need to be built
     here).
   - Calls OpenAI/Anthropic with structured output to extract: patient
     (match by name against `patients`), questions to ask, due_at, urgency.
   - Inserts the row into `tasks`.
4. Build the "run now" endpoint (`POST /tasks/:id/run`):
   - Fires a webhook to n8n (Plan 2's entry point) with the task id.
   - Marks task `status = in_progress`.
5. Wire the scraped Lovable frontend to Supabase client (read `patients`,
   `tasks`, `calls`, subscribe to realtime) and to the two endpoints above.
6. End-to-end check: type an instruction in the copilot box → task appears
   in the list → click run → confirm the n8n webhook fires (stub the
   receiving end until Plan 2 is ready, just check it lands).

## Explicitly not building here

- Auth/login.
- Manual task creation form.
- Archiving/deleting patients beyond a simple status flag.
- Anything calendar or mood related — that's written by Plan 2's workflow,
  this track only needs to read and display it.
