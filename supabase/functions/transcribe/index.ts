/**
 * POST /transcribe  (multipart, field `audio`)  ->  { text }
 *
 * Ears for the browsers that don't have their own. Chrome and Edge ship the Web
 * Speech API, which recognises locally and returns words as they're spoken — no
 * upload, no round trip, nothing faster available. Safari and Firefox don't, and
 * before this the microphone was simply a dead control there.
 *
 * So this is the fallback, not the default: it costs a recording plus an upload,
 * which native recognition doesn't. Scribe is used rather than OpenAI's
 * transcription because the ElevenLabs key is already here for the phone calls.
 */

import { requireEnv } from "../_shared/dispatch.ts";

const SCRIBE_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const MODEL_ID = "scribe_v1";
/** One spoken instruction. Anything larger is a misuse, not a long sentence. */
const MAX_BYTES = 8 * 1024 * 1024;

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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
