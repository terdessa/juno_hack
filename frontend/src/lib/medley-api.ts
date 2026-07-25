/**
 * Adapter between Supabase rows and the shapes the dashboard already renders.
 *
 * The UI's types are the contract here — the components were designed with a
 * GP and shouldn't bend to match the database. Everything reshapes in this
 * file so the view layer stays untouched.
 */

import { supabase, FUNCTIONS_URL, ANON_KEY } from "./supabase";
import type { CallRow, Json, PatientRow, TaskRow } from "./db.types";
import type {
  CallStatus,
  CallTag,
  CallTask,
  Mood,
  Patient,
} from "./mock-data";

// --- row -> UI ------------------------------------------------------------

function asStringArray(value: Json): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** The UI shows an age; the database stores a date of birth, which doesn't rot. */
function ageFrom(dob: string | null): number {
  if (!dob) return 0;
  const born = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDelta = now.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < born.getDate())) age--;
  return age;
}

export function toPatient(row: PatientRow): Patient {
  const kin = row.next_of_kin as { name?: string; relation?: string; phone?: string } | null;
  return {
    id: row.id,
    name: row.name,
    age: ageFrom(row.dob),
    nhsNumber: row.nhs_number ?? "—",
    phone: row.phone ?? "",
    altPhone: row.alt_phone ?? undefined,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    preferredContact: row.preferred_contact ?? undefined,
    nextOfKin:
      kin?.name && kin.relation && kin.phone
        ? { name: kin.name, relation: kin.relation, phone: kin.phone }
        : undefined,
    condition: row.condition ?? "—",
    lastVisit: row.last_seen_at ?? row.created_at,
    vaccinations: asStringArray(row.vaccinations),
    medications: asStringArray(row.medications),
    notes: row.notes ?? "",
  };
}

type TaskWithCall = TaskRow & { calls: CallRow[] | null };

export function toCallTask(row: TaskWithCall): CallTask {
  // A task has at most one call in practice; take the most recent if the
  // agent retried.
  const call = (row.calls ?? [])
    .slice()
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0];

  const transcript = Array.isArray(call?.transcript)
    ? (call!.transcript as unknown as { role: "agent" | "patient"; text: string }[])
    : undefined;

  return {
    id: row.id,
    patientId: row.patient_id,
    // Fall back to the doctor's own words if the copilot didn't write a title.
    purpose: row.purpose ?? row.instruction_raw,
    questions: Array.isArray(row.questions) ? asStringArray(row.questions) : [],
    scheduledAt: row.due_at ?? row.created_at,
    status: row.status as CallStatus,
    assigneeId: row.assignee_id ?? "medley",
    durationSec:
      call?.started_at && call.ended_at
        ? Math.round(
            (new Date(call.ended_at).getTime() - new Date(call.started_at).getTime()) / 1000,
          )
        : undefined,
    transcript,
    summary: call?.summary ?? undefined,
    mood: (call?.mood as Mood | null) ?? undefined,
    followUp: call?.follow_up_type
      ? { type: call.follow_up_type as "in-person" | "phone" | "none" }
      : undefined,
    tags: call?.tags ? (asStringArray(call.tags) as CallTag[]) : undefined,
  };
}

// --- reads ----------------------------------------------------------------

export async function fetchPatients(): Promise<Patient[]> {
  const { data, error } = await supabase
    .from("patients")
    .select("*")
    .eq("status", "active")
    .order("last_seen_at", { ascending: false });
  if (error) throw error;
  return data.map(toPatient);
}

export async function fetchTasks(): Promise<CallTask[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*, calls(*)")
    .order("due_at", { ascending: true });
  if (error) throw error;
  return (data as TaskWithCall[]).map(toCallTask);
}

// --- writes ---------------------------------------------------------------

async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return (await response.json()) as T;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface UiAction {
  type: "open_patient" | "show_view" | "select_task";
  id: string;
}

export interface AgentReply {
  reply: string;
  actions: UiAction[];
  detail?: string;
}

/**
 * One turn of conversation with Medley. The whole exchange goes up each time —
 * the function is stateless, the conversation lives in the client.
 */
export function talkToAgent(
  messages: ChatMessage[],
  context: { currentPatientId?: string | null; currentView?: string },
): Promise<AgentReply> {
  return callFunction<AgentReply>("agent", {
    messages,
    current_patient_id: context.currentPatientId ?? null,
    current_view: context.currentView ?? "calls",
  });
}

export type CopilotResult =
  | { status: "created"; task: TaskRow }
  | { status: "needs_input"; message: string }
  | { status: "error"; message: string; detail?: string };

/**
 * Hands the doctor's loose instruction to the copilot, which identifies the
 * patient, reads their record, and drafts the questions the voice agent will
 * ask. `needs_input` means it wants a clarification rather than guessing.
 */
export function createTaskFromInstruction(
  instruction: string,
  currentPatientId?: string | null,
): Promise<CopilotResult> {
  return callFunction<CopilotResult>("copilot", {
    instruction,
    current_patient_id: currentPatientId ?? null,
  });
}

export type DispatchResult =
  | { status: "dispatched"; task_id: string }
  | { status: "error"; message: string };

/** Starts the call now, regardless of the task's scheduled time. */
export function runTask(taskId: string): Promise<DispatchResult> {
  return callFunction<DispatchResult>("tasks-run", { task_id: taskId });
}

/** Persists an edit made in the dashboard, translating UI names to columns. */
export async function updateTask(
  taskId: string,
  patch: Partial<Pick<CallTask, "purpose" | "patientId" | "assigneeId" | "scheduledAt" | "status">>,
): Promise<void> {
  const { error } = await supabase
    .from("tasks")
    .update({
      ...(patch.purpose !== undefined && { purpose: patch.purpose }),
      ...(patch.patientId !== undefined && { patient_id: patch.patientId }),
      ...(patch.assigneeId !== undefined && { assignee_id: patch.assigneeId }),
      ...(patch.scheduledAt !== undefined && { due_at: patch.scheduledAt }),
      ...(patch.status !== undefined && { status: patch.status }),
    })
    .eq("id", taskId);
  if (error) throw error;
}

export async function deleteTask(taskId: string): Promise<void> {
  // Calls reference tasks, so clear them first rather than relying on a
  // cascade the schema doesn't declare.
  await supabase.from("calls").delete().eq("task_id", taskId);
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}
