# Deploy runbook

Everything here is run from the repo root in PowerShell. The project ref is
`czfjwmzwkifgozkmlsaa` throughout.

Where things live: **database and Edge Functions on Supabase, frontend on
Vercel.** Nothing else holds state — there is no n8n, no second credential
store, and the voice agent reads no database.

Work through this in order. Steps 1-5 are the backend; nothing works until they
are all done.

---

## 1. Log in and link

```powershell
npx supabase login
npx supabase link --project-ref czfjwmzwkifgozkmlsaa
```

`login` opens a browser. `link` will ask for the database password — it is on
the Supabase dashboard under Project Settings → Database.

## 2. Set the function secrets

This reads the keys already in your local `.env`, so nothing secret is typed
into a terminal or scrolls up your history.

```powershell
$e = @{}
Get-Content .env | ForEach-Object { if ($_ -match '^([A-Z_]+)=(.+)$') { $e[$matches[1]] = $matches[2] } }
npx supabase secrets set --project-ref czfjwmzwkifgozkmlsaa `
  "ANTHROPIC_API_KEY=$($e.ANTHROPIC_API_KEY)" `
  "ELEVENLABS_API_KEY=$($e.ELEVENLABS_API_KEY)" `
  "ELEVENLABS_AGENT_ID=agent_9601kycv0rkme9ya9wtxt5dkqspg" `
  "ELEVENLABS_PHONE_NUMBER_ID=phnum_7501kyd0qfmfe1hrnphvtmjbmraf"
```

Check it took:

```powershell
npx supabase secrets list --project-ref czfjwmzwkifgozkmlsaa
```

`ELEVENLABS_WEBHOOK_SECRET` is set later, in step 6, because it doesn't exist
until the webhook does.

## 3. Apply the schema change

Paste the whole of `supabase/migrations/0002_live_calls.sql` into the Supabase
SQL editor and run it.

Use the editor rather than `supabase db push`: the live database was edited by
hand after 0001 was applied, so the CLI's migration history doesn't match what's
actually there and a push would try to re-run 0001 against tables that already
exist. 0002 is written to be safe to run twice, so a re-run costs nothing.

## 4. Deploy the functions

```powershell
npx supabase functions deploy --project-ref czfjwmzwkifgozkmlsaa
```

That deploys all seven. `config.toml` already carries the one per-function
setting that matters — `call-webhook` is exempt from JWT verification, because
ElevenLabs signs with an HMAC instead and would otherwise be turned away at the
door.

Smoke test the two that need no side effects:

```powershell
$anon = ((Get-Content frontend/.env | Select-String 'VITE_SUPABASE_ANON_KEY').Line -replace '^[^=]+=','').Trim()
$base = "https://czfjwmzwkifgozkmlsaa.supabase.co/functions/v1"
$h = @{ Authorization = "Bearer $anon"; "Content-Type" = "application/json" }

# Should answer in a sentence, in about two seconds.
Invoke-RestMethod -Uri "$base/agent" -Method POST -Headers $h `
  -Body '{"messages":[{"role":"user","content":"who is on my patient list?"}]}'

# Should return audio/mpeg, a few tens of KB.
Invoke-WebRequest -UseBasicParsing -Uri "$base/speak" -Method POST -Headers $h `
  -Body '{"text":"Testing, one two."}' -OutFile test.mp3
```

## 5. Start the clock

`tasks-due` is what makes "call him at twelve" mean anything. pg_cron calls it
once a minute. Run this in the SQL editor, pasting your **service role key**
(Project Settings → API) into the first line:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Stored in the vault so the key isn't sitting in the cron job definition,
-- which is world-readable to anyone with database access.
select vault.create_secret('PASTE_SERVICE_ROLE_KEY_HERE', 'service_role_key');

select cron.schedule(
  'dispatch-due-calls',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://czfjwmzwkifgozkmlsaa.supabase.co/functions/v1/tasks-due',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
```

Confirm it is running, after a minute or two:

```sql
select jobname, schedule, active from cron.job;
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'dispatch-due-calls')
order by start_time desc limit 5;
```

An idle tick is a success: `tasks-due` returns `{"status":"idle","dispatched":0}`
when nothing is due.

## 6. Point ElevenLabs at the transcript receiver

Until this is done, calls happen and leave no record.

1. ElevenLabs dashboard → Settings → Webhooks → **Create webhook**.
   - URL: `https://czfjwmzwkifgozkmlsaa.supabase.co/functions/v1/call-webhook`
   - Copy the signing secret it shows you. It is shown once.
2. Agent (`agent_9601kycv0rkme9ya9wtxt5dkqspg`) → Analysis / Webhooks → set it
   as the **post-call webhook**, with the transcript included.
3. Give the secret to the function:

```powershell
npx supabase secrets set --project-ref czfjwmzwkifgozkmlsaa "ELEVENLABS_WEBHOOK_SECRET=whsec_..."
```

If that secret is missing the function still accepts deliveries, but logs a
warning on every one. That is a deliberate hackathon trade — a demo that drops
every transcript because a secret wasn't pasted is worse than an unverified one
over invented records. Set it anyway.

## 7. Give the patients real phone numbers

The agent dials whatever is on the patient's record, so this is the only place a
number needs to exist. The seeded numbers are placeholders and will fail.

E.164 only — a leading `+`, country code, no spaces. The dispatcher strips
punctuation and parenthetical notes, but it will refuse anything without a
country code rather than guess.

```sql
update patients set phone = '+447700900123' where name = 'John Whitfield';
update patients set phone = '+447700900124' where name = 'Margaret Ellis';
update patients set phone = '+447700900125' where name = 'Daniel Osei';
update patients set phone = '+447700900126' where name = 'Priya Raman';
update patients set phone = '+447700900127' where name = 'Arthur Boyd';
```

For the live demo, point at least one of them at a phone in the room.

### The Twilio account is on trial, and this will bite

Verified against the live API on 25 Jul: an unverified number is refused
outright.

```
{"success":false,"message":"HTTP 400 error: Unable to create record:
 The number +15005550001 is unverified. Trial accounts may only make
 calls to verified numbers.","conversation_id":null,"callSid":null}
```

So before the demo, either **verify the demo phone** in the Twilio console
(Phone Numbers → Verified Caller IDs) or upgrade the account off trial. A trial
account also plays a disclaimer the recipient must press a key through, which is
survivable on stage but worth rehearsing so nobody panics at the silence.

Note the status code in that response: **200**. ElevenLabs reports a refused
call as a successful HTTP request with `success: false` in the body. `placeCall`
checks the flag rather than the status, which is the difference between the
dashboard saying "the phone is ringing" and it being true.

## 8. Frontend on Vercel

Root directory `frontend`. Two environment variables, both safe to expose —
the anon key is designed for browsers:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://czfjwmzwkifgozkmlsaa.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the publishable key from Project Settings → API |

The service role key must never be set here.

---

## End-to-end check

1. Open the dashboard and tell Medley: *"ring John in two minutes to see how the
   ramipril is going"*. A task appears in the calls list, queued, with the
   questions it drafted.
2. Wait. Within a minute of the due time the phone rings — nobody pressed
   anything. On a Twilio trial account you must press a key to get past the
   disclaimer.
3. Answer the questions and hang up.
4. The task flips to completed on screen without a refresh, carrying a summary,
   a mood, and an answer against each question.
5. Ask Medley *"what did John say?"* and it reads back the same thing.

If step 4 doesn't happen, it is step 6 — check the function logs:

```powershell
npx supabase functions logs call-webhook --project-ref czfjwmzwkifgozkmlsaa
```
