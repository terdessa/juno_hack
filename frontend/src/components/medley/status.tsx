import type { CallTask, Mood } from "@/lib/mock-data";

export const statusLabel: Record<CallTask["status"], string> = {
  queued: "Queued",
  calling: "On call",
  completed: "Done",
  failed: "No answer",
};

/**
 * The only place status colour is decided. A live call pulses; everything
 * else is a quiet dot, so the one thing happening now is the one thing that
 * moves.
 */
export function StatusDot({ status }: { status: CallTask["status"] }) {
  const tone =
    status === "calling"
      ? "bg-live"
      : status === "failed"
        ? "bg-flag"
        : status === "completed"
          ? "bg-done"
          : "bg-muted-foreground/40";
  return (
    <span
      aria-label={statusLabel[status]}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone} ${
        status === "calling" ? "pulse-dot text-live" : ""
      }`}
    />
  );
}

export const moodLabel: Record<Mood, string> = {
  positive: "Positive",
  neutral: "Neutral",
  low: "Low mood",
  distressed: "Distressed",
};

/** Mood is clinical information, so it gets colour; neutral deliberately doesn't. */
export function MoodBadge({ mood }: { mood: Mood }) {
  const tone =
    mood === "distressed"
      ? "bg-flag-surface text-flag"
      : mood === "low"
        ? "bg-overdue-surface text-overdue"
        : mood === "positive"
          ? "bg-done-surface text-done"
          : "bg-secondary text-muted-foreground";
  return (
    <span className={`rounded-md px-2 py-1 text-xs font-medium ${tone}`}>{moodLabel[mood]}</span>
  );
}
