/**
 * Placing a call.
 *
 * Shared because two callers need identical behaviour: the doctor pressing
 * "call now" (/tasks-run) and the clock reaching a task's due time
 * (/tasks-due). Any difference between those two paths would be a bug — a
 * scheduled call that behaves unlike a manual one is a call nobody can debug
 * live.
 *
 * n8n used to sit in the middle of this. It doesn't any more: we hold the
 * ElevenLabs key, so the hop only added a second place for the demo to break.
 */

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const OUTBOUND_CALL_URL = "https://api.elevenlabs.io/v1/convai/twilio/outbound-call";

export type DispatchResult =
  | { status: "dispatched"; task_id: string; conversation_id: string | null }
  | { status: "error"; message: string };

interface TaskRow {
  id: string;
  status: string;
  questions: unknown;
  purpose: string | null;
  instruction_raw: string;
  patients: { name: string; phone: string | null } | null;
}

export async function dispatchTask(db: SupabaseClient, taskId: string): Promise<DispatchResult> {
  const { data, error } = await db
    .from("tasks")
    .select("id, status, questions, purpose, instruction_raw, patients(name, phone)")
    .eq("id", taskId)
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "No task with that id." };

  const task = data as unknown as TaskRow;
  const patient = task.patients;
  if (!patient) return { status: "error", message: "That task has no patient attached." };

  const phone = normalisePhone(patient.phone);
  if (!phone) {
    return {
      status: "error",
      message: patient.phone
        ? `${patient.name}'s number (${patient.phone}) isn't a diallable format — it needs a country code.`
        : `${patient.name} has no phone number on file, so we can't call them.`,
    };
  }

  const questions = asQuestions(task.questions);
  if (!questions.length) {
    return {
      status: "error",
      message: "That task has no questions yet, so there'd be nothing to ask.",
    };
  }

  // Claim the task before dialling, and only if it is still queued. A
  // double-click, or the scheduler firing while the doctor presses the button,
  // finds the row already moved on and stops here — which is what prevents a
  // patient being phoned twice about the same thing.
  const { data: claimed } = await db
    .from("tasks")
    .update({ status: "calling" })
    .eq("id", taskId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return {
      status: "error",
      message: `That task is already ${task.status}, so it wasn't started again.`,
    };
  }

  try {
    const conversationId = await placeCall({
      toNumber: phone,
      patientName: patient.name,
      questions,
    });

    // The call row is how the dashboard shows a call in flight, and how the
    // post-call webhook finds its way back to this task.
    await db.from("calls").insert({
      task_id: taskId,
      started_at: new Date().toISOString(),
      status: "calling",
      elevenlabs_conversation_id: conversationId,
    });

    return { status: "dispatched", task_id: taskId, conversation_id: conversationId };
  } catch (err) {
    // Release the claim rather than stranding the task in `calling` with
    // nothing on the line, and keep the reason where the doctor can read it.
    const message = err instanceof Error ? err.message : String(err);
    await db.from("tasks").update({ status: "queued" }).eq("id", taskId);
    await db.from("calls").insert({
      task_id: taskId,
      started_at: new Date().toISOString(),
      ended_at: new Date().toISOString(),
      status: "failed",
      error: message,
    });
    return { status: "error", message: `Couldn't place the call: ${message}` };
  }
}

async function placeCall(args: {
  toNumber: string;
  patientName: string;
  questions: string[];
}): Promise<string | null> {
  const response = await fetch(OUTBOUND_CALL_URL, {
    method: "POST",
    headers: {
      "xi-api-key": requireEnv("ELEVENLABS_API_KEY"),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: requireEnv("ELEVENLABS_AGENT_ID"),
      agent_phone_number_id: requireEnv("ELEVENLABS_PHONE_NUMBER_ID"),
      to_number: args.toNumber,
      conversation_initiation_client_data: {
        dynamic_variables: {
          patient_name: args.patientName,
          // The agent reads this straight into its prompt, so it wants prose
          // it can speak, not JSON.
          questions: args.questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
        },
      },
    }),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`ElevenLabs refused the call (${response.status}): ${raw.slice(0, 300)}`);
  }

  const body = JSON.parse(raw) as { conversation_id?: string; success?: boolean; message?: string };
  if (body.success === false) throw new Error(body.message ?? "ElevenLabs reported failure.");
  return body.conversation_id ?? null;
}

/**
 * Twilio dials E.164 and nothing else. The seed data carries numbers as a human
 * would write them — "+44 7700 900123" — so the spaces and punctuation come out
 * here rather than at every call site.
 */
export function normalisePhone(raw: string | null): string | null {
  if (!raw) return null;
  // Anything in brackets is an annotation, not part of the number: several
  // records read "+44 20 7946 0011 (landline)".
  const stripped = raw.replace(/\(.*?\)/g, "").replace(/[^\d+]/g, "");
  if (!/^\+\d{8,15}$/.test(stripped)) return null;
  return stripped;
}

export function asQuestions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((q): q is string => typeof q === "string" && q.trim().length > 0);
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}
