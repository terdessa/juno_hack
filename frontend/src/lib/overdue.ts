/**
 * Overdue is derived, never stored.
 *
 * `PRODUCT.md` names it as a principle — "quiet, overdue and easily-forgotten
 * cases surface on their own" — and `styles.css` reserves one of the four
 * clinical hues for it. Neither was wired to anything: a call due last Tuesday
 * and one due next Tuesday rendered as the same grey dot, the same word, and
 * the same position in the list. The interface rewarded whatever the agent
 * scheduled most recently, which is the opposite of the stated principle.
 *
 * Derived rather than a column because it changes with the clock, not with an
 * edit. A stored flag would need a job to keep it true and would be wrong
 * between runs.
 */

import type { CallTask } from "./types";

/** Enough of a task to judge it. Keeps this usable from a list row or a dot. */
type Dated = Pick<CallTask, "status" | "scheduledAt">;

/**
 * A call that should already have gone out and hasn't.
 *
 * Only `queued` counts. A completed call is not overdue, a declined one was a
 * decision, and one that failed has its own louder state — calling any of
 * those overdue would spend the colour on things already dealt with, and the
 * whole point is that it means "nobody has acted on this".
 */
export function isOverdue(task: Dated, now: Date = new Date()): boolean {
  if (task.status !== "queued") return false;
  const due = new Date(task.scheduledAt);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
}

/**
 * Sorts the work the way a doctor scans it: overdue first, oldest of those at
 * the top, then everything else by when it is due.
 *
 * Returns a new array — the store's list is shared, and sorting in place would
 * reorder it for every other screen reading the same reference.
 */
export function byUrgency<T extends Dated>(tasks: T[], now: Date = new Date()): T[] {
  return [...tasks].sort((a, b) => {
    const aLate = isOverdue(a, now);
    const bLate = isOverdue(b, now);
    if (aLate !== bLate) return aLate ? -1 : 1;
    return a.scheduledAt.localeCompare(b.scheduledAt);
  });
}

/** How many need chasing. Drives the count the doctor reads first. */
export function overdueCount(tasks: Dated[], now: Date = new Date()): number {
  return tasks.filter((t) => isOverdue(t, now)).length;
}
