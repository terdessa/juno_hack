# Connecting Google Calendar

Your Google Calendar and the **Your clinic** calendar in Medley are kept the
same thing, both ways:

- Anything you add or move in Google appears on the site.
- Anything booked here — including by the call agent — appears in Google.

It runs on a cron every two minutes, not a webhook. Google's calendar push
notifications require the receiving URL's domain to be verified in Search
Console, and nobody can verify `supabase.co`. Two minutes of latency is a
better trade than a second place to host something.

## What you need to do

Four steps, about ten minutes. **Run the commands in your own terminal and
never paste a token into chat** — in Claude Code, prefix a command with `!` to
run it here.

### 1. Make a Google Cloud project and turn the Calendar API on

1. <https://console.cloud.google.com/projectcreate> — call it `medley`.
2. <https://console.cloud.google.com/apis/library/calendar-json.googleapis.com>
   → **Enable**.

### 2. Set up the consent screen

<https://console.cloud.google.com/apis/credentials/consent>

- User type **External**, app name `Medley`, your email for both support and
  developer contact.
- On the **Audience** step, add your own Google account under **Test users**.
  Do this even though it's your own project — an app in testing can only be
  authorised by a listed test user.

> **Note the one-week catch.** While the app is in *Testing*, Google expires
> refresh tokens after seven days. Fine for the hackathon. If the sync ever
> stops with "Google refused the refresh token", run step 3 again. Publishing
> the app removes the limit.

### 3. Create an OAuth client and authorise once

<https://console.cloud.google.com/apis/credentials> → **Create credentials** →
**OAuth client ID** → **Web application**.

Under **Authorised redirect URIs** add exactly:

```
http://localhost:8765
```

Save, and copy the client ID and secret. Then, from the repo root:

```sh
GOOGLE_CLIENT_ID='<client id>' GOOGLE_CLIENT_SECRET='<client secret>' \
  deno run --allow-net --allow-env scripts/google-auth.ts
```

It prints a URL. Open it, approve (click through the "Google hasn't verified
this app" warning — it's your own app), and the script prints a
**refresh token**.

### 4. Put the three secrets in Supabase

<https://supabase.com/dashboard/project/czfjwmzwkifgozkmlsaa/functions/secrets>

| Name | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | from step 3 |
| `GOOGLE_CLIENT_SECRET` | from step 3 |
| `GOOGLE_REFRESH_TOKEN` | printed by the script |

Optionally `GOOGLE_CALENDAR_ID` if you want a calendar other than your main
one — otherwise it uses `primary`.

## Checking it worked

Force a sync rather than waiting for the cron:

```sh
curl -s -X POST "https://czfjwmzwkifgozkmlsaa.supabase.co/functions/v1/calendar-sync" \
  -H "Authorization: Bearer <anon key>" -H "Content-Type: application/json" -d '{}'
```

Expect `{"status":"ok","pulled":N,"cancelled":0,"pushed":M}`.

- Before the secrets are set it says exactly which one is missing.
- **Pull**: put an event in Google Calendar with a time (not all-day), sync,
  and it appears under **Your clinic**, marked `· Google`.
- **Push**: the nine seeded clinic appointments have no Google event yet, so
  the first sync creates them on your calendar — up to 20 per run.

## Things worth knowing

**All-day events are ignored** on purpose. Holidays and birthdays are not
clinic appointments, and a diary that must be scannable can't carry them.

**Matching an event to a patient** is by attendee email first, then an exact
name, and only when exactly one active patient matches. Anything looser files
an appointment in the wrong person's record. An unmatched event still appears,
under the attendee's own name and with no link into a record that isn't theirs.

**Patients are not invited.** Pushing an event does not add the patient as an
attendee, because that sends them an email from the practice — a decision for
the doctor, not a side effect of a phone call. The hook is there
(`attendeeEmail`) if you want it.

**Deleting in Google** strikes the row through here rather than removing it.

**The sync is incremental.** Google returns a `syncToken` each time, kept in
`sync_state`; the next run gets only what changed. If Google expires the token
it resyncs from a one-month window automatically rather than stopping.
