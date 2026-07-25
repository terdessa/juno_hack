/**
 * POST /agent
 *
 * The dashboard's conversational agent. Multi-turn: the client sends the whole
 * exchange each time and gets back a reply plus any UI actions to replay
 * (opening a patient, switching view).
 *
 * Replaces the one-shot /copilot, which could only ever answer once.
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.114";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { buildSystemPrompt } from "./prompt.ts";
import { executeTool, TOOL_DEFINITIONS, type UiAction } from "./tools.ts";

/** Enough for look-up → read record → act, with headroom. */
const MAX_ITERATIONS = 8;
// Haiku 4.5: fastest of the family. It predates adaptive thinking and the
// effort parameter — sending either returns a 400, so neither appears below.
const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 4096;
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

  try {
    const result = await converse(
      parsed.data.messages,
      parsed.data.current_patient_id ?? null,
      parsed.data.current_view ?? "calls",
    );
    return json(result);
  } catch (err) {
    console.error("agent failed", err);
    return json(
      {
        reply: "Sorry — I lost that one. Try again?",
        actions: [],
        // ponytail: demo data is fake; drop before this sees a real record.
        detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      },
      500,
    );
  }
});

interface AgentReply {
  reply: string;
  actions: UiAction[];
}

async function converse(
  history: { role: "user" | "assistant"; content: string }[],
  currentPatientId: string | null,
  currentView: string,
): Promise<AgentReply> {
  const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const db = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const system = buildSystemPrompt({
    now: new Date().toISOString(),
    timezone: TIMEZONE,
    doctorName: DOCTOR_NAME,
    currentPatientId,
    currentView,
  });

  const messages: Anthropic.MessageParam[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const actions: UiAction[] = [];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    if (response.stop_reason !== "tool_use") {
      return { reply: textOf(response), actions };
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      const result = await executeTool(db, toolUse.name, toolUse.input);
      if (result.action) actions.push(result.action);
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
  return {
    reply: "That got away from me — can you say it more simply?",
    actions,
  };
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
