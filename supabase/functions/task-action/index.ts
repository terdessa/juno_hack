/**
 * POST /task-action  { task_id, action: "cancel" | "restore" | "delete" }
 *
 * The dashboard's writes to a task, done server-side.
 *
 * They can't be done from the browser: the anon key is compiled into the
 * JavaScript bundle and is therefore public, so granting it UPDATE or DELETE
 * on `tasks` would let anyone with the page open wipe the practice's list.
 * It holds SELECT and nothing else, which is why declining a call came back
 * as "permission denied for table tasks". The service-role key lives here and
 * only here.
 *
 * Every action is conditional on the status it expects to find. pg_cron runs
 * once a minute, so "decline this call" and "start dialling it" genuinely
 * race, and the loser has to be told rather than silently winning.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { requireEnv } from "../_shared/dispatch.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestSchema = z.object({
  task_id: z.string().uuid(),
  action: z.enum(["cancel", "restore", "delete"]),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ ok: false, message: "Method not allowed." }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "Invalid JSON body." }, 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ ok: false, message: "That isn't a task I can act on." }, 400);
  }

  const { task_id: taskId, action } = parsed.data;
  const db = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  try {
    const { data: task, error: readError } = await db
      .from("tasks")
      .select("id, status")
      .eq("id", taskId)
      .maybeSingle();
    if (readError) throw readError;
    if (!task) return json({ ok: false, message: "That call no longer exists." }, 404);

    if (action === "delete") {
      // A call in flight has a phone ringing at the other end. Deleting the
      // row wouldn't stop it, it would only lose the record that it happened.
      if (task.status === "calling") {
        return json(
          { ok: false, message: "That call is happening now, so it can't be deleted yet." },
          409,
        );
      }
      // Calls reference tasks and the schema declares no cascade.
      const { error: callsError } = await db.from("calls").delete().eq("task_id", taskId);
      if (callsError) throw callsError;
      const { error } = await db.from("tasks").delete().eq("id", taskId);
      if (error) throw error;
      return json({ ok: true });
    }

    const from = action === "cancel" ? "queued" : "cancelled";
    const to = action === "cancel" ? "cancelled" : "queued";

    const { data: changed, error } = await db
      .from("tasks")
      .update({ status: to })
      .eq("id", taskId)
      .eq("status", from)
      .select("id")
      .maybeSingle();
    if (error) throw error;

    if (!changed) {
      return json({
        ok: false,
        message:
          action === "cancel"
            ? task.status === "calling"
              ? "That call already started, so it couldn't be declined."
              : `That call is already ${task.status}.`
            : "That call is no longer declined.",
      });
    }

    return json({ ok: true });
  } catch (err) {
    console.error("task-action failed", action, err);
    return json({ ok: false, message: "The practice system didn't save that." }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
