/**
 * POST /book-appointment
 *
 * A tool for the ElevenLabs call agent. When a patient says "could I come in
 * and see someone?", the agent calls this mid-call and the appointment is on
 * the doctor's Google Calendar before they have hung up.
 *
 * Everything it returns is written to be read aloud, because that is literally
 * what happens to it — including the refusals. "That slot's taken, I could do
 * half past instead" is a sentence; a 409 is not.
 *
 * The Google event is created here rather than left to the two-minute sync, so
 * the patient is told a time that already exists on the doctor's calendar.
 */

import { createEvent } from "../_shared/google.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

/** A GP appointment. Long enough to be real, short enough to fit a clinic. */
const DEFAULT_MINUTES = 20;
const MAX_MINUTES = 60;
/** Nothing may be booked outside surgery hours, local time. */
const OPENS_HOUR = 8;
const CLOSES_HOUR = 18;
const TIMEZONE = "Europe/London";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestSchema = z.object({
  /** Passed to the agent as a dynamic variable, so it is our own exact string. */
  patient_name: z.string().min(1).max(120),
  /** ISO 8601. An offset is preferred; without one we assume the practice's. */
  starts_at: z.string().min(10).max(40),
  duration_minutes: z.number().int().min(5).max(MAX_MINUTES).optional(),
  reason: z.string().min(1).max(200).optional(),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method === "GET") {
    return json({ status: "ready", endpoint: "book-appointment", accepts: "POST" });
  }
  if (req.method !== "POST") return json({ spoken: "That didn't work." }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, spoken: "Sorry, I couldn't book that just now." }, 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return json({
      ok: false,
      spoken: "I couldn't book that — I need a day and a time.",
    });
  }

  try {
    const db = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    return json(await book(db, parsed.data));
  } catch (err) {
    console.error("book-appointment failed", err);
    // Never invent a booking to the patient's face. If we can't be sure it
    // exists, say the surgery will ring them back.
    return json({
      ok: false,
      spoken: "I couldn't get that booked. The surgery will call you back to arrange it.",
    });
  }
});

async function book(
  db: SupabaseClient,
  args: z.infer<typeof requestSchema>,
) {
  const start = parseWhen(args.starts_at);
  if (!start) return { ok: false, spoken: "I didn't catch which day and time you meant." };

  if (start.getTime() < Date.now()) {
    return { ok: false, spoken: "That time has already passed. When would suit you?" };
  }

  const hour = Number(
    start.toLocaleString("en-GB", { timeZone: TIMEZONE, hour: "2-digit", hour12: false }),
  );
  if (hour < OPENS_HOUR || hour >= CLOSES_HOUR) {
    return {
      ok: false,
      spoken: "The surgery is only open from eight until six. What time in that window works?",
    };
  }

  const minutes = args.duration_minutes ?? DEFAULT_MINUTES;
  const end = new Date(start.getTime() + minutes * 60_000);

  // The patient list is ours and the name came from it, so this is an exact
  // match by construction. A booking against the wrong record is worse than
  // no booking, so it does not guess.
  const { data: patient } = await db
    .from("patients")
    .select("id, name")
    .eq("status", "active")
    .ilike("name", args.patient_name.trim())
    .maybeSingle();

  // Two patients in the same chair is the one thing a diary must never say.
  const { data: clash } = await db
    .from("bookings")
    .select("start_at")
    .eq("status", "confirmed")
    .lt("start_at", end.toISOString())
    .gt("end_at", start.toISOString())
    .limit(1);

  if (clash?.length) {
    return {
      ok: false,
      spoken: `${spokenTime(start)} is already taken, I'm afraid. Could another time work?`,
    };
  }

  const who = patient?.name ?? args.patient_name.trim();
  const reason = args.reason?.trim() || "Appointment";

  // Google first: if it fails there is no row here claiming an appointment
  // the doctor's calendar has never heard of.
  const eventId = await createEvent({
    summary: `${who} — ${reason}`,
    description: "Booked by Medley during a follow-up call.",
    startAt: start.toISOString(),
    endAt: end.toISOString(),
  });

  const { error } = await db.from("bookings").insert({
    patient_id: patient?.id ?? null,
    calendar_event_id: eventId,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    reason,
    kind: "appointment",
    source: "google",
    status: "confirmed",
    invitee_name: who,
  });
  // The event is already on the calendar, so the patient has a real
  // appointment either way. The sync will pick the row up within two minutes.
  if (error) console.error("booking row failed after google event", eventId, error.message);

  return { ok: true, spoken: `Done — ${spokenTime(start)}. You'll get a reminder nearer the time.` };
}

/**
 * Accepts an offset, and assumes the practice's timezone without one.
 *
 * A voice agent asked for ISO 8601 will sometimes produce "2026-07-28T14:00".
 * Rejecting that would turn a booked appointment into an apology over a
 * missing "+01:00", so it is filled in rather than refused.
 */
function parseWhen(raw: string): Date | null {
  const text = raw.trim();
  const hasOffset = /(Z|[+-]\d{2}:?\d{2})$/.test(text);
  const parsed = new Date(hasOffset ? text : `${text}${offsetFor(text)}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** London is +01:00 in summer and +00:00 in winter; ask the runtime which. */
function offsetFor(localIso: string): string {
  const guess = new Date(`${localIso}Z`);
  if (Number.isNaN(guess.getTime())) return "Z";
  const name = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    timeZoneName: "shortOffset",
  })
    .formatToParts(guess)
    .find((part) => part.type === "timeZoneName")?.value;
  const match = name?.match(/GMT([+-]\d{1,2})/);
  if (!match) return "Z";
  const hours = Number(match[1]);
  return `${hours < 0 ? "-" : "+"}${String(Math.abs(hours)).padStart(2, "0")}:00`;
}

/** "Tuesday at ten past two" — this is going to be spoken, not printed. */
function spokenTime(when: Date): string {
  return when.toLocaleString("en-GB", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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
