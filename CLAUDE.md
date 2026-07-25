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

**Not built — this is the gap:**
- `/tasks-run` is written but has **never executed**. It still POSTs to an
  n8n webhook that doesn't exist.
- `/call-webhook` (transcript → answers, mood, tags, summary) doesn't
  exist. Nothing writes call results, so `mood`/`tags`/`summary` columns
  stay empty.
- No ElevenLabs agent, so **no call has ever been placed**.

**Blocked on:** an ElevenLabs API key and an `agent_id`. That is the
single highest-value thing anyone can unblock.

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

Anthropic for all reasoning. OpenAI only for speech-to-text if the browser
engine proves insufficient — Anthropic has no audio input. Don't add a
second reasoning stack just to spend sponsor credits.

Model gotchas, don't undo these:
- **Haiku 4.5** (current, `/agent`) predates adaptive thinking and the
  `effort` parameter. Sending either returns a 400.
- **Opus 5** (if you switch back) has thinking ON by default sharing
  `max_tokens`, so a tight cap truncates mid-answer. Never disable
  thinking on it — with thinking off it can write a tool call as plain
  text, and the call silently never runs.

## Dead code, delete when convenient

`/copilot` (function + `NewCallDialog` + `createTaskFromInstruction`) is
superseded by `/agent` and no longer reachable from the UI.

## Repo layout

- `PROJECT.md` — problem statement, scope, team split.
- `docs/plans/` — backend plan, call-agent plan.
- `docs/architecture/` — backend architecture. **Partly stale**: still
  describes `/copilot` and n8n. Trust this file and `PROJECT.md` first.
- `supabase/migrations/` — DB schema. `0001_init.sql` plus two migrations
  applied live (privilege grants, dashboard alignment) that are recorded in
  Supabase but only partly reflected in the file.
- `supabase/functions/` — `agent` (live), `tasks-run` (untested),
  `copilot` (dead).
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
- **n8n**: decided it stays for the post-call AI workflow (transcript →
  answers, mood, tags, summary), which is asynchronous and where a visual
  workflow helps. Nothing is built yet. The dashboard agent deliberately
  stays an Edge Function — it's on the interactive path where every added
  hop shows up as the doctor watching a spinner.
- Before adding a new table/field, check `docs/plans/` — if it's not needed
  for the hero loop, don't add it yet.
- Test the real outbound call against a real phone number before trusting
  the workflow — ElevenLabs/calendar integration failures are the biggest
  demo risk.
