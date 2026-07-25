/**
 * POST /transcribe  (multipart, field `audio`)  ->  { text }
 *
 * Ears for the dashboard. Scribe is used rather than OpenAI's transcription
 * because the ElevenLabs key is already here for the phone calls.
 *
 * It is told who the practice's patients are before it listens. Left to
 * itself Scribe transcribes a name it has never seen as the nearest common
 * one — "Mykyta Yakivets" came back as "Mykhailo Yakymets", "Tyshkovets" as
 * "Tishkovets", "Shuliar" as "Shuliak" — and no amount of cleverness further
 * down can reliably undo that, because by then the real name is gone. With the
 * roster passed as keyterms the same recording transcribes all three exactly.
 *
 * Medications ride along for the same reason: "omeprazole" and "ramipril" are
 * as foreign to a general recogniser as a Ukrainian surname, and they end up
 * in the questions a patient gets asked on the phone.
 */

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { requireEnv } from "../_shared/dispatch.ts";

const SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const MODEL_ID = "scribe_v1";
/** One spoken instruction. Anything larger is a misuse, not a long sentence. */
const MAX_BYTES = 8 * 1024 * 1024;
/**
 * ElevenLabs allows 1000, but at 100 or more it starts billing a 20-second
 * minimum per request — and these requests are two seconds of speech.
 */
const MAX_KEYTERMS = 99;
/** Each term must be under 50 characters and at most five words. */
const MAX_KEYTERM_LENGTH = 49;
/** The roster changes about never; the microphone opens constantly. */
const ROSTER_TTL_MS = 60_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ message: "Method not allowed." }, 405);

  let audio: File | null = null;
  try {
    const form = await req.formData();
    const field = form.get("audio");
    if (field instanceof File) audio = field;
  } catch {
    return json({ message: "Expected a multipart form with an `audio` file." }, 400);
  }

  if (!audio) return json({ message: "Expected a multipart form with an `audio` file." }, 400);
  if (audio.size === 0) return json({ message: "That recording was empty." }, 400);
  if (audio.size > MAX_BYTES) return json({ message: "That recording is too long." }, 413);

  try {
    const upstream = new FormData();
    upstream.append("file", audio, audio.name || "speech.webm");
    upstream.append("model_id", MODEL_ID);
    // The doctor is speaking English; saying so skips language detection.
    upstream.append("language_code", "eng");
    // One field per term. A JSON array in a single field is read as one
    // 60-character keyword and rejected; bracket notation is accepted and
    // silently ignored, which is worse. Repeated fields are what works.
    for (const term of await keyterms()) upstream.append("keyterms", term);

    const response = await fetch(SCRIBE_URL, {
      method: "POST",
      headers: { "xi-api-key": requireEnv("ELEVENLABS_API_KEY") },
      body: upstream,
    });

    const raw = await response.text();
    if (!response.ok) {
      console.error("scribe failed", response.status, raw.slice(0, 300));
      return json({ message: "Couldn't make out that recording." }, 502);
    }

    const { text } = JSON.parse(raw) as { text?: string };
    if (!text?.trim()) return json({ message: "I didn't hear anything." }, 422);
    return json({ text: text.trim() });
  } catch (err) {
    console.error("transcribe failed", err);
    return json({ message: "Couldn't reach the transcription service." }, 502);
  }
});

let cached: { terms: string[]; at: number } | null = null;

/**
 * What the recogniser should expect to hear: every patient's full name, each
 * part of it on its own — the doctor says "ring Mykyta", not the surname — and
 * the medications they are on.
 */
async function keyterms(): Promise<string[]> {
  if (cached && Date.now() - cached.at < ROSTER_TTL_MS) return cached.terms;

  try {
    const db: SupabaseClient = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const { data, error } = await db
      .from("patients")
      .select("name, medications")
      .eq("status", "active");
    if (error) throw error;

    const names: string[] = [];
    const drugs: string[] = [];
    for (const row of data ?? []) {
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (name) {
        names.push(name);
        // A first name alone is how most of these are actually spoken.
        for (const part of name.split(/\s+/)) if (part.length > 2) names.push(part);
      }
      if (Array.isArray(row.medications)) {
        for (const med of row.medications) {
          // "Ramipril 5mg once daily" biases worse than "Ramipril" — the dose
          // is the part that varies, and it eats the five-word limit.
          if (typeof med === "string" && med.trim()) drugs.push(med.trim().split(/\s+/)[0]);
        }
      }
    }

    // Names first: if anything is dropped at the cap it should be a drug.
    const terms = [...new Set([...names, ...drugs])]
      .filter((t) => t.length <= MAX_KEYTERM_LENGTH && !/[<>{}[\]\\]/.test(t))
      .slice(0, MAX_KEYTERMS);

    cached = { terms, at: Date.now() };
    return terms;
  } catch (err) {
    // A transcript with a mangled name beats no transcript at all.
    console.error("keyterms unavailable", err);
    return [];
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
