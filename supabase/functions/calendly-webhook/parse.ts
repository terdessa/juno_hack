/**
 * Reading a Calendly delivery.
 *
 * Separated from the handler because this is the part most likely to be wrong:
 * Calendly has moved these fields between API versions — `payload.uri` vs
 * `payload.invitee.uri`, `payload.scheduled_event` vs `payload.event` — and a
 * booking that silently fails to parse is precisely the failure this
 * integration exists to prevent. Pure functions, so both shapes can be tested
 * without a signing key or a database.
 *
 * Run: deno test supabase/functions/calendly-webhook/
 */

export interface CalendlyEvent {
  event?: string;
  payload?: Record<string, unknown>;
}

export interface ParsedBooking {
  externalId: string;
  startAt: string;
  endAt: string | null;
  inviteeName: string | null;
  inviteeEmail: string | null;
  reason: string;
}

export type ParseResult =
  | { kind: "created"; booking: ParsedBooking }
  | { kind: "cancelled"; externalId: string }
  | { kind: "ignored"; reason: string };

const DEFAULT_REASON = "Booked by Medley";

export function parseEvent(body: CalendlyEvent): ParseResult {
  const type = body.event ?? "";
  if (type !== "invitee.created" && type !== "invitee.canceled") {
    return { kind: "ignored", reason: `event ${type || "(none)"}` };
  }

  const p = body.payload ?? {};
  // The invitee URI identifies this booking for its whole life, including the
  // cancellation that arrives later as a separate delivery.
  const externalId = str(p.uri) ?? str(dig(p, "invitee", "uri"));
  if (!externalId) return { kind: "ignored", reason: "no invitee uri" };

  if (type === "invitee.canceled") return { kind: "cancelled", externalId };

  const scheduled = obj(p.scheduled_event) ?? obj(p.event) ?? {};
  const startAt = str(scheduled.start_time) ?? str(p.start_time);
  if (!startAt) return { kind: "ignored", reason: "no start time" };

  return {
    kind: "created",
    booking: {
      externalId,
      startAt,
      endAt: str(scheduled.end_time) ?? str(p.end_time),
      inviteeName: str(p.name) ?? str(dig(p, "invitee", "name")),
      inviteeEmail: str(p.email) ?? str(dig(p, "invitee", "email")),
      reason:
        str(scheduled.name) ??
        str(dig(p, "event_type", "name")) ??
        firstAnswer(p.questions_and_answers) ??
        DEFAULT_REASON,
    },
  };
}

/** Calendly always sends an end; this is only a floor so layout never breaks. */
export function endOrDefault(booking: ParsedBooking): string {
  if (booking.endAt) return booking.endAt;
  return new Date(new Date(booking.startAt).getTime() + 30 * 60_000).toISOString();
}

function firstAnswer(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  for (const entry of value) {
    const answer = str(obj(entry)?.answer);
    if (answer) return answer.slice(0, 200);
  }
  return null;
}

function dig(source: Record<string, unknown>, ...path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    current = obj(current)?.[key];
    if (current === undefined) return undefined;
  }
  return current;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
