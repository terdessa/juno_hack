/**
 * POST /tasks-due
 *
 * The clock. pg_cron pokes this once a minute; it dials every task whose due
 * time has arrived. This is what makes "call him at twelve" mean anything —
 * without it a scheduled task just sits in the list looking scheduled.
 *
 * Takes no arguments and is idempotent: dispatchTask claims each row
 * conditionally, so two overlapping ticks can't both dial the same patient.
 */

import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { dispatchTask, requireEnv } from "../_shared/dispatch.ts";

/**
 * Only the voice agent's own tasks get dialled automatically. A task assigned
 * to a human colleague is on their list, not the phone system's — auto-calling
 * those would be the agent doing someone else's job uninvited.
 */
const AGENT_ASSIGNEES = ["medley", "medley-triage"];

/**
 * How far past its due time a task may still be dialled. A task that fell
 * through while the scheduler was down should not surprise everyone by ringing
 * out hours later — and on a demo laptop, seeded past-dated tasks would
 * otherwise all fire at once the first time cron ran.
 */
const GRACE_MINUTES = 60;

/** A ceiling per tick, so one bad state can't phone the whole patient list. */
const MAX_PER_TICK = 3;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ status: "error", message: "Method not allowed." }, 405);
  }

  try {
    const db = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    return json(await dispatchDue(db));
  } catch (err) {
    console.error("tasks-due failed", err);
    return json(
      {
        status: "error",
        message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      },
      500,
    );
  }
});

async function dispatchDue(db: SupabaseClient) {
  const now = Date.now();
  const floor = new Date(now - GRACE_MINUTES * 60_000).toISOString();

  const { data, error } = await db
    .from("tasks")
    .select("id, due_at")
    .eq("status", "queued")
    .in("assignee_id", AGENT_ASSIGNEES)
    .lte("due_at", new Date(now).toISOString())
    .gte("due_at", floor)
    .order("due_at", { ascending: true })
    .limit(MAX_PER_TICK);

  if (error) throw new Error(error.message);
  if (!data?.length) return { status: "idle" as const, dispatched: 0 };

  // Sequentially, not in parallel: these are outbound phone calls, and a burst
  // of them is both rude and a good way to hit a provider rate limit.
  const results = [];
  for (const task of data) {
    const result = await dispatchTask(db, task.id);
    if (result.status === "error") {
      console.error("scheduled dispatch failed", { task_id: task.id, message: result.message });
    }
    results.push({ task_id: task.id, ...result });
  }

  return {
    status: "ran" as const,
    dispatched: results.filter((r) => r.status === "dispatched").length,
    results,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
