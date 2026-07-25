# CLAUDE.md

Context for working in this repo. Read `PROJECT.md` first — it has the full
problem statement, scope, and architecture decisions. This file is the
condensed operating rules.

## What this is

A hackathon project (Juno x Anthropic x ElevenLabs x Supabase x OpenAI x
Vercel, London, 25-26 Jul 2026). Deadline: Sunday 12:00 BST. See
`HACK_DESCRIPTION.txt` for the full brief and scoring, `IDEAS.txt` for
brainstorm history.

## Hard scope rules

- **The UI is the spec.** It was designed with a practising GP, so it
  defines what data matters. Extend the schema to match it rather than
  trimming it to match the backend. This overrode the original
  "hero loop only" plan — team handoff, mood, tags and follow-up booking
  were all promoted from stretch to requirements by that feedback.
- Nothing outranks getting one real phone call working end to end. Polish
  after that, not before.
- No auth system. Single hardcoded doctor (`Dr Hartley`) — don't build
  multi-tenant anything.
- No speculative abstractions. This ships once, this weekend. Optimize for
  "works live on stage," not future extensibility.
- The dashboard came from Lovable and lives in `frontend/`. Its `AGENTS.md`
  warns it's Lovable-connected: **never force-push a branch it syncs to.**

## Current state (25 Jul, evening)

Product is **Medley**: a conversational assistant that sits over the
doctor's practice software (EMIS/SystmOne), takes follow-up calls off
their shoulders, and reports back.

**Works, verified live:**
- Supabase `czfjwmzwkifgozkmlsaa` — schema, grants, 5 patients with real
  clinical detail, MDT roster, one completed call.
- `/agent` — the conversational dashboard agent. Multi-turn, tool-using,
  Haiku 4.5. Asks back when a wrong guess would matter; drafts call
  questions grounded in the patient's record.
- Frontend on live data with realtime, plus a conversation UI that
  replaced the assign-a-call form. Voice in/out via the browser's own
  speech engine (Chrome/Edge).

- The ElevenLabs agent `agent_9601kycv0rkme9ya9wtxt5dkqspg` on
  `+14243533227`, tested to a real UK mobile. Its prompt says Dr Hartley.

**Written, typechecked, not yet deployed:**
- `_shared/dispatch.ts` places the call. Shared by "call now" and the
  scheduler so the two paths cannot drift.
- `/tasks-due` — the clock, driven by pg_cron. This is what makes a task
  scheduled for noon actually ring at noon.
- `/call-webhook` — transcript in, summary/mood/tags/answers out, task
  closed. Verifies the ElevenLabs HMAC.
- `/speak` and `/transcribe` — ElevenLabs voice for the dashboard.

**The gap is deployment, not code. Follow `docs/DEPLOY.md`.** Unapplied:
migration `0002_live_calls.sql`, the function deploy, the pg_cron schedule,
the ElevenLabs post-call webhook, and real phone numbers on the patient rows
(every one is a `+4400000000xx` placeholder that will not dial).

**Also outstanding:** real-user evidence (a practising GP shaped the
dashboard's data model — capture who, when, and which decisions came from
them; it's a scored bonus with nothing on it), and the 1-minute MP4.

Smoke test (anon key is publishable, safe in shell history):

```sh
curl -s -X POST "https://czfjwmzwkifgozkmlsaa.supabase.co/functions/v1/agent" \
  -H "Authorization: Bearer <anon key>" -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"ring john tomorrow about the new tablets"}],"current_view":"calls"}'
```

## Stack

TypeScript throughout, no Python. Edge Functions run on Deno (imports are
`npm:`/`jsr:` URLs, no package.json). Frontend is TanStack Start + React 19
+ Tailwind 4, package manager `bun`, in `frontend/`.

## AI provider split

Anthropic for all reasoning — the dashboard agent and post-call extraction.
ElevenLabs for all speech, in both directions and on both surfaces: the phone
call, the dashboard's voice (`/speak`), and transcription for browsers with no
local recogniser (`/transcribe`). OpenAI is no longer used; a second speech
vendor bought nothing once the ElevenLabs key was already here. Don't add a
second reasoning stack just to spend sponsor credits.

Listening in the browser stays on the Web Speech API wherever it exists. It
recognises locally and returns words while they are still being spoken —
uploading audio to a better model can only be slower.

Model gotchas, don't undo these:
- **Haiku 4.5** (current, `/agent`) predates adaptive thinking and the
  `effort` parameter. Sending either returns a 400.
- **Opus 5** (if you switch back) has thinking ON by default sharing
  `max_tokens`, so a tight cap truncates mid-answer. Never disable
  thinking on it — with thinking off it can write a tool call as plain
  text, and the call silently never runs.

## Google Calendar

The clinic diary mirrors the doctor's Google Calendar both ways, on a pg_cron
every two minutes (`/calendar-sync`). Polled, not pushed: Google's calendar
push notifications need the receiving domain verified in Search Console and
nobody can verify `supabase.co`. Auth is a stored refresh token, not a service
account — service accounts can only act for a user via domain-wide delegation,
which needs a Workspace admin. Setup: `docs/GOOGLE_CALENDAR.md`. Calendly was
tried first and removed.

## Two things that will bite you

**The anon key can only read.** It ships inside the JS bundle, so it is
public: `anon` holds `SELECT` on every table and nothing else. Any write from
the browser returns `permission denied for table <name>`. Writes go through an
Edge Function holding the service-role key — `/task-action` (decline, restore,
delete), `/tasks-run`, `/agent`. Never fix a write error by widening the grant;
that hands every visitor a DELETE on the practice list.

**Scribe needs the roster or it invents names.** Unbiased, "Mykyta Yakivets"
transcribes as "Mykhailo Yakymets", "Tyshkovets" as "Tishkovets", "Shuliar" as
"Shuliak" — and nothing downstream can undo it, because the real name is gone
by then. `/transcribe` passes every patient name and medication as ElevenLabs
`keyterms`, which fixes all three exactly. The encoding matters: **one repeated
form field per term**. A JSON array in a single field is rejected as one
60-character keyword, and `keyterms[]` is accepted and silently ignored, which
is worse.

## Dead code, delete when convenient

`/copilot` (function + `NewCallDialog` + `createTaskFromInstruction`) is
superseded by `/agent` and no longer reachable from the UI.

## Repo layout

- `PROJECT.md` — problem statement, scope, team split.
- `docs/plans/` — backend plan, call-agent plan.
- `docs/architecture/` — backend architecture. **Partly stale**: still
  describes `/copilot` and n8n. Trust this file and `PROJECT.md` first.
- `docs/DEPLOY.md` — the runbook. Start here to get anything live.
- `supabase/migrations/` — `0001_init.sql`, then `0002_live_calls.sql` which
  reconciles the file history with a database that had been edited by hand and
  adds what the call loop needs.
- `supabase/functions/` — `agent` (live), `_shared/dispatch.ts`, `tasks-run`,
  `tasks-due`, `call-webhook`, `speak`, `transcribe`, `copilot` (dead).
- `frontend/` — the dashboard. `.env` holds the Supabase URL + anon key.
- `.env.example` — documents which secret goes *where*; most aren't read
  from a local `.env` at all.

## Working agreements

- Two active build tracks. **Backend + web app AI** owns Supabase, the
  dashboard agent, dispatch, and results ingestion. **Call agent** owns
  only the ElevenLabs voice agent and its phone number — it never touches
  the database. The contract is three things from the call track: an
  `agent_id`, a working phone number, and an agent that reads
  `patient_name` and `questions` as dynamic variables.
- **n8n is gone.** The post-call workflow it was being kept for is
  `/call-webhook`, ~200 lines of Deno. A second runtime and credential store
  bought nothing once one person owned both sides of the plumbing, and it was
  a second thing that could be down on stage.
- Before adding a new table/field, check `docs/plans/` — if it's not needed
  for the hero loop, don't add it yet.
- Test the real outbound call against a real phone number before trusting
  the workflow — ElevenLabs/calendar integration failures are the biggest
  demo risk.
