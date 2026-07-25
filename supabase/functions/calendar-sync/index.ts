/**
 * POST /calendar-sync
 *
 * Keeps the doctor's Google Calendar and the clinic diary in this app the same
 * thing, in both directions:
 *
 *   pull  — anything added, moved or cancelled in Google appears here.
 *   push  — an appointment booked here (by the call agent, say) appears there.
 *
 * Polled on pg_cron rather than pushed. Google Calendar's push notifications
 * need the receiving URL's domain verified in Search Console, and nobody can
 * verify supabase.co. A minute of latency is the price, and for a diary it is
 * not a price worth a second hosting story.
 *
 * Safe to run concurrently with itself: every write is keyed on the Google
 * event id, so the worst a double run does is write the same row twice.
 */

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { calendarId, createEvent, listEvents } from "../_shared/google.ts";

const SYNC_TOKEN_KEY = "google_calendar_sync_token";
/** One cron tick shouldn't try to backfill a year of bookings. */
const MAX_PUSH_PER_RUN = 20;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  // A GET is a human checking it's alive, or the dashboard's "sync now".
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ status: "error", message: "Method not allowed." }, 405);
  }

  try {
    const db = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const pulled = await pull(db);
    const pushed = await push(db);
    return json({ status: "ok", ...pulled, pushed });
  } catch (err) {
    console.error("calendar-sync failed", err);
    return json(
      { status: "error", message: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

/** Google -> here. */
async function pull(db: SupabaseClient) {
  let token = await readSyncToken(db);
  let result = await listEvents(token);

  if (result.expired) {
    // The token aged out. Start again from a window rather than giving up:
    // a sync that can't recover from this stops silently and forever.
    console.warn("google sync token expired, resyncing from scratch");
    token = null;
    result = await listEvents(null);
  }

  let written = 0;
  let cancelled = 0;
  let skipped = 0;
  let lastError: string | null = null;

  for (const event of result.events) {
    // All-day events have `date` rather than `dateTime`. They are not clinic
    // appointments — they're holidays and birthdays — and putting them in a
    // day column with no time would be noise in the one place that must not
    // have any.
    const startAt = event.start?.dateTime;
    const endAt = event.end?.dateTime;

    if (event.status === "cancelled") {
      const { data } = await db
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("calendar_event_id", event.id)
        .select("id")
        .maybeSingle();
      if (data) cancelled++;
      continue;
    }

    if (!startAt || !endAt) {
      skipped++;
      continue;
    }

    const attendee = event.attendees?.[0];
    const patientId = await matchPatient(db, attendee?.displayName ?? null, attendee?.email ?? null);

    const { error } = await db.from("bookings").upsert(
      {
        calendar_event_id: event.id,
        patient_id: patientId,
        start_at: startAt,
        end_at: endAt,
        reason: event.summary ?? "Appointment",
        kind: "appointment",
        source: "google",
        status: "confirmed",
        invitee_name: attendee?.displayName ?? null,
        invitee_email: attendee?.email ?? null,
      },
      { onConflict: "calendar_event_id" },
    );
    if (error) {
      // One bad event must not abandon the rest, and must not advance the sync
      // token past changes we haven't stored.
      console.error("booking upsert failed", event.id, error.message);
      lastError = error.message;
      skipped++;
      continue;
    }
    written++;
  }

  // Advance Google's cursor only if we actually stored everything it sent.
  // A syncToken is a promise that we have the previous batch; saving one after
  // a failure loses those events permanently, because incremental sync sends
  // each change exactly once. An all-day event that we skip on purpose is not
  // a failure and must not block the cursor.
  //
  // ponytail: a permanently-failing event will now re-fetch the same batch
  // every two minutes rather than being skipped. Loud and cheap beats silent
  // and lossy; add a per-event dead-letter if it ever actually happens.
  if (result.nextSyncToken && !lastError) {
    await writeSyncToken(db, result.nextSyncToken);
  } else if (lastError) {
    console.error("holding sync token back after a failed batch", lastError);
  }
  // `fetched` vs `pulled` is the difference between "Google sent us nothing"
  // and "Google sent us events we then failed to store" — two very different
  // bugs that look identical from a count of rows written.
  return {
    fetched: result.events.length,
    pulled: written,
    skipped,
    cancelled,
    resynced: result.expired,
    calendar: calendarId(),
    lastError,
  };
}

/** Here -> Google. Anything with no event id yet. */
async function push(db: SupabaseClient) {
  const { data, error } = await db
    .from("bookings")
    .select("id, start_at, end_at, reason, invitee_name, invitee_email, patients(name, email)")
    .is("calendar_event_id", null)
    .eq("status", "confirmed")
    .order("start_at", { ascending: true })
    .limit(MAX_PUSH_PER_RUN);
  if (error) throw new Error(error.message);

  let pushed = 0;
  for (const row of data ?? []) {
    const patient = row.patients as unknown as { name: string; email: string | null } | null;
    const who = patient?.name ?? row.invitee_name ?? "Patient";
    try {
      const eventId = await createEvent({
        summary: `${who} — ${row.reason ?? "Appointment"}`,
        description: "Booked through Medley.",
        startAt: row.start_at,
        endAt: row.end_at,
      });
      // Claimed conditionally: if another run got there first, this one must
      // not overwrite the id and orphan an event on the calendar.
      await db
        .from("bookings")
        .update({ calendar_event_id: eventId })
        .eq("id", row.id)
        .is("calendar_event_id", null);
      pushed++;
    } catch (err) {
      console.error("push to google failed", row.id, err);
    }
  }
  return pushed;
}

/**
 * Who is this? Email first — the only field meant to be unique. Then an exact
 * name, and only when exactly one active patient matches. Anything looser puts
 * an appointment in the wrong person's record.
 */
async function matchPatient(
  db: SupabaseClient,
  name: string | null,
  email: string | null,
): Promise<string | null> {
  if (email) {
    const { data } = await db
      .from("patients")
      .select("id")
      .ilike("email", email.trim())
      .eq("status", "active")
      .maybeSingle();
    if (data) return data.id;
  }
  if (name) {
    const { data } = await db
      .from("patients")
      .select("id")
      .eq("status", "active")
      .ilike("name", name.trim());
    if (data?.length === 1) return data[0].id;
  }
  return null;
}

async function readSyncToken(db: SupabaseClient): Promise<string | null> {
  const { data } = await db
    .from("sync_state")
    .select("value")
    .eq("key", SYNC_TOKEN_KEY)
    .maybeSingle();
  return data?.value ?? null;
}

async function writeSyncToken(db: SupabaseClient, value: string): Promise<void> {
  await db
    .from("sync_state")
    .upsert({ key: SYNC_TOKEN_KEY, value, updated_at: new Date().toISOString() });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
