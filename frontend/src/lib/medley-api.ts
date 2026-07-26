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
  Appointment,
  AppointmentKind,
  InboxItem,
  InboxKind,
  InboxStatus,
  InboxUrgency,
  CallStatus,
  CallTag,
  CallTask,
  Mood,
  Patient,
} from "./types";

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
    error: call?.error ?? undefined,
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

const APPOINTMENT_KINDS: AppointmentKind[] = [
  "appointment",
  "review",
  "test",
  "vaccination",
  "home-visit",
];

/** The doctor's own diary — the appointments they keep in person. */
export async function fetchAppointments(): Promise<Appointment[]> {
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, patient_id, task_id, start_at, end_at, reason, kind, source, status, invitee_name",
    )
    // Deleting an event in Google must remove it from the diary here, not
    // leave a ghost of it. The row is kept for audit; the calendar is a
    // mirror, and a mirror doesn't accumulate what it used to show.
    .neq("status", "cancelled")
    .order("start_at", { ascending: true });
  if (error) throw error;

  return data.map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    startAt: row.start_at,
    endAt: row.end_at,
    reason: row.reason,
    // The column is a plain text check constraint, so a value added in SQL
    // without a matching UI change lands here rather than as a broken badge.
    kind: APPOINTMENT_KINDS.includes(row.kind as AppointmentKind)
      ? (row.kind as AppointmentKind)
      : "appointment",
    fromTaskId: row.task_id,
    source: row.source === "google" ? "google" : "clinic",
    status: row.status === "cancelled" ? "cancelled" : "confirmed",
    inviteeName: row.invitee_name,
  }));
}

const INBOX_KINDS: InboxKind[] = [
  "prescription",
  "appointment-request",
  "symptom-concern",
  "medication-issue",
  "safeguarding",
  "low-mood",
  "callback-request",
  "other",
];

/** Everything still waiting on the doctor, most recent first. */
export async function fetchInbox(): Promise<InboxItem[]> {
  const { data, error } = await supabase
    .from("inbox_items")
    .select("id, patient_id, call_id, task_id, kind, title, detail, urgency, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;

  return data.map((row) => ({
    id: row.id,
    patientId: row.patient_id,
    callId: row.call_id,
    taskId: row.task_id,
    // The column is a text check constraint, so an unknown value lands as
    // "other" rather than as a broken badge.
    kind: INBOX_KINDS.includes(row.kind as InboxKind) ? (row.kind as InboxKind) : "other",
    title: row.title,
    detail: row.detail,
    urgency: (row.urgency ?? "routine") as InboxUrgency,
    status: (row.status ?? "open") as InboxStatus,
    createdAt: row.created_at,
  }));
}

/**
 * Removes an appointment from the diary and from Google at the same time.
 * Server-side: the Google credentials live there, and the anon key can only
 * read. Fails without changing anything if Google refuses.
 */
export async function deleteAppointment(
  bookingId: string,
): Promise<{ ok: boolean; reason?: string }> {
  const response = await postFunction("booking-action", {
    booking_id: bookingId,
    action: "delete",
  });
  const body = response.body as { ok?: boolean; message?: string } | null;
  if (body?.ok) return { ok: true };
  return { ok: false, reason: body?.message ?? `That didn't save (${response.status}).` };
}

/** Clearing an item. Server-side, like every other write — see `taskAction`. */
export async function inboxAction(
  itemId: string,
  action: "done" | "dismiss" | "reopen",
): Promise<{ ok: boolean; reason?: string }> {
  const response = await postFunction("inbox-action", { item_id: itemId, action });
  const body = response.body as { ok?: boolean; message?: string } | null;
  if (body?.ok) return { ok: true };
  return { ok: false, reason: body?.message ?? `That didn't save (${response.status}).` };
}

// --- writes ---------------------------------------------------------------

/**
 * Our edge functions mirror the outcome in the HTTP status but always describe
 * it in the body: a rejected instruction comes back as 400 plus a sentence the
 * doctor can read. So "not ok" is not the same as "no answer", and each caller
 * below decides whether the body it got is usable.
 *
 * What we must still catch is the case that used to slip through silently — a
 * 404 or a gateway error whose body is JSON but not *our* JSON, which left
 * `reply` undefined and rendered an empty message.
 */
interface FunctionResponse {
  status: number;
  body: unknown;
}

async function postFunction(name: string, payload: unknown): Promise<FunctionResponse> {
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    // A gateway timeout or proxy error returns HTML, not JSON.
  }

  return { status: response.status, body };
}

/** Nothing recognisable came back, so surface whatever the platform said. */
function unusable(name: string, response: FunctionResponse): never {
  const detail = response.body as { message?: string; error?: string } | null;
  throw new Error(detail?.message ?? detail?.error ?? `${name} failed (${response.status})`);
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
 * The list views the agent knows how to reason about. Mirrors the enum the
 * function validates against — anything else is rejected before Claude sees the
 * question, so this must not drift. Screens outside the set (the home surface)
 * send nothing and let the agent work without a location.
 */
export type AgentView = "calls" | "patients" | "calendar";

/** What the caller is told as the reply is produced. */
export interface AgentStreamHandlers {
  /** More of the reply. `text` is the whole reply so far, not the delta. */
  onText?: (text: string) => void;
  /** What was streamed turned out to be a preamble to a tool call. Drop it. */
  onDiscard?: () => void;
  /** Fires as each action arrives, which is before the reply finishes. */
  onAction?: (action: UiAction) => void;
}

/**
 * One turn of conversation with Medley. The whole exchange goes up each time —
 * the function is stateless, the conversation lives in the client.
 *
 * The reply streams. Waiting for the complete answer before showing or
 * speaking a word cost about four seconds of silence on a turn that had to
 * look something up; now the first sentence is on screen, and out loud, while
 * the rest is still being written.
 */
export async function talkToAgent(
  messages: ChatMessage[],
  context: { currentPatientId?: string | null; currentView?: AgentView | null },
  handlers: AgentStreamHandlers = {},
): Promise<AgentReply> {
  const response = await fetch(`${FUNCTIONS_URL}/agent`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      current_patient_id: context.currentPatientId ?? null,
      current_view: context.currentView ?? null,
    }),
  });

  if (!response.ok || !response.body) {
    // A rejected turn answers in JSON, not SSE, and still carries prose.
    const body = (await response.json().catch(() => null)) as Partial<AgentReply> | null;
    if (body && typeof body.reply === "string") {
      return { reply: body.reply, actions: body.actions ?? [], detail: body.detail };
    }
    throw new Error(`agent failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const actions: UiAction[] = [];
  let buffer = "";
  let text = "";
  let reply: string | null = null;
  let failure: string | null = null;

  // SSE frames are separated by a blank line and can be split across reads, so
  // only whole frames are consumed and the remainder is carried forward.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const { events, rest } = parseFrames(buffer);
    buffer = rest;

    for (const event of events) {
      switch (event.type) {
        case "text":
          text += event.text;
          handlers.onText?.(text);
          break;
        case "discard":
          text = "";
          handlers.onDiscard?.();
          break;
        case "action":
          actions.push(event.action);
          handlers.onAction?.(event.action);
          break;
        case "done":
          reply = event.reply;
          break;
        case "error":
          failure = event.message;
          break;
      }
    }
  }

  if (failure) throw new Error(failure);
  // `done` carries the authoritative text; falling back to what streamed keeps
  // a truncated connection from throwing away an answer we already have.
  const final = reply ?? text.trim();
  if (!final) throw new Error("The agent closed without answering.");
  return { reply: final, actions };
}

export type AgentEvent =
  | { type: "text"; text: string }
  | { type: "discard" }
  | { type: "action"; action: UiAction }
  | { type: "done"; reply: string }
  | { type: "error"; message: string };

/**
 * Pulls whole SSE frames out of the buffer, returning the incomplete tail.
 *
 * A network read has nothing to do with a frame boundary: one read can carry
 * two events, or half of one. Parsing whatever arrived would drop the split
 * frame's text — a word missing from the middle of the reply, silently.
 */
export function parseFrames(buffer: string): { events: AgentEvent[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: AgentEvent[] = [];

  for (const frame of parts) {
    const line = frame.trim();
    if (!line.startsWith("data:")) continue;
    try {
      events.push(JSON.parse(line.slice(5)) as AgentEvent);
    } catch {
      // A malformed frame is not worth losing the rest of the reply over.
    }
  }
  return { events, rest };
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
export async function createTaskFromInstruction(
  instruction: string,
  currentPatientId?: string | null,
): Promise<CopilotResult> {
  const response = await postFunction("copilot", {
    instruction,
    current_patient_id: currentPatientId ?? null,
  });

  const body = response.body as CopilotResult | null;
  if (body && typeof body.status === "string") return body;
  unusable("copilot", response);
}

export type DispatchResult =
  | { status: "dispatched"; task_id: string }
  | { status: "error"; message: string };

/** Starts the call now, regardless of the task's scheduled time. */
export async function runTask(taskId: string): Promise<DispatchResult> {
  const response = await postFunction("tasks-run", { task_id: taskId });

  const body = response.body as DispatchResult | null;
  if (body && typeof body.status === "string") return body;
  unusable("tasks-run", response);
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

/**
 * Declining, restoring or deleting a call.
 *
 * Through an Edge Function rather than straight at the table. The anon key
 * this client holds is public — it ships inside the JavaScript bundle — so it
 * is granted SELECT and nothing else. Writing from here returned "permission
 * denied for table tasks", and the fix is emphatically not to widen the grant:
 * that would let anyone with the page open delete the practice's whole list.
 *
 * The function also owns the conditional update, so declining a call at the
 * moment the scheduler starts dialling it loses cleanly and says so.
 */
export async function taskAction(
  taskId: string,
  action: "cancel" | "restore" | "delete",
): Promise<{ ok: boolean; reason?: string }> {
  const response = await postFunction("task-action", { task_id: taskId, action });
  const body = response.body as { ok?: boolean; message?: string } | null;

  if (body?.ok) return { ok: true };
  return { ok: false, reason: body?.message ?? `That didn't save (${response.status}).` };
}

/**
 * Saves a correction to a patient's clinical record. Every field is optional
 * and only the ones present are changed, so the notes editor and the
 * medications/vaccinations editor can save independently.
 */
export async function patientAction(
  patientId: string,
  fields: { notes?: string; medications?: string[]; vaccinations?: string[] },
): Promise<{ ok: boolean; reason?: string }> {
  const response = await postFunction("patient-action", { patient_id: patientId, ...fields });
  const body = response.body as { ok?: boolean; message?: string } | null;

  if (body?.ok) return { ok: true };
  return { ok: false, reason: body?.message ?? `That didn't save (${response.status}).` };
}
