/**
 * POST /tasks-run  { task_id }
 *
 * "Call this patient now", regardless of when the task was scheduled for. The
 * dialling itself lives in _shared/dispatch.ts, because the scheduler has to
 * behave identically — see the note there.
 *
 * Note the name: Edge Functions route on the function name, so this is
 * /tasks-run rather than the /tasks/:id/run in the architecture doc.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { dispatchTask, requireEnv } from "../_shared/dispatch.ts";

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
    const result = await dispatchTask(db, parsed.data.task_id);
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
