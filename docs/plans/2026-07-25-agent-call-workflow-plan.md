# Plan 2: The Call Agent (ElevenLabs)

Owner: agent track. **Scope is the voice agent itself — not the plumbing.**
Everything that touches Supabase is Plan 1.

n8n has been dropped. The backend calls ElevenLabs directly, so there is no
workflow tool in the middle.

## What this track owns

Make an AI agent that can phone a real patient, ask the questions it is
given, and hold a conversation that doesn't feel like a phone tree.

1. **Provision a phone number** and connect it to an ElevenLabs
   Conversational AI agent (Twilio elastic SIP trunk, or a number bought
   natively through ElevenLabs).
2. **Build and tune the agent**: system prompt, voice, greeting, turn-taking,
   interruption handling. It should identify itself as calling on behalf of
   the doctor, ask the questions it was given, follow up briefly if an answer
   is unclear, and wrap up politely.
3. **Accept per-call context as dynamic variables** — the questions differ on
   every call, so they cannot be baked into the agent prompt (see contract).
4. **Prove it on a real phone.** This is the single biggest demo risk. A
   voice that sounds fine in the browser preview can sound robotic or clipped
   over a real phone line.

## Contract with Plan 1

Deliver these three things and the tracks connect:

| # | Deliverable | Notes |
|---|---|---|
| 1 | `agent_id` | The configured ElevenLabs agent |
| 2 | A working phone number attached to it | Must be able to dial a UK mobile |
| 3 | Confirmation the agent reads these dynamic variables | `patient_name`, `questions` |

The backend passes `questions` as the list the copilot drafted. The agent
must ask them in order and must not invent extra clinical questions.

**Post-call webhook:** point it at the URL Plan 1 provides. The backend
handles the transcript from there — extraction, mood scoring, and writing to
the database are not this track's problem.

## Explicitly not this track

- Placing the outbound call (backend calls the ElevenLabs API).
- Reading or writing Supabase.
- Transcript extraction, mood scoring, calendar booking.

## Latency

Do not put anything in the live audio path. The whole conversation runs
inside ElevenLabs — that is why we are using it rather than assembling
STT → LLM → TTS ourselves, which compounds delay at every hop. Give the
agent everything it needs at call start; a mid-call lookup is the fastest
way to make it feel laggy.

## Demo-readiness checklist

- [ ] One full call to a real phone, end to end, before trusting this.
- [ ] Voice sounds acceptable over a phone line, not just in-browser.
- [ ] Agent handles being interrupted without losing its place.
- [ ] Agent copes with voicemail / no answer without hanging the call.
- [ ] A clean recorded take exists for the MP4, independent of whether the
      live judging run succeeds.
