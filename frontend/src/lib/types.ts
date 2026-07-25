/**
 * The shapes the dashboard renders.
 *
 * These are the view layer's own vocabulary, not the database's: a task has a
 * `scheduledAt`, not a `due_at`, and a patient has an age rather than a date of
 * birth. `medley-api.ts` translates at the boundary, which is what lets the
 * screens stay readable while the schema does whatever a schema needs to do.
 *
 * This file used to be `mock-data.ts` and carried six invented patients and a
 * staff roster alongside the types. Everything is real now — patients, tasks
 * and transcripts all come from Supabase — so the fixtures are gone and only
 * the vocabulary is left.
 */

export type CallStatus = "queued" | "calling" | "completed" | "failed";
export type Mood = "positive" | "neutral" | "low" | "distressed";
export type CallTag =
  | "depression-detected"
  | "anxiety-detected"
  | "safeguarding-concern"
  | "reschedule-requested"
  | "human-call-requested"
  | "medication-issue"
  | "no-answer";

export interface Patient {
  id: string;
  name: string;
  age: number;
  nhsNumber: string;
  phone: string;
  altPhone?: string;
  email?: string;
  address?: string;
  preferredContact?: string;
  nextOfKin?: { name: string; relation: string; phone: string };
  condition: string;
  lastVisit: string; // ISO
  vaccinations: string[];
  medications: string[];
  notes: string;
}

export interface CallTask {
  id: string;
  patientId: string;
  purpose: string;
  /** What the voice agent asks aloud. Drafted by Medley from the record. */
  questions?: string[];
  scheduledAt: string; // ISO
  status: CallStatus;
  assigneeId: string;
  durationSec?: number;
  transcript?: { role: "agent" | "patient"; text: string }[];
  summary?: string;
  mood?: Mood;
  followUp?: { type: "in-person" | "phone" | "none"; suggestedAt?: string };
  tags?: CallTag[];
  /** Why a call couldn't be placed, or why it ended without an answer. */
  error?: string;
}

/**
 * Something already in the doctor's diary: a real appointment with a real
 * person, in the room or on a home visit. Distinct from a `CallTask`, which is
 * Medley phoning someone on the doctor's behalf — the calendar shows the two
 * side by side and must never blur them.
 */
export type AppointmentKind =
  | "appointment"
  | "review"
  | "test"
  | "vaccination"
  | "home-visit";

export interface Appointment {
  id: string;
  patientId: string;
  startAt: string;
  endAt: string;
  reason: string | null;
  kind: AppointmentKind;
  /** Set when Medley booked this off the back of a call. */
  fromTaskId: string | null;
}
