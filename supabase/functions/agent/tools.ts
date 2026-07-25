/**
 * Tools for the dashboard agent.
 *
 * Two kinds: database tools that run here, and UI tools that can't — opening
 * a patient happens in the browser, so those record an action the client
 * replays after the reply arrives.
 */

import { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { z } from "npm:zod@3";
import { dispatchTask } from "../_shared/dispatch.ts";

export const MAX_QUESTIONS = 5;
export const MAX_QUESTION_LENGTH = 200;
export const MAX_PURPOSE_LENGTH = 120;
export const SEARCH_RESULT_LIMIT = 10;
export const PATIENT_LIST_LIMIT = 50;
export const RECENT_HISTORY_LIMIT = 3;
export const DEFAULT_ASSIGNEE = "medley";

export interface UiAction {
  type: "open_patient" | "show_view" | "select_task";
  id: string;
}

export const searchPatientsArgs = z.object({ query: z.string().min(1).max(100) });
export const getPatientRecordArgs = z.object({ patient_id: z.string().uuid() });
export const openPatientArgs = z.object({ patient_id: z.string().uuid() });
export const showViewArgs = z.object({ view: z.enum(["calls", "patients", "calendar"]) });
export const startCallArgs = z.object({ task_id: z.string().uuid() });

export const createCallTaskArgs = z.object({
  patient_id: z.string().uuid(),
  purpose: z.string().min(1).max(MAX_PURPOSE_LENGTH),
  questions: z.array(z.string().min(1).max(MAX_QUESTION_LENGTH)).min(1).max(MAX_QUESTIONS),
  due_at: z.string().datetime({ offset: true }),
  urgency: z.enum(["low", "normal", "high"]),
  instruction_raw: z.string().min(1).max(2000),
});

export const TOOL_DEFINITIONS = [
  {
    name: "search_patients",
    description: "Find patients by name when the doctor names someone not already on screen.",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string", description: "Full or partial name" } },
      required: ["query"],
    },
  },
  {
    name: "get_patient_record",
    description:
      "Read a patient's record — condition, medications, notes, recent calls. " +
      "Do this before writing call questions so they're grounded in reality.",
    input_schema: {
      type: "object" as const,
      properties: { patient_id: { type: "string" } },
      required: ["patient_id"],
    },
  },
  {
    name: "list_patients",
    description:
      "The practice's whole patient list, most recently seen first. Use when the " +
      "doctor asks who is on their list rather than about one person.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "list_tasks",
    description:
      "The current call tasks with the outcome of any call that has already " +
      "happened. Use for 'what's outstanding?' and for 'what did she say?'.",
    input_schema: { type: "object" as const, properties: {}, required: [] },
  },
  {
    name: "create_call_task",
    description: "Schedule a follow-up call. Call once you know the patient and have written the questions.",
    input_schema: {
      type: "object" as const,
      properties: {
        patient_id: { type: "string" },
        purpose: { type: "string", description: "Short dashboard title, no full stop" },
        questions: {
          type: "array",
          items: { type: "string" },
          description: "Questions the voice agent reads aloud, one topic each",
        },
        due_at: { type: "string", description: "ISO8601 with offset" },
        urgency: { type: "string", enum: ["low", "normal", "high"] },
        instruction_raw: { type: "string", description: "The doctor's words, verbatim" },
      },
      required: ["patient_id", "purpose", "questions", "due_at", "urgency", "instruction_raw"],
    },
  },
  {
    name: "start_call_now",
    description: "Place a queued call immediately rather than waiting for its scheduled time.",
    input_schema: {
      type: "object" as const,
      properties: { task_id: { type: "string" } },
      required: ["task_id"],
    },
  },
  {
    name: "open_patient",
    description: "Open a patient's record on the doctor's screen.",
    input_schema: {
      type: "object" as const,
      properties: { patient_id: { type: "string" } },
      required: ["patient_id"],
    },
  },
  {
    name: "show_view",
    description: "Switch the dashboard between the calls, patients and calendar views.",
    input_schema: {
      type: "object" as const,
      properties: { view: { type: "string", enum: ["calls", "patients", "calendar"] } },
      required: ["view"],
    },
  },
];

export interface ToolResult {
  content: string;
  action?: UiAction;
}

export async function executeTool(
  db: SupabaseClient,
  name: string,
  rawArgs: unknown,
): Promise<ToolResult> {
  switch (name) {
    case "search_patients": {
      const parsed = searchPatientsArgs.safeParse(rawArgs);
      if (!parsed.success) return invalid(parsed.error.message);
      const { data, error } = await db
        .from("patients")
        .select("id, name, dob, condition")
        .eq("status", "active")
        .ilike("name", `%${escapeLike(parsed.data.query)}%`)
        .limit(SEARCH_RESULT_LIMIT);
      if (error) return { content: `Error: ${error.message}` };
      return {
        content: data.length
          ? JSON.stringify(data)
          : `No active patients match "${parsed.data.query}".`,
      };
    }

    case "get_patient_record": {
      const parsed = getPatientRecordArgs.safeParse(rawArgs);
      if (!parsed.success) return invalid(parsed.error.message);
      const id = parsed.data.patient_id;
      const { data: patient, error } = await db
        .from("patients")
        .select("id, name, dob, condition, medications, notes, last_seen_at")
        .eq("id", id)
        .maybeSingle();
      if (error) return { content: `Error: ${error.message}` };
      if (!patient) return { content: `Error: no patient with id ${id}.` };

      const [{ data: recentTasks }, { data: recentCalls }] = await Promise.all([
        db.from("tasks").select("purpose, status, due_at").eq("patient_id", id)
          .order("created_at", { ascending: false }).limit(RECENT_HISTORY_LIMIT),
        db.from("calls").select("summary, mood, ended_at, tasks!inner(patient_id)")
          .eq("tasks.patient_id", id).eq("status", "completed")
          .order("ended_at", { ascending: false }).limit(RECENT_HISTORY_LIMIT),
      ]);
      return {
        content: JSON.stringify({
          ...patient,
          recent_tasks: recentTasks ?? [],
          recent_calls: recentCalls ?? [],
        }),
      };
    }

    case "list_patients": {
      const { data, error } = await db
        .from("patients")
        .select("id, name, dob, condition, phone, last_seen_at")
        .eq("status", "active")
        .order("last_seen_at", { ascending: false })
        .limit(PATIENT_LIST_LIMIT);
      if (error) return { content: `Error: ${error.message}` };
      return {
        content: data.length ? JSON.stringify(data) : "There are no active patients on the list.",
      };
    }

    case "list_tasks": {
      // Joining the call in means "what did Margaret say?" is answerable in one
      // hop rather than a lookup followed by a second lookup.
      const { data, error } = await db
        .from("tasks")
        .select(
          "id, purpose, status, due_at, urgency, patients(name), " +
            "calls(status, summary, mood, extracted_answers, ended_at)",
        )
        .order("due_at", { ascending: true })
        .limit(20);
      if (error) return { content: `Error: ${error.message}` };
      return { content: JSON.stringify(data) };
    }

    case "create_call_task": {
      const parsed = createCallTaskArgs.safeParse(rawArgs);
      if (!parsed.success) return invalid(parsed.error.message);
      const args = parsed.data;

      // Guard against a hallucinated id reaching the tasks table.
      const { data: patient } = await db
        .from("patients").select("id").eq("id", args.patient_id).maybeSingle();
      if (!patient) {
        return { content: `Error: no patient with id ${args.patient_id}. Search first.` };
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
        .select("id")
        .single();
      if (error) return { content: `Error: ${error.message}` };
      return {
        content: `Task created (id ${data.id}).`,
        action: { type: "select_task", id: data.id },
      };
    }

    case "start_call_now": {
      const parsed = startCallArgs.safeParse(rawArgs);
      if (!parsed.success) return invalid(parsed.error.message);
      // Straight to the dispatcher rather than back out through /tasks-run over
      // HTTP. The doctor is waiting on this reply, and that hop bought nothing
      // but latency and a second thing that could time out.
      const result = await dispatchTask(db, parsed.data.task_id);
      return {
        content:
          result.status === "dispatched"
            ? "The phone is ringing now."
            : `Error: ${result.message}`,
      };
    }

    case "open_patient": {
      const parsed = openPatientArgs.safeParse(rawArgs);
      if (!parsed.success) return invalid(parsed.error.message);
      return {
        content: "Opened on screen.",
        action: { type: "open_patient", id: parsed.data.patient_id },
      };
    }

    case "show_view": {
      const parsed = showViewArgs.safeParse(rawArgs);
      if (!parsed.success) return invalid(parsed.error.message);
      return {
        content: `Showing the ${parsed.data.view} view.`,
        action: { type: "show_view", id: parsed.data.view },
      };
    }

    default:
      return { content: `Error: unknown tool "${name}".` };
  }
}

function invalid(message: string): ToolResult {
  return { content: `Error: invalid arguments. ${message}` };
}

/** Escape LIKE wildcards so a name containing % or _ can't widen the search. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}
