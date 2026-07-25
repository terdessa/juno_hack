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
3. Build the copilot endpoint (Supabase Edge Function, `POST /copilot`) as a
   **tool-calling agent**, not a single structured-output call. The doctor's
   instruction is often deictic ("this patient") and under-specified ("ask
   how he's doing" with no concrete questions) — the agent needs to look
   things up and draft real questions, not just extract fields from text.

   - Input: raw doctor instruction (text, or transcribed voice — reuse
     ElevenLabs/OpenAI for transcription, nothing new to build there), plus
     `current_patient_id` if the doctor has a patient page open (needed to
     resolve "this patient" — if absent and the instruction is deictic, the
     agent should ask which patient rather than guess).
   - Tools available to the model (OpenAI/Anthropic function calling):
     - `search_patients(query)` — name lookup.
     - `get_patient_record(patient_id)` — history/notes/last visit reason,
       so the agent can draft specific questions grounded in the record
       instead of generic ones.
     - `create_call_task(patient_id, questions[], due_at, urgency)` — the
       function that actually inserts into `tasks`; this is what the call
       agent (Plan 2) picks up.
     - Stretch, same priority as Plan 2's calendar stretch:
       `check_calendar_availability(...)`, `book_appointment(...)` — for
       when the doctor wants to schedule directly without a call.
   - The model retrieves only what it asks for via tools — never dump the
     whole patient table into the prompt. Keeps prompts small/fast and
     avoids exposing unrelated patients' data in one call.
   - Run as a short bounded tool loop (a handful of tool calls max, then
     must call `create_call_task` or ask a clarifying question) — not an
     open-ended agent loop. Bounded turns keep it fast and predictable live
     on stage.
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

## Scale ceiling (known limits, don't build past them now)

This design is single-doctor, single-clinic, and assumes a patient list
small enough that `search_patients` is a plain Supabase query. Don't
build past that for the hackathon — but so the upgrade path is clear:

- **Multi-doctor / multi-clinic**: every table needs a `doctor_id` (or
  `clinic_id`) column and RLS scoping the copilot's tools and the
  dashboard queries to the caller's own patients. Right now there's
  exactly one doctor and no auth, so this is a schema + RLS change, not
  a rearchitecture.
- **Large patient lists**: `search_patients` becomes a real search (trigram/
  full-text index, or pgvector if fuzzy matching on symptoms/history is
  ever needed) instead of a `LIKE` query.
- **Tool loop cost/latency at scale**: bounding tool calls per request
  (already planned above) is what keeps this cheap; if patient records
  grow large, `get_patient_record` should return a summarized record
  rather than the full row, to keep the tool loop fast.
