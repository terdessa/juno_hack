/**
 * POST /speak  { text }  ->  audio/mpeg
 *
 * Medley's voice on the dashboard. A proxy rather than a direct call from the
 * browser for one reason: the ElevenLabs key would otherwise be in the page
 * source, and that key can spend money and place phone calls.
 *
 * Latency is the whole point of the choices here. Flash is ElevenLabs' lowest
 * latency model, the response is streamed straight through without buffering it
 * in the function, and the bitrate is the lowest that still sounds like a person
 * — this is speech over a laptop speaker, not music.
 */

import { requireEnv } from "../_shared/dispatch.ts";
import { z } from "npm:zod@3";

/**
 * The voice the phone agent uses, so Medley sounds like one assistant.
 *
 * Pia — British, middle-aged, and built for healthcare conversation. The
 * previous voice was "Alice, Clear Engaging Educator", an e-learning
 * narrator: engineered for consistency, which is the opposite of what a call
 * to a patient wants. Keep this in step with the agent's `tts.voice_id` or
 * Medley becomes two different people depending on which end you are on.
 */
const VOICE_ID = "ZSdU1uVp8sY2zfAqIxyC";
const MODEL_ID = "eleven_flash_v2_5";
const OUTPUT_FORMAT = "mp3_22050_32";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** A spoken reply, not an essay. Anything longer is a bug upstream. */
const requestSchema = z.object({ text: z.string().min(1).max(1200) });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return fail("Method not allowed.", 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Invalid JSON body.", 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return fail("A non-empty `text` is required.", 400);

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?output_format=${OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": requireEnv("ELEVENLABS_API_KEY"),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: parsed.data.text,
          model_id: MODEL_ID,
          voice_settings: { stability: 0.55, similarity_boost: 0.85, speed: 1.05 },
        }),
      },
    );

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      console.error("tts upstream failed", upstream.status, detail.slice(0, 300));
      return fail("Couldn't reach the voice service.", 502);
    }

    // Hand the stream on untouched: reading it into memory here would add the
    // whole generation time before the first byte reached the browser.
    return new Response(upstream.body, {
      headers: { ...CORS_HEADERS, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("tts failed", err);
    return fail("Couldn't reach the voice service.", 502);
  }
});

function fail(message: string, status: number): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
