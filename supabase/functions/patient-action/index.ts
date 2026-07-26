/**
 * POST /patient-action  { patient_id, notes?, medications?, vaccinations? }
 *
 * Lets the doctor correct or add to a patient's clinical record from the
 * dashboard. Server-side for the same reason every other write is: the anon
 * key in the browser holds SELECT and nothing else, and widening that would
 * let anyone with the page open rewrite the practice's clinical notes.
 *
 * Every field is optional and only the ones present are changed — this is a
 * partial update, not a replace-the-whole-record call, so the notes editor
 * and the medications editor can save independently without clobbering each
 * other's field.
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
  patient_id: z.string().uuid(),
  // Empty string is a deliberate "clear the notes" — undefined means "leave
  // it alone", so the two are not interchangeable here.
  notes: z.string().max(4000).optional(),
  medications: z.array(z.string().min(1).max(200)).max(50).optional(),
  vaccinations: z.array(z.string().min(1).max(200)).max(50).optional(),
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
    return json({ ok: false, message: "That isn't a record I can save." }, 400);
  }

  const { patient_id: patientId, ...fields } = parsed.data;
  const update: Record<string, unknown> = {};
  if (fields.notes !== undefined) update.notes = fields.notes;
  if (fields.medications !== undefined) update.medications = fields.medications;
  if (fields.vaccinations !== undefined) update.vaccinations = fields.vaccinations;

  if (Object.keys(update).length === 0) {
    return json({ ok: false, message: "Nothing to save." }, 400);
  }

  try {
    const db = createClient(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data, error } = await db
      .from("patients")
      .update(update)
      .eq("id", patientId)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!data) return json({ ok: false, message: "That patient record no longer exists." }, 404);
    return json({ ok: true });
  } catch (err) {
    console.error("patient-action failed", err);
    return json({ ok: false, message: "The practice system didn't save that." }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}
