# Letting the call agent book appointments

When a patient says "could I come in and see someone?", the ElevenLabs agent
should be able to book it there and then. The appointment lands on the doctor's
Google Calendar and in Medley's clinic diary before the call ends.

Endpoint: `POST https://czfjwmzwkifgozkmlsaa.supabase.co/functions/v1/book-appointment`

Nothing in this repo needs changing — it's deployed. What's left is one tool on
the ElevenLabs agent, which is the call-agent track's side of the contract.

## Already applied

This was applied to `agent_9601kycv0rkme9ya9wtxt5dkqspg` over the ElevenLabs
REST API on 25 Jul 2026 — the tool is `tool_8501kydpc72xexzt9zbhnp152fmy` and
the agent's prompt now points at it. Nothing below needs doing again unless the
agent is rebuilt; it is kept as the record of what the config is.

**Why it wasn't working before:** the prompt instructed the agent to book via
`calendly_create_event_invitee` and friends, with hardcoded Calendly URIs, but
`tool_ids` was empty and the only attached tools were `end_call`,
`language_detection` and `skip_turn`. It was being told to call tools it did
not have, so it could not book anything. Those 2,200 characters of dead
instructions were replaced.

`patient_name` is bound to the **dynamic variable**, not written by the model.
Letting an LLM retype a name is how "Mykyta Yakivets" arrives as "Mikita
Yakovets" and matches nobody — the same failure we fixed on the transcription
side with Scribe keyterms.

## The tool, for reference

In the ElevenLabs agent → **Tools** → a **Webhook** tool.

| Field | Value |
| --- | --- |
| Name | `book_appointment` |
| Description | `Book a face-to-face appointment with the doctor for this patient. Use it only after the patient has agreed to a specific day and time. Read back the sentence it returns.` |
| Method | `POST` |
| URL | `https://czfjwmzwkifgozkmlsaa.supabase.co/functions/v1/book-appointment` |

**Headers**

```
Content-Type: application/json
Authorization: Bearer <the Supabase anon key>
```

**Body parameters**

| Name | Type | Required | Description for the agent |
| --- | --- | --- | --- |
| `patient_name` | string | yes | `Always exactly {{patient_name}}.` |
| `starts_at` | string | yes | `The agreed start, ISO 8601, e.g. 2026-07-28T14:30. Resolve "next Tuesday" against the current time given in your instructions.` |
| `reason` | string | no | `A few words on what the appointment is for.` |
| `duration_minutes` | number | no | `Leave empty unless the patient asks for longer. Default 20.` |

## One line to add to the agent's prompt

The agent cannot resolve "next Tuesday" without knowing today. Add:

```
The current time is {{system__time_utc}} (UTC). The surgery is in London and
open 8am to 6pm. When booking, confirm the day and time out loud with the
patient first, then call book_appointment and read its reply back to them.
```

## What it answers with

Always a sentence meant to be spoken, including the refusals — the agent can
read the `spoken` field aloud verbatim and it will sound like a receptionist.

```json
{"ok": true,  "spoken": "Done — Monday 27 July at 2:00 pm. You'll get a reminder nearer the time."}
{"ok": false, "spoken": "Monday 27 July at 2:10 pm is already taken, I'm afraid. Could another time work?"}
{"ok": false, "spoken": "The surgery is only open from eight until six. What time in that window works?"}
{"ok": false, "spoken": "That time has already passed. When would suit you?"}
```

## What it refuses, and why

- **Double booking.** Any overlap with a confirmed appointment is turned away.
  Two patients in the same chair is the one thing a diary must never claim.
- **Outside 8am–6pm** London time.
- **Times in the past.**
- **A time with no offset** is *not* refused. A voice agent asked for ISO 8601
  will sometimes produce `2026-07-28T14:00`, and turning a booked appointment
  into an apology over a missing `+01:00` would be absurd — the practice's
  timezone is assumed, and it accounts for BST.

If anything fails on our side it says *"the surgery will call you back to
arrange it"* rather than inventing a booking to the patient's face. The Google
event is created **before** the row here, so there is never an appointment in
Medley that the doctor's real calendar has never heard of.

## Checking it

```sh
curl -s -X POST "https://czfjwmzwkifgozkmlsaa.supabase.co/functions/v1/book-appointment" \
  -H "Authorization: Bearer <anon key>" -H "Content-Type: application/json" \
  -d '{"patient_name":"Vlad Shuliar","starts_at":"2026-07-28T14:00","reason":"Chest review"}'
```

Then look at **Calendar → Your clinic**, and at your Google Calendar. The ✕ on
the appointment removes it from both.
