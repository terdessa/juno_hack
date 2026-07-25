/**
 * POST /booking-action  { booking_id, action: "delete" }
 *
 * Removing an appointment from the doctor's diary, here and in Google at the
 * same time. The two calendars are meant to be one thing, so deleting in one
 * place and not the other is the failure this whole integration exists to
 * prevent.
 *
 * Server-side because the anon key the browser holds can only read, and
 * because the Google credentials live here and must never reach a client.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { deleteEvent } from "../_shared/google.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestSchema = z.object({
  booking_id: z.string().uuid(),
  action: z.literal("delete"),
});

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

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
    return json({ ok: false, message: "That isn't an appointment I can act on." }, 400);
  }

  try {
    const db = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data: booking, error } = await db
      .from("bookings")
      .select("id, calendar_event_id")
      .eq("id", parsed.data.booking_id)
      .maybeSingle();
    if (error) throw error;
    if (!booking) return json({ ok: false, message: "That appointment no longer exists." }, 404);

    // Google first, deliberately. If it fails we still have the row, and the
    // doctor is told; the other order would leave an appointment on their
    // real calendar with nothing here pointing at it.
    if (booking.calendar_event_id) {
      try {
        await deleteEvent(booking.calendar_event_id);
      } catch (err) {
        console.error("google delete failed", booking.calendar_event_id, err);
        return json({
          ok: false,
          message: "Couldn't remove it from your Google Calendar, so nothing was changed here.",
        });
      }
    }

    const { error: deleteError } = await db.from("bookings").delete().eq("id", booking.id);
    if (deleteError) throw deleteError;

    return json({ ok: true });
  } catch (err) {
    console.error("booking-action failed", err);
    return json({ ok: false, message: "The practice system didn't save that." }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
