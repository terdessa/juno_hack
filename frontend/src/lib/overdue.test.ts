/**
 * Overdue is the product's stated reason for existing — "quiet, overdue and
 * easily-forgotten cases surface on their own" — and it is derived from the
 * clock, so it is exactly the kind of logic that breaks silently and looks
 * fine. Run: bun test
 */

import { expect, test } from "bun:test";
import { byUrgency, isOverdue, overdueCount } from "./overdue";

const NOW = new Date("2026-07-26T12:00:00Z");
const task = (id: string, status: string, scheduledAt: string) =>
  ({ id, status, scheduledAt }) as never;

test("a queued call whose time has passed is overdue", () => {
  expect(isOverdue(task("a", "queued", "2026-07-26T11:00:00Z"), NOW)).toBe(true);
});

test("a queued call still in the future is not", () => {
  expect(isOverdue(task("a", "queued", "2026-07-26T13:00:00Z"), NOW)).toBe(false);
});

test("only queued counts — everything else has been dealt with", () => {
  // A completed call isn't late, a declined one was a decision, and a failed
  // one has its own louder state. Calling any of them overdue would spend the
  // colour on things already handled.
  for (const status of ["completed", "cancelled", "failed", "calling"]) {
    expect(isOverdue(task("a", status, "2020-01-01T00:00:00Z"), NOW)).toBe(false);
  }
});

test("an unparseable date is never overdue", () => {
  // Better to under-flag than to paint a row amber because of a bad string.
  expect(isOverdue(task("a", "queued", "not a date"), NOW)).toBe(false);
});

test("overdue sorts first, oldest of those at the top", () => {
  const sorted = byUrgency(
    [
      task("soon", "queued", "2026-07-26T13:00:00Z"),
      task("late", "queued", "2026-07-25T09:00:00Z"),
      task("later", "queued", "2026-07-27T09:00:00Z"),
      task("latest-overdue", "queued", "2026-07-26T11:00:00Z"),
    ],
    NOW,
  );
  expect(sorted.map((t: { id: string }) => t.id)).toEqual([
    "late",
    "latest-overdue",
    "soon",
    "later",
  ]);
});

test("sorting does not mutate the caller's array", () => {
  // The store's task list is shared; sorting in place would silently reorder
  // every other screen reading the same reference.
  const input = [
    task("b", "queued", "2026-07-27T09:00:00Z"),
    task("a", "queued", "2026-07-25T09:00:00Z"),
  ];
  const before = input.map((t: { id: string }) => t.id);
  byUrgency(input, NOW);
  expect(input.map((t: { id: string }) => t.id)).toEqual(before);
});

test("counts only the ones that need chasing", () => {
  expect(
    overdueCount(
      [
        task("a", "queued", "2026-07-25T09:00:00Z"),
        task("b", "queued", "2026-07-26T11:00:00Z"),
        task("c", "queued", "2026-07-27T09:00:00Z"),
        task("d", "completed", "2020-01-01T00:00:00Z"),
      ],
      NOW,
    ),
  ).toBe(2);
});
