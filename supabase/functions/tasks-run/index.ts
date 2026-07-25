/**
 * POST /tasks-run  { task_id }
 *
 * Dispatches a pending task to the n8n call workflow. This is the entire
 * handoff between the backend and agent tracks: everything after this runs
 * in n8n, which writes its results back into `calls` and flips the task to
 * done.
 *
 * Note the name: Edge Functions route on the function name, so this is
 * /tasks-run rather than the /tasks/:id/run in the architecture doc.
 */

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestSchema = z.object({ task_id: z.string().uuid() });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return json({ status: "error", message: "Method not allowed." }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ status: "error", message: "Invalid JSON body." }, 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ status: "error", message: "A valid task_id is required." }, 400);
  }

  try {
    const db = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const result = await dispatch(db, parsed.data.task_id);
    return json(result, result.status === "dispatched" ? 200 : 400);
  } catch (err) {
    console.error("dispatch failed", err);
    return json(
      {
        status: "error",
        message: "Couldn't start that call.",
        // ponytail: same temporary debug aid as /copilot. Drop before real data.
        detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      },
      500,
    );
  }
});

type DispatchResult =
  | { status: "dispatched"; task_id: string }
  | { status: "error"; message: string };

async function dispatch(
  db: SupabaseClient,
  taskId: string,
): Promise<DispatchResult> {
  const { data: task, error } = await db
    .from("tasks")
    .select("id, status, questions, due_at, urgency, instruction_raw, patients(name, phone)")
    .eq("id", taskId)
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!task) return { status: "error", message: "No task with that id." };

  const patient = task.patients as unknown as
    | { name: string; phone: string | null }
    | null;
  if (!patient?.phone) {
    return {
      status: "error",
      message: "That patient has no phone number on file, so we can't call them.",
    };
  }

  // Claim the task conditionally. If another request (or a double-click) got
  // here first the row is no longer pending, no row comes back, and we stop —
  // which is what stops the patient being called twice.
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
    const response = await fetch(requireEnv("N8N_WEBHOOK_URL"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(taskId, task, patient)),
    });
    if (!response.ok) {
      throw new Error(`n8n returned ${response.status}`);
    }
  } catch (err) {
    // Release the claim so the doctor can retry, rather than stranding the
    // task in `calling` with nothing on the line.
    await db.from("tasks").update({ status: "queued" }).eq("id", taskId);
    throw err;
  }

  return { status: "dispatched", task_id: taskId };
}

/**
 * Everything n8n needs to place the call, so the workflow doesn't need
 * Supabase read credentials just to dial. It still gets task_id and can
 * re-read if it wants to.
 */
export function buildPayload(
  taskId: string,
  task: { questions: unknown; due_at: string | null; urgency: string; instruction_raw: string },
  patient: { name: string; phone: string | null },
) {
  return {
    task_id: taskId,
    patient_name: patient.name,
    patient_phone: patient.phone,
    questions: task.questions,
    due_at: task.due_at,
    urgency: task.urgency,
    doctor_instruction: task.instruction_raw,
  };
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
