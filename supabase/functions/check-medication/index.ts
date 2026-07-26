/**
 * POST /check-medication
 *
 * A tool for the ElevenLabs call agent. When a patient says "I've forgotten
 * what I'm meant to be taking" or "how often is this again?", the agent calls
 * this mid-call and reads back exactly what's on file — nothing more.
 *
 * Deliberately does not attempt to parse a dose or frequency out of free-text
 * notes and speak it as an instruction. A voice agent inventing "take two
 * tablets twice a day" from a note that doesn't actually say that is a real
 * safety risk, not a rounding error. So this reads back what the record
 * literally says and always closes with the same caveat: check the label or
 * ring the surgery for anything the patient needs to act on. Same shape as
 * book-appointment — everything returned is written to be spoken aloud.
 */

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

/** Notes are a free-text clinical field, not written to be read aloud in
 * full. Long enough to carry the relevant line, short enough not to turn
 * into a monologue on the phone. */
const MAX_NOTES_CHARS = 300;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestSchema = z.object({
  /** Passed to the agent as a dynamic variable, so it is our own exact string. */
  patient_name: z.string().min(1).max(120),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method === "GET") {
    return json({ status: "ready", endpoint: "check-medication", accepts: "POST" });
  }
  if (req.method !== "POST") return json({ spoken: "That didn't work." }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, spoken: "Sorry, I couldn't look that up just now." }, 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return json({
      ok: false,
      spoken: "I didn't catch who I'm looking that up for.",
    });
  }

  try {
    const db = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    return json(await lookup(db, parsed.data));
  } catch (err) {
    console.error("check-medication failed", err);
    // Never guess at medication detail. If we can't be sure of the record,
    // say so plainly rather than inventing an answer.
    return json({
      ok: false,
      spoken: "I'm not able to pull that up right now — it's best to check your prescription label or call the surgery.",
    });
  }
});

async function lookup(
  db: SupabaseClient,
  args: z.infer<typeof requestSchema>,
) {
  // The patient list is ours and the name came from it, so this is an exact
  // match by construction — same reasoning as book-appointment.
  const { data: patient } = await db
    .from("patients")
    .select("medications, notes")
    .eq("status", "active")
    .ilike("name", args.patient_name.trim())
    .maybeSingle();

  if (!patient) {
    return {
      ok: false,
      spoken: "I'm not able to find your record right now — it's best to check with the surgery directly.",
    };
  }

  const medications = asStringList(patient.medications);
  const notes = typeof patient.notes === "string" ? patient.notes.trim() : "";

  if (!medications.length && !notes) {
    return {
      ok: false,
      spoken: "I don't have medication details on file for you — please check your prescription label or call the surgery to confirm.",
    };
  }

  const parts: string[] = [];
  if (medications.length) {
    parts.push(`Your record shows you're currently on: ${medications.join(", ")}.`);
  }
  if (notes) {
    parts.push(`The doctor's note on file says: ${truncate(notes, MAX_NOTES_CHARS)}.`);
  }
  parts.push(
    "For the exact dose and timing, it's best to double-check your prescription label or call the surgery to confirm.",
  );

  return { ok: true, spoken: parts.join(" ") };
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim());
}

/** Cuts at a word boundary rather than mid-word, since this gets read aloud. */
function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : max)}…`;
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
