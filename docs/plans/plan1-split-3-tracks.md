# Plan 1 split into 3 parallel tracks

Plan 1 broken into three workstreams that can run at the same time without
stepping on each other. Architecture reference:
`docs/architecture/plan1-backend-architecture.md`.

## Why this split works in parallel

The schema in `supabase/migrations/0001_init.sql` is **already written** and
is the contract. Every track codes against it immediately — nobody waits for
the database to actually exist. Same for the API contract in §6 of the
architecture doc: Track C can build against those response shapes before
Track A has finished producing them.

**File ownership is disjoint.** No two tracks write the same file.

---

## Track A — Copilot tool-calling agent  ⟵ hardest, Claude takes this

The demo itself. A bounded tool loop over Claude Sonnet 5 that turns loose
doctor speech into a structured task.

**Owns:** `supabase/functions/copilot/**`

- `POST /copilot` Edge Function (Deno).
- Zod validation of `{ instruction, current_patient_id? }`.
- System prompt: role, question style, no-clinical-decisions boundary,
  urgency rules, ambiguity → ask (architecture §4).
- Runtime context injection: `now` + timezone, `current_patient_id`.
- Tool implementations: `search_patients`, `get_patient_record`,
  `create_call_task` (architecture §5), each re-validating LLM args before
  touching Postgres.
- Bounded loop: max 6 iterations, terminal on `create_call_task`, or
  `needs_input` when the patient is ambiguous.
- Returns `{ status: 'created'|'needs_input'|'error', task?, message? }`.

**Done when:** messy real phrasings ("forgot to ask this guy how the new
dose is treating him, ring him tomorrow") produce a sensible task row with
grounded, speakable questions.

---

## Track B — Database foundation + dispatch

Everything that makes the data real, plus the handoff to the call agent.

**Owns:** `supabase/migrations/**`, `supabase/seed.sql`,
`supabase/functions/tasks-run/**`, `src/types/database.ts`

1. Create the Supabase project; apply `0001_init.sql`.
2. Write `seed.sql`: 5 patients with varied `last_seen_at` (proves the
   recency sort), realistic notes/history so the copilot has something to
   ground questions in, plus 2 past tasks + 1 completed call so the
   dashboard isn't empty on first load.
3. Generate TypeScript types from the live schema → `src/types/database.ts`
   (shared by every track).
4. `POST /tasks/:id/run` Edge Function: set `tasks.status='in_progress'`,
   POST `{ task_id }` to `N8N_WEBHOOK_URL`. On webhook failure leave status
   `pending` so it's retryable.
5. Verify realtime is publishing on `tasks` and `calls`.

**Done when:** dashboard-shaped queries return seeded data, types are
generated, and hitting `/tasks/:id/run` fires a webhook a stub receiver can
see.

---

## Track C — Frontend wiring + voice input

Connects the scraped Lovable UI to everything, and adds the mic.

**Owns:** `src/lib/**`, `supabase/functions/transcribe/**`, and the wiring
edits inside the scraped Lovable UI components.

1. `src/lib/supabase.ts`: client setup, typed against Track B's types.
2. `src/lib/queries.ts`: patient list (recency-sorted, re-sortable), patient
   detail, task list. Reads go **direct to Supabase**, not through Edge
   Functions.
3. `src/lib/realtime.ts`: subscribe to `tasks` + `calls` so new rows and
   completed calls appear with no refetch. This is the payoff shot in the
   demo — it must be visibly instant.
4. `src/lib/api.ts`: typed wrappers for `/copilot`, `/tasks/:id/run`,
   `/transcribe`.
5. `POST /transcribe` Edge Function: audio blob → OpenAI `gpt-4o-transcribe`
   → `{ text }`.
6. Mic capture in the copilot box (MediaRecorder), with the text box always
   available as fallback if transcription fails.

**Done when:** a task created in another browser tab appears live on the
dashboard, and speaking into the copilot box fills it with text.

---

## Integration checkpoint

All three tracks converge on one test:

> Speak an instruction → task appears on the dashboard without a refresh →
> click run → n8n webhook fires.

That's the demo skeleton. Everything after it is polish.

## Coordination rules

- **Don't edit another track's files.** If you need a change there, say so
  rather than reaching in.
- `supabase/migrations/0001_init.sql` is frozen as the contract — schema
  changes go through Track B and must be announced, since A and C both
  depend on the shape.
- `.env.example` is shared; append your keys, never rewrite the file.
