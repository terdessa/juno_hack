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

## Repo layout

- `PROJECT.md` — problem statement, scope, architecture, team split.
- `docs/plans/` — implementation plans (website/backend, agent call workflow).
- `supabase/migrations/` — DB schema.
- `.env.example` — required API keys.

## Working agreements

- Two active build tracks: website/backend (Supabase + API layer) and agent
  call workflow (n8n + ElevenLabs + calendar). They integrate through the
  `tasks`/`calls`/`bookings` tables in Supabase — treat that schema as the
  contract between tracks.
- Before adding a new table/field, check `docs/plans/` — if it's not needed
  for the hero loop, don't add it yet.
- Test the real outbound call against a real phone number before trusting
  the workflow — ElevenLabs/calendar integration failures are the biggest
  demo risk.
