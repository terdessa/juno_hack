# Plan 2: Agent Call Workflow (n8n + ElevenLabs + Calendar)

Owner: agent track. Triggered by Plan 1's "run now" webhook, writes results
back into the same Supabase tables Plan 1 reads from — that's the entire
integration surface between the two tracks.

## Goal

Take a task, place a real outbound call, get real answers back into
Supabase, plus (once the core loop works) book a calendar slot and score
mood.

## Core loop (build and prove this first, against a real phone number)

1. n8n webhook trigger receives `{ task_id }` from the website backend.
2. n8n reads the task + patient context from Supabase (questions to ask,
   patient name/history for the agent's opening line).
3. n8n calls the ElevenLabs Conversational AI API to originate an outbound
   call to the patient's phone number, passing the question list as the
   agent's script/goal.
4. Wait for call completion (ElevenLabs webhook, or n8n poll if no push
   webhook available) and pull the transcript.
5. Send the transcript to OpenAI/Anthropic with a structured-extraction
   prompt: one answer per question asked, plus a mood/sentiment
   label+score derived from tone and word choice.
6. Write a `calls` row (transcript, extracted_answers, mood_score) and
   update the `tasks` row to `status = done`.
7. Supabase realtime pushes this to the dashboard automatically — no work
   needed on this side beyond the writes.

## Stretch 1: calendar booking (build after core loop is proven)

- If the extracted answers indicate the patient wants an in-person
  follow-up, call Google Calendar/Calendly API for the doctor's
  availability, book the nearest real open slot, capture the event id.
- Write a `bookings` row linked to the patient/task.
- Never invent a time slot — only book against real fetched availability.

## Stretch 2: mood/sentiment (build after calendar booking, if time allows)

- Already partially covered by step 5's mood_score. If time allows, refine
  by comparing against the patient's own prior call sentiment (trend, not
  absolute) rather than a single-call score in isolation.

## Demo-readiness checklist

- [ ] Run at least one full end-to-end test call to a real phone before
      relying on this for the live demo — this is the single biggest
      failure point.
- [ ] Handle both "due_at in the future" (real scheduled trigger) and
      "run now" (demo button) without different code paths.
- [ ] Record a clean successful take of the full loop for the submitted
      MP4, independent of whether the live judging-session run succeeds
      perfectly — the MP4 deadline (Sun 12:00) doesn't require a live call
      in front of anyone.
- [ ] Confirm ElevenLabs voice sounds acceptable over a real phone line
      (not just in-browser) before the day of the demo.

## Explicitly not building here

- Task parsing (Plan 1 owns turning doctor instructions into tasks).
- Dashboard UI/display of any of this data.
- No-show/cancellation calling, team handoff — out of scope entirely.
