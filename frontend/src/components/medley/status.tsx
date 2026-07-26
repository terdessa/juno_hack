import type { CallTask, Mood } from "@/lib/types";
import { isOverdue } from "@/lib/overdue";

/**
 * "Didn't get through" rather than "No answer".
 *
 * `failed` covers three different things: the patient ignored the phone, the
 * number wasn't diallable, and the dispatch never reached the network at all.
 * "No answer" describes only the first and quietly blames the patient for the
 * other two — so a call that never happened reads as a call the patient
 * refused, and nobody retries it. In a product whose promise is that nothing
 * gets forgotten, that is the one label that can break the promise while
 * looking like it worked. The detail page carries the actual reason.
 */
export const statusLabel: Record<CallTask["status"], string> = {
  queued: "Queued",
  calling: "On call",
  completed: "Done",
  failed: "Didn't get through",
  cancelled: "Declined",
};

/**
 * What the doctor should actually read on a row.
 *
 * A queued call whose time has passed is not "Queued" — nobody has acted on it
 * and it is the single thing most likely to be forgotten. It says so.
 */
export function statusText(task: Pick<CallTask, "status" | "scheduledAt">): string {
  return isOverdue(task) ? "Overdue" : statusLabel[task.status];
}

/**
 * The only place status colour is decided. A live call pulses; everything
 * else is a quiet dot, so the one thing happening now is the one thing that
 * moves.
 *
 * Colour is never the only carrier. Where the status word sits next to the dot
 * the dot is decorative (`described={false}`); where there's no room for the
 * word, it announces itself as an image with a label.
 */
export function StatusDot({
  status,
  scheduledAt,
  described = true,
}: {
  status: CallTask["status"];
  /** Pass wherever overdue can apply; omit where the row can't be overdue. */
  scheduledAt?: string;
  described?: boolean;
}) {
  const overdue = scheduledAt ? isOverdue({ status, scheduledAt }) : false;
  const tone = overdue
    ? "bg-overdue"
    : status === "calling"
      ? "bg-live"
      : status === "failed"
        ? "bg-flag"
        : status === "completed"
          ? "bg-done"
          // Declined and queued share the quiet dot. A call the doctor called
          // off is not a fault, so it must not borrow the colour of one.
          : "bg-muted-foreground/40";

  const label = overdue ? "Overdue" : statusLabel[status];

  return (
    <span
      {...(described ? { role: "img" as const, "aria-label": label } : { "aria-hidden": true })}
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone} ${
        status === "calling" ? "pulse-dot text-live" : ""
      }`}
    />
  );
}

/**
 * What the four hues mean, said once.
 *
 * Colour carries state here, and until now nothing on the surface said what
 * any of it meant — a doctor had to learn that amber is overdue and red is
 * live. A key costs one row and removes the recall entirely.
 */
export function StatusKey({ className = "" }: { className?: string }) {
  const entries = [
    { tone: "bg-overdue", label: "Overdue" },
    { tone: "bg-live", label: "On call" },
    { tone: "bg-done", label: "Done" },
    { tone: "bg-flag", label: "Didn't get through" },
  ];
  return (
    <ul className={`flex flex-wrap items-center gap-x-3.5 gap-y-1.5 ${className}`}>
      {entries.map(({ tone, label }) => (
        <li key={label} className="flex items-center gap-1.5">
          <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${tone}`} aria-hidden />
          <span className="text-micro text-muted-foreground">{label}</span>
        </li>
      ))}
    </ul>
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
    <span className={`rounded-md px-2 py-1 text-micro font-medium ${tone}`}>{moodLabel[mood]}</span>
  );
}
