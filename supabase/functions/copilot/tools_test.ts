/**
 * Guards on LLM-supplied tool arguments. The model can hallucinate ids,
 * over-long question lists, or malformed dates — these must never reach
 * Postgres. Run: deno test supabase/functions/copilot/
 */

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  createCallTaskArgs,
  escapeLike,
  getPatientRecordArgs,
  MAX_QUESTIONS,
  searchPatientsArgs,
} from "./tools.ts";

const VALID_UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function validTaskArgs(overrides: Record<string, unknown> = {}) {
  return {
    patient_id: VALID_UUID,
    questions: ["Are the new blood pressure tablets giving you any side effects?"],
    due_at: "2026-07-26T09:00:00+01:00",
    urgency: "normal",
    instruction_raw: "call him tomorrow about the new tablets",
    ...overrides,
  };
}

Deno.test("accepts a well-formed task", () => {
  assert(createCallTaskArgs.safeParse(validTaskArgs()).success);
});

Deno.test("rejects a hallucinated non-uuid patient id", () => {
  const result = createCallTaskArgs.safeParse(
    validTaskArgs({ patient_id: "patient-john-smith" }),
  );
  assertEquals(result.success, false);
});

Deno.test("rejects more questions than a phone call can carry", () => {
  const tooMany = Array(MAX_QUESTIONS + 1).fill("How are you feeling?");
  assertEquals(
    createCallTaskArgs.safeParse(validTaskArgs({ questions: tooMany })).success,
    false,
  );
});

Deno.test("rejects an empty question list", () => {
  assertEquals(
    createCallTaskArgs.safeParse(validTaskArgs({ questions: [] })).success,
    false,
  );
});

Deno.test("rejects a date without a timezone offset", () => {
  // "tomorrow 9am" with no offset would silently drift the call time.
  assertEquals(
    createCallTaskArgs.safeParse(validTaskArgs({ due_at: "tomorrow at 9am" })).success,
    false,
  );
  assertEquals(
    createCallTaskArgs.safeParse(validTaskArgs({ due_at: "2026-07-26 09:00" })).success,
    false,
  );
});

Deno.test("rejects an invented urgency level", () => {
  assertEquals(
    createCallTaskArgs.safeParse(validTaskArgs({ urgency: "critical" })).success,
    false,
  );
});

Deno.test("rejects empty or oversized search queries", () => {
  assertEquals(searchPatientsArgs.safeParse({ query: "" }).success, false);
  assertEquals(searchPatientsArgs.safeParse({ query: "a".repeat(101) }).success, false);
  assert(searchPatientsArgs.safeParse({ query: "Smith" }).success);
});

Deno.test("rejects a non-uuid in get_patient_record", () => {
  assertEquals(getPatientRecordArgs.safeParse({ patient_id: "1" }).success, false);
});

Deno.test("escapes LIKE wildcards so a query can't widen the search", () => {
  assertEquals(escapeLike("%"), "\\%");
  assertEquals(escapeLike("Sm_th"), "Sm\\_th");
  assertEquals(escapeLike("O'Brien"), "O'Brien");
});
