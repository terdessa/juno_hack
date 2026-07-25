/**
 * Both Calendly payload shapes, because we don't control which one arrives.
 *
 * Run: deno test supabase/functions/calendly-webhook/
 */

import { assertEquals } from "jsr:@std/assert@1";
import { endOrDefault, parseEvent } from "./parse.ts";

/** The current shape: invitee fields at the top of `payload`. */
const CURRENT = {
  event: "invitee.created",
  payload: {
    uri: "https://api.calendly.com/scheduled_events/EVT/invitees/INV",
    name: "Mykyta Yakivets",
    email: "mykyta@example.com",
    questions_and_answers: [{ question: "Anything to add?", answer: "About my chest" }],
    scheduled_event: {
      name: "GP appointment",
      start_time: "2026-07-27T09:30:00.000000Z",
      end_time: "2026-07-27T10:00:00.000000Z",
    },
  },
};

/** The older shape: invitee nested, event under a different key. */
const LEGACY = {
  event: "invitee.created",
  payload: {
    invitee: {
      uri: "https://api.calendly.com/scheduled_events/EVT2/invitees/INV2",
      name: "Stas Tyshkovets",
      email: "stas@example.com",
    },
    event: {
      start_time: "2026-07-28T14:00:00.000000Z",
      end_time: "2026-07-28T14:30:00.000000Z",
    },
    event_type: { name: "Telephone review" },
  },
};

Deno.test("reads the current payload shape", () => {
  const result = parseEvent(CURRENT);
  assertEquals(result.kind, "created");
  if (result.kind !== "created") return;
  assertEquals(result.booking.inviteeName, "Mykyta Yakivets");
  assertEquals(result.booking.inviteeEmail, "mykyta@example.com");
  assertEquals(result.booking.startAt, "2026-07-27T09:30:00.000000Z");
  assertEquals(result.booking.reason, "GP appointment");
});

Deno.test("reads the older nested shape", () => {
  const result = parseEvent(LEGACY);
  assertEquals(result.kind, "created");
  if (result.kind !== "created") return;
  assertEquals(result.booking.inviteeName, "Stas Tyshkovets");
  assertEquals(result.booking.startAt, "2026-07-28T14:00:00.000000Z");
  // No scheduled_event.name here, so it falls through to the event type.
  assertEquals(result.booking.reason, "Telephone review");
});

Deno.test("falls back to what the patient typed when nothing names the event", () => {
  const result = parseEvent({
    event: "invitee.created",
    payload: {
      uri: "u",
      scheduled_event: { start_time: "2026-07-27T09:30:00Z" },
      questions_and_answers: [{ question: "Why?", answer: "Repeat prescription" }],
    },
  });
  assertEquals(result.kind, "created");
  if (result.kind !== "created") return;
  assertEquals(result.booking.reason, "Repeat prescription");
});

Deno.test("a cancellation carries the id it cancels", () => {
  const result = parseEvent({ event: "invitee.canceled", payload: { uri: "u1" } });
  assertEquals(result, { kind: "cancelled", externalId: "u1" });
});

Deno.test("ignores events we don't handle rather than guessing", () => {
  assertEquals(parseEvent({ event: "routing_form_submission.created" }).kind, "ignored");
  assertEquals(parseEvent({}).kind, "ignored");
});

Deno.test("a booking with no start time is not a booking", () => {
  // Better ignored and logged than written to a calendar at the epoch.
  const result = parseEvent({ event: "invitee.created", payload: { uri: "u", name: "A" } });
  assertEquals(result.kind, "ignored");
});

Deno.test("supplies an end time when one is missing", () => {
  assertEquals(
    endOrDefault({
      externalId: "u",
      startAt: "2026-07-27T09:30:00.000Z",
      endAt: null,
      inviteeName: null,
      inviteeEmail: null,
      reason: "x",
    }),
    "2026-07-27T10:00:00.000Z",
  );
});
