/**
 * POST /inbox-action  { item_id, action: "done" | "dismiss" | "reopen" }
 *
 * Clearing something off the doctor's inbox. Server-side for the same reason
 * every other write is: the anon key in the browser holds SELECT and nothing
 * else, and widening that would let anyone with the page open clear the
 * practice's list of things not to forget.
 *
 * Nothing is ever deleted. "Done" and "dismissed" are different answers to
 * "did this get dealt with?", and both are worth keeping — an item that was
 * dismissed and shouldn't have been is a thing you want to be able to find.
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
  item_id: z.string().uuid(),
  action: z.enum(["done", "dismiss", "reopen"]),
});

const STATUS: Record<string, string> = {
  done: "done",
  dismiss: "dismissed",
  reopen: "open",
};

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
    return json({ ok: false, message: "That isn't an inbox item I can act on." }, 400);
  }

  const { item_id: itemId, action } = parsed.data;
  const status = STATUS[action];

  try {
    const db = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data, error } = await db
      .from("inbox_items")
      .update({
        status,
        resolved_at: status === "open" ? null : new Date().toISOString(),
      })
      .eq("id", itemId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return json({ ok: false, message: "That item no longer exists." }, 404);
    return json({ ok: true });
  } catch (err) {
    console.error("inbox-action failed", action, err);
    return json({ ok: false, message: "The practice system didn't save that." }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
