/**
 * POST /calendly-webhook
 *
 * Calendly tells us when the call agent books someone, and the appointment
 * appears in the doctor's diary here. Without this the two calendars disagree,
 * which is worse than having one: a doctor trusts the screen in front of them.
 *
 * Deploy with --no-verify-jwt. Calendly signs with its own HMAC, not a Supabase
 * token, so the platform's JWT gate would reject every delivery.
 *
 * The payload shape is read defensively on purpose. Calendly has moved these
 * fields between versions — `payload.scheduled_event` vs `payload.event`,
 * `payload.uri` vs `payload.invitee.uri` — and a booking that silently fails to
 * land is exactly the failure this integration exists to prevent. Anything we
 * can't parse is logged whole and answered 200, because a retry loop won't fix
 * a shape we don't understand.
 */

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { requireEnv } from "../_shared/dispatch.ts";
import { endOrDefault, parseEvent, type CalendlyEvent } from "./parse.ts";

/** Deliveries older than this are replays, not news. */
const SIGNATURE_TOLERANCE_SECONDS = 30 * 60;

Deno.serve(async (req: Request) => {
  // Calendly checks the URL is alive before it will save a subscription, and a
  // human will paste it into a browser. Answering 405 reads as broken to both.
  if (req.method === "GET") {
    return json({ status: "ready", endpoint: "calendly-webhook", accepts: "POST" });
  }
  if (req.method !== "POST") return new Response("Method not allowed.", { status: 405 });

  const raw = await req.text();

  const verdict = await verifySignature(req.headers.get("calendly-webhook-signature"), raw);
  if (!verdict.ok) {
    console.error("rejected calendly delivery", verdict.reason);
    return new Response(verdict.reason, { status: 401 });
  }

  let body: CalendlyEvent;
  try {
    body = JSON.parse(raw) as CalendlyEvent;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  try {
    const db = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    return json(await ingest(db, body));
  } catch (err) {
    console.error("calendly-webhook failed", err);
    // 500 asks Calendly to retry, which is right for a transient database
    // failure — the booking is not recoverable from anywhere else on our side.
    return json({ status: "error", message: String(err) }, 500);
  }
});

async function ingest(db: SupabaseClient, body: CalendlyEvent) {
  const parsed = parseEvent(body);

  if (parsed.kind === "ignored") {
    // Logged whole: an unparsed shape is a code change, not a retry, and the
    // payload is the only evidence of what actually arrived.
    console.warn("calendly delivery ignored", parsed.reason, JSON.stringify(body).slice(0, 1500));
    return { status: "ignored", reason: parsed.reason };
  }

  if (parsed.kind === "cancelled") {
    const { data } = await db
      .from("bookings")
      .update({ status: "cancelled" })
      .eq("external_id", parsed.externalId)
      .select("id")
      .maybeSingle();
    // Not an error: a cancellation for a booking we never saw is a no-op, and
    // saying so beats a 500 that makes Calendly retry it forever.
    return { status: data ? "cancelled" : "ignored", booking_id: data?.id ?? null };
  }

  const booking = parsed.booking;
  const patientId = await matchPatient(db, booking.inviteeName, booking.inviteeEmail);
  if (!patientId) {
    // Recorded anyway, under the invitee's own name. See the migration note:
    // an appointment nobody can attribute still has to be in the diary.
    console.warn("calendly booking not matched to a patient", {
      name: booking.inviteeName,
      email: booking.inviteeEmail,
    });
  }

  const { data, error } = await db
    .from("bookings")
    .upsert(
      {
        external_id: booking.externalId,
        patient_id: patientId,
        start_at: booking.startAt,
        end_at: endOrDefault(booking),
        reason: booking.reason,
        kind: "appointment",
        source: "calendly",
        status: "confirmed",
        invitee_name: booking.inviteeName,
        invitee_email: booking.inviteeEmail,
      },
      { onConflict: "external_id" },
    )
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return { status: "booked", booking_id: data.id, matched: Boolean(patientId) };
}

/**
 * Who is this? Email first — it is the only thing here that is meant to be
 * unique. Name is a fallback and deliberately strict: matching "John" to the
 * only John on the list is a guess, and a guess here puts an appointment in
 * the wrong person's record.
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
      .select("id, name")
      .eq("status", "active")
      .ilike("name", name.trim());
    // Exactly one, or we don't know.
    if (data?.length === 1) return data[0].id;
  }

  return null;
}





/**
 * `t=<unix>,v1=<hmac of "t.body">` — the same scheme ElevenLabs uses, so this
 * mirrors the verification in call-webhook deliberately.
 *
 * Unlike that one, a missing key is fatal here. That webhook predated its
 * secret and dropping real transcripts was the worse failure; this endpoint
 * writes to the doctor's calendar and has no such history, so an unsigned
 * caller is refused rather than trusted.
 */
async function verifySignature(
  header: string | null,
  body: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secret = Deno.env.get("CALENDLY_WEBHOOK_SIGNING_KEY");
  if (!secret) return { ok: false, reason: "Webhook signing key is not configured." };
  if (!header) return { ok: false, reason: "Missing signature header." };

  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    }),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return { ok: false, reason: "Malformed signature header." };

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "Signature timestamp outside tolerance." };
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${body}`),
  );
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");

  return timingSafeEqual(expected, signature)
    ? { ok: true }
    : { ok: false, reason: "Signature mismatch." };
}

/** Constant-time compare, so a wrong signature can't be found byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
