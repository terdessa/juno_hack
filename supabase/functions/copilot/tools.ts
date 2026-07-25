/**
 * Tool definitions and implementations for the copilot agent.
 *
 * LLM tool arguments are untrusted input: every implementation re-validates
 * its args before touching Postgres. All queries are parameterised through
 * supabase-js — no string-built SQL anywhere.
 */

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";

export const MAX_QUESTIONS = 5;
export const MAX_QUESTION_LENGTH = 200;
/** Shown as the task's one-line title on the dashboard. */
export const MAX_PURPOSE_LENGTH = 120;
/** The voice agent. Tasks can be reassigned to a colleague from the UI. */
export const DEFAULT_ASSIGNEE = "medley";
export const SEARCH_RESULT_LIMIT = 10;
export const RECENT_HISTORY_LIMIT = 3;

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

export const searchPatientsArgs = z.object({
  query: z.string().min(1).max(100),
});

export const getPatientRecordArgs = z.object({
  patient_id: z.string().uuid(),
});

export const createCallTaskArgs = z.object({
  patient_id: z.string().uuid(),
  purpose: z.string().min(1).max(MAX_PURPOSE_LENGTH),
  questions: z
    .array(z.string().min(1).max(MAX_QUESTION_LENGTH))
    .min(1)
    .max(MAX_QUESTIONS),
  due_at: z.string().datetime({ offset: true }),
  urgency: z.enum(["low", "normal", "high"]),
  instruction_raw: z.string().min(1).max(2000),
});

// ---------------------------------------------------------------------------
// Definitions sent to the model
// ---------------------------------------------------------------------------

export const TOOL_DEFINITIONS = [
  {
    name: "search_patients",
    description:
      "Find patients by name. Use when the doctor names a patient who is not " +
      "the one currently open on screen. Returns up to " +
      `${SEARCH_RESULT_LIMIT} active patients.`,
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Full or partial patient name" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_patient_record",
    description:
      "Get a patient's record: notes, history, recent follow-up tasks and " +
      "recent call results. Call this before writing questions so they are " +
      "grounded in the patient's actual situation.",
    input_schema: {
      type: "object" as const,
      properties: {
        patient_id: { type: "string", description: "Patient UUID" },
      },
      required: ["patient_id"],
    },
  },
  {
    name: "create_call_task",
    description:
      "Create the follow-up call task. This is the final step — call it once, " +
      "when you know the patient and have written the questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        patient_id: { type: "string", description: "Patient UUID" },
        purpose: {
          type: "string",
          description:
            "One short line naming the point of the call, shown as the task " +
            "title on the doctor's dashboard. e.g. 'Check new BP medication " +
            "is being tolerated'. Not a full sentence to the patient.",
        },
        questions: {
          type: "array",
          items: { type: "string" },
          description:
            `${1}-${MAX_QUESTIONS} plain-language questions the voice AI will ` +
            "ask aloud, one topic each",
        },
        due_at: {
          type: "string",
          description: "ISO8601 datetime with offset, when the call should happen",
        },
        urgency: { type: "string", enum: ["low", "normal", "high"] },
        instruction_raw: {
          type: "string",
          description: "The doctor's original instruction, verbatim",
        },
      },
      required: [
        "patient_id",
        "purpose",
        "questions",
        "due_at",
        "urgency",
        "instruction_raw",
      ],
    },
  },
];

/** The tool whose successful execution ends the loop. */
export const TERMINAL_TOOL = "create_call_task";

// ---------------------------------------------------------------------------
// Implementations
// ---------------------------------------------------------------------------

export interface ToolResult {
  content: string;
  /** Set by the terminal tool so the caller can return the created task. */
  createdTask?: Record<string, unknown>;
}

export async function executeTool(
  db: SupabaseClient,
  name: string,
  rawArgs: unknown,
): Promise<ToolResult> {
  switch (name) {
    case "search_patients":
      return await searchPatients(db, rawArgs);
    case "get_patient_record":
      return await getPatientRecord(db, rawArgs);
    case TERMINAL_TOOL:
      return await createCallTask(db, rawArgs);
    default:
      return { content: `Error: unknown tool "${name}".` };
  }
}

async function searchPatients(
  db: SupabaseClient,
  rawArgs: unknown,
): Promise<ToolResult> {
  const parsed = searchPatientsArgs.safeParse(rawArgs);
  if (!parsed.success) {
    return { content: `Error: invalid arguments. ${parsed.error.message}` };
  }

  const { data, error } = await db
    .from("patients")
    .select("id, name, dob, last_seen_at")
    .eq("status", "active")
    .ilike("name", `%${escapeLike(parsed.data.query)}%`)
    .limit(SEARCH_RESULT_LIMIT);

  if (error) return { content: `Error: ${error.message}` };
  if (!data.length) {
    return { content: `No active patients match "${parsed.data.query}".` };
  }
  return { content: JSON.stringify(data) };
}

async function getPatientRecord(
  db: SupabaseClient,
  rawArgs: unknown,
): Promise<ToolResult> {
  const parsed = getPatientRecordArgs.safeParse(rawArgs);
  if (!parsed.success) {
    return { content: `Error: invalid arguments. ${parsed.error.message}` };
  }
  const patientId = parsed.data.patient_id;

  const { data: patient, error } = await db
    .from("patients")
    // Vaccination history never informs a follow-up question, so it stays out
    // of the prompt. Condition and medications are what questions hang off.
    .select("id, name, dob, condition, medications, notes, last_seen_at")
    .eq("id", patientId)
    .maybeSingle();

  if (error) return { content: `Error: ${error.message}` };
  if (!patient) return { content: `Error: no patient with id ${patientId}.` };

  // Recent history gives the model something to ground questions in.
  const [{ data: recentTasks }, { data: recentCalls }] = await Promise.all([
    db
      .from("tasks")
      .select("instruction_raw, questions, status, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(RECENT_HISTORY_LIMIT),
    db
      .from("calls")
      .select("summary, extracted_answers, mood, ended_at, tasks!inner(patient_id)")
      .eq("tasks.patient_id", patientId)
      .eq("status", "completed")
      .order("ended_at", { ascending: false })
      .limit(RECENT_HISTORY_LIMIT),
  ]);

  return {
    content: JSON.stringify({
      ...patient,
      recent_tasks: recentTasks ?? [],
      recent_calls: recentCalls ?? [],
    }),
  };
}

async function createCallTask(
  db: SupabaseClient,
  rawArgs: unknown,
): Promise<ToolResult> {
  const parsed = createCallTaskArgs.safeParse(rawArgs);
  if (!parsed.success) {
    return { content: `Error: invalid arguments. ${parsed.error.message}` };
  }
  const args = parsed.data;

  // Guard against a hallucinated patient id reaching the tasks table.
  const { data: patient } = await db
    .from("patients")
    .select("id")
    .eq("id", args.patient_id)
    .maybeSingle();
  if (!patient) {
    return {
      content:
        `Error: no patient with id ${args.patient_id}. ` +
        "Use search_patients to find the correct id.",
    };
  }

  const { data, error } = await db
    .from("tasks")
    .insert({
      patient_id: args.patient_id,
      purpose: args.purpose,
      instruction_raw: args.instruction_raw,
      questions: args.questions,
      due_at: args.due_at,
      urgency: args.urgency,
      status: "queued",
      assignee_id: DEFAULT_ASSIGNEE,
    })
    .select()
    .single();

  if (error) return { content: `Error: ${error.message}` };

  return {
    content: `Task created (id ${data.id}).`,
    createdTask: data,
  };
}

/** Escape LIKE wildcards so a name containing % or _ can't widen the search. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
