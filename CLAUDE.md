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

- Build ONLY the hero demo loop first (see PROJECT.md). Do not touch stretch
  features (calendar booking, mood analysis) or out-of-scope items (team
  handoff, manual task form, no-show calling) until the core loop works
  end-to-end with a real phone call.
- No auth system. Single hardcoded doctor for the demo — don't build
  multi-tenant anything.
- No speculative abstractions. This ships once, this weekend. Optimize for
  "works live on stage," not for future extensibility.
- UI lives in Lovable and gets scraped in, not hand-built here — don't
  rebuild dashboard UI from scratch in this repo.

## Current state (25 Jul, backend track)

Supabase project `czfjwmzwkifgozkmlsaa` is live: schema applied, 5 demo
patients seeded with real clinical detail, one past task + completed call.
The `copilot` Edge Function is deployed and typechecks; its tool-arg guards
have tests (`deno test supabase/functions/copilot/`).

**Blocked on:** `ANTHROPIC_API_KEY` must be set in Dashboard → Project
Settings → Edge Functions → Secrets. Until then `/copilot` returns
`Missing required env var`. Not the same place as project API keys or a
local `.env`.

Not built yet: `/tasks/:id/run` dispatch, `/transcribe`, `src/lib/*`
frontend wiring, the n8n call workflow.

Smoke test once the secret is set (anon key is publishable, safe in shell
history):

```sh
curl -s -X POST "https://czfjwmzwkifgozkmlsaa.supabase.co/functions/v1/copilot" \
  -H "Authorization: Bearer <anon key>" -H "Content-Type: application/json" \
  -d '{"instruction":"forgot to ask John how the new tablets are treating him, ring him tomorrow"}'
```

## AI provider split

Anthropic (`claude-opus-5`) for all reasoning — copilot now, post-call
extraction later. OpenAI only for speech-to-text (`gpt-4o-transcribe`),
because Anthropic has no audio input. Don't add a second reasoning stack
just to use more sponsor credits.

Two Opus 5 gotchas already hit, don't undo them:
- Thinking is ON by default and shares `max_tokens`. A tight `max_tokens`
  truncates mid-answer.
- Do NOT disable thinking. With it off, Opus 5 can write a tool call as
  plain text — the turn succeeds and the call silently never runs.

## Repo layout

- `PROJECT.md` — problem statement, scope, architecture, team split.
- `docs/plans/` — implementation plans (website/backend, agent call workflow).
- `supabase/migrations/` — DB schema.
- `.env.example` — required API keys.

## Working agreements

- Two active build tracks. **Backend + web app AI** owns Supabase, the
  copilot, dispatch, results ingestion, and the dashboard agent. **Call
  agent** owns only the ElevenLabs voice agent and its phone number — it
  never touches the database. The contract is three things from the call
  track: an `agent_id`, a working phone number, and an agent that reads
  `patient_name` and `questions` as dynamic variables.
- No n8n. The backend calls ElevenLabs directly; a second runtime and
  credential store bought nothing once one person owned both sides of the
  plumbing.
- Before adding a new table/field, check `docs/plans/` — if it's not needed
  for the hero loop, don't add it yet.
- Test the real outbound call against a real phone number before trusting
  the workflow — ElevenLabs/calendar integration failures are the biggest
  demo risk.
