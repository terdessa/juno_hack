/**
 * Dates and times, always in the practice's clock.
 *
 * Every formatter here pins the timezone. Without it the browser's own zone
 * decides, and a call placed at 23:04 in London read "22:04" on a laptop set
 * to UTC — an hour out, with nothing on screen to suggest anything was wrong.
 *
 * A surgery runs on one clock. The doctor reading this is in it, the patient
 * being rung is in it, and the scheduler that dials at nine dials at nine
 * London time. Whatever a demo machine, a CI box or a colleague abroad has
 * their system set to is not a reason to move an appointment.
 */

const PRACTICE_TIMEZONE = "Europe/London";
const LOCALE = "en-GB";

export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(LOCALE, {
    timeZone: PRACTICE_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(iso: string) {
  const diff = (new Date(iso).getTime() - Date.now()) / 60_000;
  const abs = Math.abs(diff);
  // "now" read the same for a call about to start and one that just ended.
  if (abs < 1) return diff > 0 ? "in <1m" : "just now";
  if (abs < 60) return diff > 0 ? `in ${Math.round(abs)}m` : `${Math.round(abs)}m ago`;
  const h = abs / 60;
  if (h < 24) return diff > 0 ? `in ${Math.round(h)}h` : `${Math.round(h)}h ago`;
  const d = Math.round(h / 24);
  return diff > 0 ? `in ${d}d` : `${d}d ago`;
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(LOCALE, {
    timeZone: PRACTICE_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * "2026-07-26" in the practice's timezone, for grouping things into days.
 *
 * `Date.toDateString()` buckets by the browser's zone, which puts a 00:30
 * appointment in London on the previous day for anyone running UTC — the
 * calendar would draw it in the wrong column and nobody would know why.
 * Sortable and comparable as a plain string.
 */
export function dayKey(iso: string | Date): string {
  const value = typeof iso === "string" ? new Date(iso) : iso;
  // en-CA renders ISO-style YYYY-MM-DD, which is what makes this comparable.
  return value.toLocaleDateString("en-CA", { timeZone: PRACTICE_TIMEZONE });
}

export function formatDuration(sec?: number) {
  // A nought-second call means the patient hung up instantly, which is
  // clinically interesting. Only a missing value is unknown.
  if (sec == null) return "—";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
