<div align="center">

# Medley

### Every patient gets followed up — not just the ones the doctor remembers

*A conversational assistant that sits over a GP's practice software, takes the*
*follow-up calls off their shoulders, and reports back.*

<br />

[![Anthropic](https://img.shields.io/badge/Claude-Haiku_4.5-D97757?style=for-the-badge&logoColor=white)](https://anthropic.com)
[![ElevenLabs](https://img.shields.io/badge/ElevenLabs-Voice-000000?style=for-the-badge&logoColor=white)](https://elevenlabs.io)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres_+_Edge-3FCF8E?style=for-the-badge&logoColor=white)](https://supabase.com)
[![React](https://img.shields.io/badge/React_19-TanStack_Start-61DAFB?style=for-the-badge&logoColor=black)](https://tanstack.com/start)

</div>

---

## The problem

A GP carries dozens of small follow-ups in their head. *Ring him back about the
new tablets. Check that dose is working. Chase the X-ray.* They live on a
sticky note or nowhere at all.

When the day runs long — and it always runs long — the ones that get chased are
the ones that **chase hardest**. The quiet patient, the one who never rings, the
one who would never dream of bothering the surgery: they are the ones who fall
off the list.

That is not a productivity problem. It is a safety problem.

## What Medley does

The doctor says one sentence, mid-clinic, in half-sentences, the way people
actually talk:

> *"ring mykyta tomorrow at ten, forgot to ask how the new tablets are treating him"*

And then:

| | |
|---|---|
| **1. It reads the record** | Pulls the patient's real medications, condition and notes — not a template |
| **2. It writes the questions** | *"Have you had any side effects from the omeprazole?"* — grounded in what they are actually taking |
| **3. It phones them** | At the time it said, unattended. A real call to a real mobile |
| **4. It listens** | Books an appointment mid-call, or reads their medication list back if they've forgotten |
| **5. It reports back** | Summary, mood, an answer per question — on the dashboard, live, no refresh |
| **6. It flags what needs a person** | *"Needs a repeat of the omeprazole"* lands in the doctor's inbox |

The doctor never fills in a form. Speaking is always faster than typing, and
where a form survives in this product, it has failed a test.

---

## The parts

```
    Doctor speaks                                          Patient's phone
         │                                                        ▲
         ▼                                                        │
   ┌───────────┐      ┌────────────┐     ┌──────────┐     ┌──────────────┐
   │ Dashboard │─────▶│  /agent    │────▶│  tasks   │────▶│  ElevenLabs  │
   │  React 19 │◀─────│ Claude 4.5 │     │ pg_cron  │     │ voice agent  │
   └───────────┘      └────────────┘     └──────────┘     └──────────────┘
         ▲                                                        │
         │            ┌──────────────┐    ┌──────────────┐        │
         └────────────│  inbox_items │◀───│ /call-webhook│◀───────┘
            realtime  │  what needs  │    │  transcript  │  transcript
                      │   a person   │    │  → structure │
                      └──────────────┘    └──────────────┘
```

**Thirteen Edge Functions**, all TypeScript on Deno. The interesting ones:

- **`/agent`** — the dashboard's conversational brain. Streams, uses tools, holds a
  multi-turn conversation. The practice roster is inlined into a cached prompt
  so it acts on a name without two round-trips to find out who it belongs to.
- **`/call-webhook`** — transcript in; summary, mood, per-question answers and
  inbox items out. HMAC-verified.
- **`/book-appointment`** · **`/check-medication`** — tools the *voice agent* calls
  mid-call. Deterministic, no LLM, every reply written to be spoken aloud.
- **`/calendar-sync`** — two-way Google Calendar mirror, on a two-minute cron.

---

## Decisions worth defending

**Colour means clinical state, and nothing else.** The canvas is a true neutral
at chroma zero. Hue appears on exactly four things: a call happening now, an
overdue follow-up, a clinical flag, a completed call. A doctor reads the screen
from a metre away without hunting.

**Overdue is derived, never stored.** It changes with the clock, not with an
edit. A stored flag needs a job to keep it true and is wrong between runs.

**The anon key can only read.** It ships inside the JavaScript bundle, so it is
public. Every write — declining a call, editing a record, booking — goes through
an Edge Function holding the service-role key. Widening the grant would hand
every visitor a `DELETE` on the practice list.

**Never say a call happened when it did not.** `failed` covers a patient
ignoring the phone, an undiallable number, and a dispatch that never left the
building. Calling all three *"No answer"* blames the patient and gets the task
silently dropped — in a product whose promise is that nothing is forgotten.

**The voice agent makes no clinical decisions.** It turns clinical intent into
questions to ask, never advice to give. `/check-medication` reads back the
medication list and refuses to parse a dose out of free-text notes: inventing
*"two tablets twice a day"* from a note that does not say so is a safety risk,
not a rounding error.

**No modals.** Every consequential action confirms inline, keeping the thing
you are deciding about readable underneath. A GP mid-clinic is always deciding
*about* something on screen.

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Reasoning | **Claude Haiku 4.5** | Fastest of the family; the doctor is waiting |
| Voice | **ElevenLabs** Conversational AI · Scribe · Flash | One vendor for the phone call, the dashboard voice, and transcription |
| Data | **Supabase** Postgres · Edge Functions · Realtime · pg_cron | Realtime is what makes a finished call appear without a refresh |
| Frontend | **TanStack Start** · React 19 · Tailwind 4 | SSR shell, client data, file-based routes |

**Name recognition** was the hardest unglamorous problem. Unbiased, Scribe hears
*"Mykyta Yakivets"* as *"Mykhailo Yakymets"* — and nothing downstream can undo
it, because by then the real name is gone. Every patient name and medication is
sent as ElevenLabs `keyterms`, which fixes it at the source.

---

## Running it

```bash
cd frontend
bun install
bun dev          # http://localhost:8080
bun test
```

`frontend/.env` needs two public values:

```
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
```

Everything else — Anthropic, ElevenLabs, Google — lives as Supabase Edge
Function secrets and never reaches the browser. See [`.env.example`](.env.example).

**Setup guides:** [Google Calendar](docs/GOOGLE_CALENDAR.md) ·
[the call agent's booking tool](docs/CALL_AGENT_BOOKING.md) ·
[deployment](docs/DEPLOY.md)

---

## Honest scope

Built in a weekend, and shaped throughout by a **practising GP** who told us
what actually matters on the screen — which is why team handoff, mood, tags and
follow-up booking are in the build at all.

Deliberately **not** built: no auth, one hardcoded doctor. Multi-doctor accounts
with shared patients are how the real product works; the shortcut is a demo
decision, not the design.

<div align="center">
<br />

**Juno × Anthropic × ElevenLabs × Supabase × Vercel** — London, July 2026

</div>
