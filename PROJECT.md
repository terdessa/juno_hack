# Project: Doctor Task Copilot (name TBD)

## Problem statement (final)

Doctors juggle dozens of small follow-up tasks a day — call this patient back,
fix that prescription, check in on a dose change — that live only in their
head or on a scrap of paper. When they're stretched thin or go on leave,
these get dropped, which can be dangerous for patients.

**Pitch line:** "Doctors' to-do lists live in their heads — we take the
repetitive admin off their shoulders so they get their time and focus back."

Do NOT lead with "handle more patients" — reads as more workload to doctors
and kills buy-in. It can appear as a one-line business-case footnote for
private practices, never the headline.

## Hero demo loop (the one thing that must work)

1. Doctor dashboard: patient list, sorted by most-recently-seen by default,
   re-sortable, click a patient to expand their record.
2. Doctor speaks/types a loose instruction into a copilot box
   ("call John tomorrow, ask if the new dose is working").
3. Copilot parses it into a structured task (patient, question(s), due time).
4. At the scheduled time (or "run now" for demo), an agent places a real
   outbound call via ElevenLabs and has a real conversation.
5. Structured answers + a mood/sentiment read land back on the dashboard
   live, against that task.

## Stretch features (after the core loop works, in this order)

1. **Calendar booking** — if the patient asks for an in-person follow-up
   during the call, the agent checks the doctor's Google Calendar/Calendly
   availability and books a real slot. Lower risk, build first.
2. **Mood/sentiment analysis** — surfaced per-call from tone/word choice.
   Higher risk to demo convincingly, build second.

## Explicitly out of scope (mention in pitch narrative only, don't build)

- Team handoff / reassignment when doctor is on leave.
- Manual task creation form (the copilot IS the task creation UI).
- No-show/cancellation calling (used only as a spoken example of "other
  tasks this could do").

## Team split

- **UI**: teammate builds the dashboard visually in Lovable. No written plan
  needed for this track — once published, scrape the Lovable site's
  generated codebase into this repo to wire up real data.
- **Backend**: see `docs/plans/2026-07-25-website-backend-plan.md`.
- **Agent call workflow**: see `docs/plans/2026-07-25-agent-call-workflow-plan.md`.

## Tech stack

- **Frontend**: Lovable-generated UI, scraped into this repo.
- **Database**: Supabase (sponsor tool).
- **Orchestration**: n8n workflows.
- **AI**: OpenAI + Anthropic (sponsor credits) for task parsing / transcript
  extraction / sentiment.
- **Voice**: ElevenLabs (sponsor tool) for the outbound conversational call.
- **Calendar**: Google Calendar or Calendly API.

## Hackathon constraints (from HACK_DESCRIPTION.txt)

- Submit GitHub repo + 1-minute MP4 demo by Sunday 26 July 12:00 BST.
- Live judging/demo session Sunday 13:30-14:00 — be demo-ready in person too.
- Real users bonus: evidence must be honest (screenshots/messages from
  people who actually reacted to the idea/product). No fabricated evidence —
  cheating scores zero. Outreach plan deferred until after the build plan.
- Sponsor tools used well = bonus points: OpenAI, Anthropic, ElevenLabs,
  Supabase, Vercel all genuinely used above, not bolted on.
