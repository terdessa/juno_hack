# Connecting Calendly

When the call agent books a patient in Calendly, that appointment has to show
up in **Your clinic** on the Calendar page. Calendly pushes it to us; we do not
poll.

Endpoint: `https://czfjwmzwkifgozkmlsaa.supabase.co/functions/v1/calendly-webhook`
(deployed with `--no-verify-jwt` — Calendly signs with its own HMAC, not a
Supabase token). Opening it in a browser returns
`{"status":"ready"}`, which is what Calendly's own URL check wants to see.

## What you need to do

Three steps. Run the commands in your own terminal — **do not paste tokens into
chat.** In Claude Code, prefix with `!` to run them here.

### 1. Get a Personal Access Token

<https://calendly.com/app/admin/integrations/api_webhooks> → generate a token.
Keep it in the terminal only.

### 2. Register the webhook

Find your organization URI:

```sh
CAL=<your token>
curl -s https://api.calendly.com/users/me -H "Authorization: Bearer $CAL" \
  | python -c "import sys,json;d=json.load(sys.stdin)['resource'];print('org:',d['current_organization']);print('user:',d['uri'])"
```

Then create the subscription, pasting the `org` value in:

```sh
curl -s -X POST https://api.calendly.com/webhook_subscriptions \
  -H "Authorization: Bearer $CAL" -H "Content-Type: application/json" \
  -d '{
    "url": "https://czfjwmzwkifgozkmlsaa.supabase.co/functions/v1/calendly-webhook",
    "events": ["invitee.created", "invitee.canceled"],
    "organization": "<org uri from above>",
    "scope": "organization"
  }'
```

The response contains a **`signing_key`**. That is the last secret.

> If it returns `Permission denied`, the token is on a free plan — webhook
> subscriptions need Standard or above. Say so and we'll fall back to polling
> the scheduled-events API on a cron instead, which needs no plan upgrade.

### 3. Give us the signing key

Supabase dashboard → **Edge Functions → Secrets**
(<https://supabase.com/dashboard/project/czfjwmzwkifgozkmlsaa/functions/secrets>)

Add `CALENDLY_WEBHOOK_SIGNING_KEY` = the `signing_key` from step 2.

Until it is set, every delivery is refused with 401 "Webhook signing key is not
configured." That is deliberate: this endpoint writes to a doctor's calendar,
so an unsigned caller is turned away rather than trusted.

## Checking it worked

Book a test slot in Calendly, then:

```sh
curl -s "https://czfjwmzwkifgozkmlsaa.supabase.co/rest/v1/bookings?source=eq.calendly&select=start_at,invitee_name,reason,status" \
  -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"
```

It should also be on the Calendar page under **Your clinic**, marked
`· booked`.

## How a booking is matched to a patient

Email first — the only field meant to be unique. Then an exact name match, and
only when exactly one active patient matches. Anything less is a guess, and a
guess here files an appointment in the wrong person's record.

**An unmatched booking is still shown**, under the invitee's own name and
without a link into a record that isn't theirs. A doctor with someone in the
waiting room and a blank calendar is the one failure this must not produce.

A cancellation (`invitee.canceled`) strikes the row through rather than
deleting it.
