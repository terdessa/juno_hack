# Plan 1 Architecture: Backend + Copilot Pipeline

> ⚠️ **Partly superseded — read `CLAUDE.md` and `PROJECT.md` first.**
>
> Written before the build. Still accurate on the shape of things: reads
> bypass the API layer, tools re-validate LLM args, patient data is pulled
> not dumped, secrets stay server-side.
>
> Out of date on specifics:
> - `/copilot` was replaced by `/agent`, a multi-turn conversational agent.
>   The one-shot request pipeline in §3 no longer exists.
> - The model is Haiku 4.5, not Sonnet 5.
> - `/tasks-run` calls ElevenLabs, not n8n. n8n is kept for the post-call
>   workflow only.
> - `/transcribe` was never built — voice uses the browser's speech engine.
> - The schema grew considerably when the UI became the spec.

Concrete architecture for the backend track. Plan 1
(`docs/plans/2026-07-25-website-backend-plan.md`) says *what* to build;
this says *how*, with the exact tools, models, contracts and logic.

---

## 1. Stack decisions (and why)

| Layer | Choice | Why this one |
|---|---|---|
| API runtime | **Supabase Edge Functions** (Deno, TypeScript) | Already using Supabase for data; one deploy target, no separate server to host. Anthropic/OpenAI SDKs work in Deno. |
| Database | **Supabase Postgres** | Sponsor tool. Realtime subscriptions give the live dashboard update for free — no polling code. |
| Frontend hosting | **Vercel** | Sponsor tool. Lovable output is a React SPA; Vercel is the zero-config host for it. |
| Dashboard agent LLM | **Claude Haiku 4.5** (`claude-haiku-4-5`) | Anthropic credits. Fastest of the family, and the agent sits on the interactive path where the doctor is watching. Note it predates adaptive thinking and `effort` — sending either returns a 400. |
| Voice → text (doctor's mic) | **OpenAI `gpt-4o-transcribe`** | OpenAI credits. More robust in a noisy hackathon venue than browser Web Speech API, and not Chrome-locked. |
| Post-call extraction | **Claude Sonnet 5**, structured output | Owned by Plan 2, but writes into this schema — listed here so the contract is in one place. |
| Patient call voice | **ElevenLabs Conversational AI** | Sponsor tool. Owns the whole live audio path (see Plan 2). |

Sponsor tools used genuinely, not bolted on: Supabase (data + realtime),
Anthropic (copilot reasoning), OpenAI (transcription), ElevenLabs (voice),
Vercel (hosting).

---

## 2. System pipeline

```
┌─────────────────────────────────────────────────────────────┐
│ DASHBOARD (React from Lovable, hosted on Vercel)            │
│  patient list · patient detail · task list · copilot box    │
└────────┬──────────────────────────────────┬─────────────────┘
         │ writes (via Edge Functions)      │ reads + realtime
         │                                  │ (supabase-js direct)
         ▼                                  ▼
┌────────────────────────────┐      ┌──────────────────────────┐
│ EDGE FUNCTIONS (Deno)      │      │ SUPABASE POSTGRES        │
│  POST /copilot             │─────▶│  patients                │
│  POST /tasks/:id/run       │      │  tasks   ◀── realtime ──▶│
│  POST /transcribe          │      │  calls   ◀── realtime ──▶│
└────┬──────────────┬────────┘      │  bookings                │
     │              │               └──────────▲───────────────┘
     ▼              ▼                          │ writes results
┌─────────┐   ┌──────────┐              ┌──────┴───────────────┐
│ Claude  │   │ OpenAI   │              │ n8n + ElevenLabs     │
│ Sonnet5 │   │transcribe│              │ (Plan 2 — call agent)│
│(toolloop)│  └──────────┘              └──────────────────────┘
└─────────┘                                      ▲
                                    webhook ─────┘
```

**Reads bypass the API layer.** The dashboard talks to Supabase directly
with `supabase-js` for all reads and realtime subscriptions. Edge Functions
exist only for the three operations that need a server-side secret (LLM
API keys) or side effects. No CRUD endpoints to write — Postgres already
is the API.

---

## 3. The copilot request pipeline

The single most important path. Doctor speaks/types → task exists.

```
1. UI captures instruction
   ├─ typed  → text
   └─ spoken → audio blob → POST /transcribe → OpenAI gpt-4o-transcribe → text

2. POST /copilot { instruction, current_patient_id? }
   │
   ├─ validate input (zod): instruction non-empty, ≤2000 chars,
   │  current_patient_id is uuid-or-absent.   ← trust boundary
   │
   ├─ build system prompt (§4) + inject { now, timezone, current_patient_id }
   │
   └─ TOOL LOOP (max 6 iterations, then force-stop)
        │
        │  Claude Sonnet 5 picks tools:
        │   • search_patients(query)        → SELECT on patients
        │   • get_patient_record(id)        → patient + last 3 tasks/calls
        │   • create_call_task(...)         → INSERT into tasks  ⟵ terminal
        │   • [stretch] check_calendar_availability / book_appointment
        │
        ├─ terminates when: create_call_task called (success)
        │                   OR model asks a clarifying question (needs_input)
        │                   OR 6 iterations hit (error, return partial)
        │
        └─ response: { status, task?, message }

3. Realtime pushes the new tasks row → dashboard renders it. No refetch.
```

Typical run for *"I forgot to ask this patient how he's doing"* with a
patient page open: `get_patient_record` → sees last visit was a new BP
med → `create_call_task` with three grounded questions. **Two LLM turns,
~3-4s.** That is the on-stage latency budget.

---

## 4. Copilot knowledge — what the model actually knows

Three layers, deliberately separated:

**(a) Static — in the system prompt**
- Role: clinical admin assistant for one GP. Turns loose spoken instructions
  into concrete follow-up call tasks.
- The calling agent is a *voice AI phoning a patient*, so questions must be
  short, plain-language, answerable out loud. No jargon, no multi-part
  questions.
- **Hard boundary: no clinical decisions.** Never suggest a diagnosis, dose
  change, or treatment. Turn clinical intent into *questions to ask*, never
  into advice to give. If the doctor's instruction implies advice ("tell him
  to halve the dose"), record it verbatim as a message to relay, attributed
  to the doctor — the agent never originates medical advice.
- Urgency rules: `high` only if the doctor says so or says "today/now";
  otherwise `normal`. Don't infer urgency from the condition — that's a
  clinical judgment the model shouldn't make.
- If the patient is ambiguous or unnamed and no `current_patient_id` is set,
  **ask** — never guess between two patients.

**(b) Runtime context — injected per request**
`now` (ISO + timezone, so "tomorrow"/"in two days" resolve correctly),
`current_patient_id` (resolves "this patient"), doctor's name.

**(c) Retrieved on demand — via tools**
Patient records are *pulled*, never dumped. The model sees only the
patients it explicitly looks up. Keeps prompts small and fast, and no
single request exposes the whole patient table.

---

## 5. Tool contracts

```ts
search_patients(query: string)
  → [{ id, name, dob, last_seen_at }]           // max 10, active only

get_patient_record(patient_id: uuid)
  → { id, name, dob, notes, vaccinations,
      last_seen_at,
      recent_tasks: [{ instruction_raw, status, created_at }],   // last 3
      recent_calls: [{ extracted_answers, mood_score, ended_at }] } // last 3

create_call_task(patient_id: uuid,
                 questions: string[],           // 1-5, each ≤200 chars
                 due_at: ISO8601,
                 urgency: 'low'|'normal'|'high',
                 instruction_raw: string)
  → { task_id }                                 // terminal tool

// stretch, same priority as Plan 2's calendar work
check_calendar_availability(from: ISO, to: ISO) → [{ start_at, end_at }]
book_appointment(patient_id, start_at, end_at)  → { booking_id }
```

Every tool re-validates its args server-side before touching Postgres —
LLM output is untrusted input. All DB access via parameterized
`supabase-js` queries, never string-built SQL.

---

## 6. API contract (the interface your two teammates code against)

```
POST /functions/v1/transcribe
  multipart: audio blob
  → { text }

POST /functions/v1/copilot
  { instruction: string, current_patient_id?: uuid }
  → { status: 'created',      task: {...} }        // task made
  | { status: 'needs_input',  message: string }    // ambiguous, ask doctor
  | { status: 'error',        message: string }

POST /functions/v1/tasks/:id/run
  → { status: 'dispatched' }
  // sets tasks.status='in_progress', POSTs { task_id } to N8N_WEBHOOK_URL
```

**Contract with Plan 2 (call agent):** n8n receives `{ task_id }`, reads
`tasks` + `patients` itself, and on call completion writes a `calls` row
(`transcript`, `extracted_answers`, `mood_score`, `status='completed'`)
and flips `tasks.status='done'`. Backend never calls n8n except for that
one dispatch webhook. Realtime does the rest.

---

## 7. Failure handling

| Failure | Behaviour |
|---|---|
| LLM API down / times out | Return `status:'error'` with a plain message; UI keeps the doctor's typed text so nothing is lost. |
| Model can't identify patient | `needs_input` + question. Never guess. |
| Tool loop hits 6 iterations | Stop, return error. Prevents runaway spend and a hung request on stage. |
| Transcription fails | UI falls back to the text box — copilot always accepts typed input. |
| n8n webhook unreachable | Task stays `pending` (not `in_progress`) so it can be retried; surfaced on the dashboard. |

Errors are logged server-side with full context; the doctor sees a plain
message. No stack traces or API errors leaked to the client.

---

## 8. Build order

1. Schema migration + seed data (5 patients, varied `last_seen_at`, 2 past
   tasks/calls so the dashboard isn't empty).
2. `POST /copilot` with `search_patients` + `get_patient_record` +
   `create_call_task`. **This is the demo.** Test with messy real phrasings.
3. `POST /tasks/:id/run` → webhook to n8n (stub receiver until Plan 2 lands).
4. Wire the scraped Lovable UI: reads + realtime + the two endpoints.
5. `POST /transcribe` (voice input for the copilot box).
6. Stretch: calendar tools, once 1-5 are solid.

**Checkpoint after step 4:** type an instruction → task appears without a
refresh → click run → webhook fires. If that works end-to-end, the demo
exists; everything after is polish.

---

## 9. Scale ceiling

Single doctor, no auth, no RLS — correct for this weekend, wrong for
production. Upgrade path if this lives on: add `doctor_id` to every table
+ RLS scoping both the dashboard queries and the copilot's tools;
`search_patients` moves from `ILIKE` to a trigram/full-text index;
`get_patient_record` returns a summarized record instead of full rows to
keep the tool loop fast on large histories.
