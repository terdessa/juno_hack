/**
 * POST /call-webhook
 *
 * Where a finished call comes back. ElevenLabs posts the transcript here when
 * it hangs up; we read it, write what it established onto the call row, and
 * close the task. Realtime does the rest — the doctor's screen updates without
 * anyone refreshing anything.
 *
 * This is the last link in the loop. Until it existed, a call could be placed
 * and held perfectly and leave no trace in the practice's records.
 *
 * Deploy with --no-verify-jwt: ElevenLabs signs its requests with an HMAC, not
 * a Supabase token, so the platform's JWT gate would reject every delivery.
 */

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { asQuestions, requireEnv } from "../_shared/dispatch.ts";
import { extractOutcome, type Turn } from "./extract.ts";

/** Deliveries older than this are replays, not news. */
const SIGNATURE_TOLERANCE_SECONDS = 30 * 60;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed.", { status: 405 });
  }

  const raw = await req.text();

  const verdict = await verifySignature(req.headers.get("elevenlabs-signature"), raw);
  if (!verdict.ok) {
    console.error("rejected webhook delivery", verdict.reason);
    return new Response(verdict.reason, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw) as WebhookPayload;
  } catch {
    return new Response("Invalid JSON body.", { status: 400 });
  }

  // ElevenLabs sends several event types down one hook. Anything that isn't a
  // finished transcript is acknowledged and ignored, so it stops retrying.
  if (payload.type && payload.type !== "post_call_transcription") {
    return json({ status: "ignored", reason: `event type ${payload.type}` });
  }

  try {
    const db = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    return json(await ingest(db, payload));
  } catch (err) {
    console.error("call-webhook failed", err);
    // A 500 asks ElevenLabs to retry, which is what we want for a transient
    // failure — the transcript is not recoverable from anywhere else.
    return json(
      { status: "error", message: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

interface WebhookPayload {
  type?: string;
  data?: {
    conversation_id?: string;
    status?: string;
    transcript?: { role?: string; message?: string | null }[];
    metadata?: { call_duration_secs?: number; start_time_unix_secs?: number };
    analysis?: { transcript_summary?: string };
    conversation_initiation_client_data?: { dynamic_variables?: Record<string, unknown> };
  };
  // Older shape sent the conversation at the top level.
  conversation_id?: string;
  transcript?: { role?: string; message?: string | null }[];
}

async function ingest(db: SupabaseClient, payload: WebhookPayload) {
  const data = payload.data ?? {};
  const conversationId = data.conversation_id ?? payload.conversation_id;
  if (!conversationId) return { status: "ignored", reason: "no conversation id" };

  const { data: call, error } = await db
    .from("calls")
    .select("id, task_id, tasks(id, purpose, instruction_raw, questions, patients(name))")
    .eq("elevenlabs_conversation_id", conversationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  // A call we didn't place — someone testing the agent from the ElevenLabs
  // console. Acknowledge it so it isn't retried forever.
  if (!call) return { status: "ignored", reason: `no call for conversation ${conversationId}` };

  const task = call.tasks as unknown as {
    id: string;
    purpose: string | null;
    instruction_raw: string;
    questions: unknown;
    patients: { name: string } | null;
  } | null;

  const turns = toTurns(data.transcript ?? payload.transcript ?? []);
  const startedAt = data.metadata?.start_time_unix_secs
    ? new Date(data.metadata.start_time_unix_secs * 1000).toISOString()
    : null;
  const endedAt =
    startedAt && data.metadata?.call_duration_secs != null
      ? new Date(
          new Date(startedAt).getTime() + data.metadata.call_duration_secs * 1000,
        ).toISOString()
      : new Date().toISOString();

  // Nobody picked up, or they hung up before saying anything. There is nothing
  // to extract, and pretending otherwise would put an invented summary in a
  // medical record. Both rows go to failed so the doctor can decide to retry —
  // deliberately not re-queued, which would let the scheduler redial on a loop.
  if (!turns.some((turn) => turn.role === "patient")) {
    await db
      .from("calls")
      .update({
        transcript: turns,
        started_at: startedAt,
        ended_at: endedAt,
        status: "failed",
        tags: ["no-answer"],
        error: "The patient didn't answer, or hung up before saying anything.",
      })
      .eq("id", call.id);
    if (task) await db.from("tasks").update({ status: "failed" }).eq("id", task.id);
    return { status: "recorded", outcome: "no-answer", call_id: call.id };
  }

  const outcome = await extractOutcome({
    apiKey: requireEnv("ANTHROPIC_API_KEY"),
    patientName: task?.patients?.name ?? "the patient",
    purpose: task?.purpose ?? task?.instruction_raw ?? "Follow-up call",
    questions: asQuestions(task?.questions),
    transcript: turns,
  });

  const { error: updateError } = await db
    .from("calls")
    .update({
      transcript: turns,
      started_at: startedAt,
      ended_at: endedAt,
      status: "completed",
      summary: outcome.summary,
      mood: outcome.mood,
      tags: outcome.tags,
      follow_up_type: outcome.follow_up_type,
      extracted_answers: outcome.answers,
      error: null,
    })
    .eq("id", call.id);
  if (updateError) throw new Error(updateError.message);

  if (task) await db.from("tasks").update({ status: "completed" }).eq("id", task.id);

  return { status: "recorded", outcome: "completed", call_id: call.id };
}

/**
 * ElevenLabs calls the human "user"; the dashboard calls them the patient, and
 * labels every turn on screen with that word. Translating here keeps the word
 * "user" out of a clinical record.
 */
function toTurns(raw: { role?: string; message?: string | null }[]): Turn[] {
  return raw
    .filter((entry) => typeof entry.message === "string" && entry.message.trim().length > 0)
    .map((entry) => ({
      role: entry.role === "agent" ? ("agent" as const) : ("patient" as const),
      text: (entry.message as string).trim(),
    }));
}

/**
 * ElevenLabs signs `timestamp.body` with the webhook secret. We recompute it
 * over the exact bytes received, which is why the body is read as text and
 * parsed only afterwards — re-serialising the JSON would change it and every
 * delivery would fail to verify.
 *
 * ponytail: if no secret is configured we accept the delivery and say so
 * loudly. Deliberate, and only defensible because this project's records are
 * invented — the alternative during the hackathon is a demo that silently drops
 * every transcript because a secret wasn't pasted in. Set the secret.
 */
async function verifySignature(
  header: string | null,
  body: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secret = Deno.env.get("ELEVENLABS_WEBHOOK_SECRET");
  if (!secret) {
    console.warn("ELEVENLABS_WEBHOOK_SECRET is not set — accepting webhook unverified");
    return { ok: true };
  }
  if (!header) return { ok: false, reason: "Missing elevenlabs-signature header." };

  const parts = new Map(
    header.split(",").map((part) => {
      const index = part.indexOf("=");
      return [part.slice(0, index).trim(), part.slice(index + 1).trim()];
    }),
  );
  const timestamp = parts.get("t");
  const signature = parts.get("v0");
  if (!timestamp || !signature) return { ok: false, reason: "Malformed signature header." };

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "Signature timestamp is outside the accepted window." };
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
  const expected = [...new Uint8Array(mac)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  if (!timingSafeEqual(expected, signature)) {
    return { ok: false, reason: "Signature does not match." };
  }
  return { ok: true };
}

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
