/**
 * POST /agent
 *
 * The dashboard's conversational agent. Multi-turn: the client sends the whole
 * exchange each time and gets back a reply plus any UI actions to replay
 * (opening a patient, switching view).
 *
 * Streams. The reply used to arrive in one piece after the whole tool loop had
 * finished, which on a "ring him tomorrow about the tablets" turn meant about
 * seven seconds of silence before the doctor heard a word. Now the text goes
 * out as it is generated and the browser starts speaking the first sentence
 * while the rest is still being written.
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.114";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { buildSystemPrompt, MAX_ROSTER, type Patient } from "./prompt.ts";
import { executeTool, TOOL_DEFINITIONS, type UiAction } from "./tools.ts";

/** Enough for act → reply, with headroom for a look-up the roster didn't cover. */
const MAX_ITERATIONS = 6;
// Haiku 4.5: fastest of the family. It predates adaptive thinking and the
// effort parameter — sending either returns a 400, so neither appears below.
const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 1024;
const TIMEZONE = "Europe/London";
const DOCTOR_NAME = "Dr Hartley";
/** Keeps the prompt bounded on a long clinic-day conversation. */
const MAX_HISTORY = 24;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    .max(MAX_HISTORY),
  current_patient_id: z.string().uuid().nullish(),
  current_view: z.enum(["calls", "patients", "calendar"]).nullish(),
});

/** One frame of the reply as it is produced. */
type Event =
  | { type: "text"; text: string }
  /** The text just streamed was a preamble to a tool call — drop it. */
  | { type: "discard" }
  | { type: "action"; action: UiAction }
  | { type: "done"; reply: string }
  | { type: "error"; message: string };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") {
    return json({ reply: "Method not allowed.", actions: [] }, 405);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ reply: "Invalid JSON body.", actions: [] }, 400);
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ reply: "I didn't catch that — say it again?", actions: [] }, 400);
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const emit = (event: Event) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        await converse(
          parsed.data.messages,
          parsed.data.current_patient_id ?? null,
          parsed.data.current_view ?? null,
          emit,
        );
      } catch (err) {
        console.error("agent failed", err);
        emit({
          type: "error",
          // ponytail: demo data is fake; drop the detail before this sees a
          // real record.
          message: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});

async function converse(
  history: { role: "user" | "assistant"; content: string }[],
  currentPatientId: string | null,
  currentView: string | null,
  emit: (event: Event) => void,
): Promise<void> {
  const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const db = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const { stable, volatile } = buildSystemPrompt({
    now: new Date().toISOString(),
    timezone: TIMEZONE,
    doctorName: DOCTOR_NAME,
    currentPatientId,
    currentView,
    patients: await roster(db),
  });

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    // Only the stable half carries the breakpoint. The cached prefix is the
    // tool schemas plus everything above the clock, which is nearly all of it.
    const stream = anthropic.messages.stream({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: [
        { type: "text", text: stable, cache_control: { type: "ephemeral" } },
        { type: "text", text: volatile },
      ],
      tools: TOOL_DEFINITIONS,
      messages,
    });

    let streamed = "";
    stream.on("text", (delta) => {
      streamed += delta;
      emit({ type: "text", text: delta });
    });

    const response = await stream.finalMessage();

    if (response.stop_reason !== "tool_use") {
      emit({ type: "done", reply: textOf(response) });
      return;
    }

    // The model said something before reaching for a tool. That's a preamble
    // to work not yet done, and the real answer is still coming — so take it
    // back rather than leaving it on screen or, worse, half spoken.
    if (streamed.trim()) emit({ type: "discard" });

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      const result = await executeTool(db, toolUse.name, toolUse.input);
      if (result.action) emit({ type: "action", action: result.action });
      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result.content,
        is_error: result.content.startsWith("Error:"),
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });
  }

  console.error("agent hit iteration cap", { currentPatientId });
  emit({ type: "done", reply: "That got away from me — can you say it more simply?" });
}

/**
 * The practice list, inlined into the prompt so Medley can act on a name
 * without two round-trips to find out who it belongs to.
 */
async function roster(db: SupabaseClient): Promise<Patient[]> {
  const { data, error } = await db
    .from("patients")
    .select("id, name, dob, condition, medications, notes")
    .eq("status", "active")
    .order("last_seen_at", { ascending: false })
    .limit(MAX_ROSTER);
  if (error) {
    // Not fatal: the tools can still find people. Slower, but it answers.
    console.error("roster load failed", error.message);
    return [];
  }
  return data as Patient[];
}

function textOf(response: Anthropic.Message): string {
  return (
    response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim() || "Done."
  );
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
