/**
 * POST /copilot
 *
 * Turns a doctor's loose instruction into a structured follow-up call task,
 * via a bounded tool loop over Claude. Returns one of:
 *   { status: 'created',     task }      - task written to the tasks table
 *   { status: 'needs_input', message }   - ambiguous, agent is asking back
 *   { status: 'error',       message }   - something failed
 */

import Anthropic from "npm:@anthropic-ai/sdk@0.114";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { buildSystemPrompt } from "./prompt.ts";
import { executeTool, TERMINAL_TOOL, TOOL_DEFINITIONS } from "./tools.ts";

/** Hard cap on model turns. Prevents runaway spend and a hung request live. */
const MAX_ITERATIONS = 6;
const MODEL = "claude-opus-5";
/** Thinking is on by default and shares this budget — too low truncates mid-answer. */
const MAX_TOKENS = 4096;
/** Latency knob. Raise to "medium" if the drafted questions come out shallow. */
const EFFORT = "low";
const TIMEZONE = "Europe/London";
const DOCTOR_NAME = "Dr Hartley"; // ponytail: single hardcoded doctor, matches the UI

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const requestSchema = z.object({
  instruction: z.string().min(1).max(2000),
  current_patient_id: z.string().uuid().nullish(),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
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
    return json(
      { status: "error", message: "Say what you'd like done, in a sentence." },
      400,
    );
  }

  try {
    const result = await runCopilot(
      parsed.data.instruction,
      parsed.data.current_patient_id ?? null,
    );
    return json(result, result.status === "error" ? 500 : 200);
  } catch (err) {
    console.error("copilot failed", err);
    return json(
      {
        status: "error",
        message: "Couldn't create that task just now. Your text is still here — try again.",
        // ponytail: demo data is fake, so surfacing the cause beats guessing.
        // Drop `detail` before this touches a real patient record.
        detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      },
      500,
    );
  }
});

type CopilotResult =
  | { status: "created"; task: Record<string, unknown> }
  | { status: "needs_input"; message: string }
  | { status: "error"; message: string };

async function runCopilot(
  instruction: string,
  currentPatientId: string | null,
): Promise<CopilotResult> {
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
  });

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: instruction },
  ];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      // Leave thinking on: with it disabled, Opus 5 can emit a tool call as
      // plain text and the call silently never runs — fatal for a tool loop.
      output_config: { effort: EFFORT },
      system,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    // No tool call means the agent is talking to the doctor, not acting.
    if (response.stop_reason !== "tool_use") {
      return { status: "needs_input", message: textOf(response) };
    }

    const toolUses = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      const result = await executeTool(db, toolUse.name, toolUse.input);

      // Terminal tool succeeded: return without another model round-trip.
      if (toolUse.name === TERMINAL_TOOL && result.createdTask) {
        return { status: "created", task: result.createdTask };
      }

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

  console.error("copilot hit iteration cap", { instruction, currentPatientId });
  return {
    status: "error",
    message: "Couldn't work that one out. Try naming the patient and what to ask.",
  };
}

function textOf(response: Anthropic.Message): string {
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join(" ")
    .trim();
  return text || "Which patient did you mean?";
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
