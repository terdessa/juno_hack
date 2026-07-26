# Medley

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

## Positioning

Medley sits *on top of* the practice software the doctor already uses
(EMIS, SystmOne) rather than replacing it — a widget in the corner they
never have to leave their main screen for.

## The demo loop

1. Doctor talks to Medley — voice or text, mid-clinic, in half sentences:
   *"ring john tomorrow, forgot to ask how the new tablets are treating him."*
2. Medley reads that patient's record and writes the questions the voice
   agent will ask aloud — grounded in their actual medication and history,
   never "how are you feeling?". It asks back if a wrong guess would matter.
3. At the scheduled time (or immediately), the voice agent phones the
   patient and holds the conversation.
4. The transcript comes back as structured answers, a mood read, and any
   safeguarding tags — landing on the dashboard live, with no refresh.

**Status:** all four steps work end to end, verified on real calls to real
mobiles. The voice agent can also book an appointment and read back a
patient's medication list mid-call.

## Scope, after the doctor's feedback

A practising GP reviewed the dashboard and told us what doctors need on
screen. That promoted three things from stretch to requirement:

- **Multidisciplinary team** — a task can go to a nurse, pharmacist, or
  colleague, not just the voice agent. This is what makes "if I'm on leave
  these don't die" real rather than a slide.
- **Mood and safeguarding tags** on completed calls.
- **Follow-up booking** when a patient asks for an in-person appointment.

The UI is therefore the spec: extend the schema to match it, not the
reverse.

## Still out of scope

- No-show/cancellation calling — a spoken example of "other tasks this
  could do", not something to build.
- Auth, multi-tenancy, anything for a second doctor.

## Team split

The boundary: whoever owns a thing that **talks** owns only that; everything
that touches **data** is one person's.

- **Backend + web app AI** — copilot, dispatch, results ingestion, database,
  dashboard agent. See `docs/plans/2026-07-25-website-backend-plan.md`.
- **Call agent** — the ElevenLabs voice agent that phones patients, plus its
  phone number. Nothing else. See
  `docs/plans/2026-07-25-agent-call-workflow-plan.md`.
- **UI** — built visually in Lovable, scraped into this repo once published.
  No written plan for this track.

n8n was dropped when the call track narrowed to the agent itself: with one
person owning both sides of the plumbing, a second runtime and a second
credential store were cost without benefit.

## Tech stack

TypeScript throughout; no Python.

- **Frontend** — TanStack Start + React 19 + Tailwind 4 + shadcn, from
  Lovable, in `frontend/`. Package manager `bun`.
- **Database** — Supabase Postgres, with realtime driving the live update.
- **API** — Supabase Edge Functions on Deno.
- **Dashboard agent** — Anthropic Claude Haiku 4.5, multi-turn tool loop.
- **Voice (dashboard)** — the browser's own speech engine, in and out. No
  key, no round trip. `speak()` is the seam to swap for ElevenLabs TTS.
- **Voice (patient calls)** — ElevenLabs Conversational AI. Not yet built.
- **Post-call AI** — n8n workflow. Not yet built.

## Hackathon constraints (from HACK_DESCRIPTION.txt)

- Submit GitHub repo + 1-minute MP4 demo by Sunday 26 July 12:00 BST.
- Live judging/demo session Sunday 13:30-14:00 — be demo-ready in person too.
- Real users bonus: evidence must be honest (screenshots/messages from
  people who actually reacted to the idea/product). No fabricated evidence —
  cheating scores zero. Outreach plan deferred until after the build plan.
- Sponsor tools used well = bonus points: OpenAI, Anthropic, ElevenLabs,
  Supabase, Vercel all genuinely used above, not bolted on.
