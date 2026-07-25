import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Phone, User, X } from "lucide-react";
import { MedleyProvider } from "@/lib/medley-store";
import { useMedleyStore } from "@/lib/medley-context";
import { Shell } from "@/components/medley/Shell";
import { StatusDot } from "@/components/medley/status";
import { WeekGrid, type WeekDay } from "@/components/medley/WeekGrid";
import { deleteAppointment } from "@/lib/medley-api";
import { formatTime } from "@/lib/format";
import type { Appointment, CallTask } from "@/lib/types";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Calendar · Medley" }] }),
  component: () => (
    <MedleyProvider>
      <Shell>
        <CalendarPage />
      </Shell>
    </MedleyProvider>
  ),
});

function startOfWeek(d: Date) {
  const copy = new Date(d);
  const day = (copy.getDay() + 6) % 7; // Monday-first
  copy.setDate(copy.getDate() - day);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** Spreads dated things across the seven days of a week. */
function spread<T>(weekStart: Date, items: T[], dateOf: (item: T) => string): WeekDay<T>[] {
  // Resolved here so "today" can't go stale against a render from before midnight.
  const todayKey = new Date().toDateString();
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const key = date.toDateString();
    return {
      date,
      isToday: key === todayKey,
      items: items
        .filter((item) => new Date(dateOf(item)).toDateString() === key)
        .sort((a, b) => dateOf(a).localeCompare(dateOf(b))),
    };
  });
}

/**
 * Two calendars, one week.
 *
 * They are kept apart deliberately. What Medley is doing on the phone and what
 * the doctor is doing in the room are different commitments — one runs
 * unattended, the other needs them in a chair — and merging them into one grid
 * would mean reading an icon to tell which is which. Stacked, the answer is the
 * row you are looking at.
 */
function CalendarPage() {
  const { tasks, appointments, patientById, loading, reload } = useMedleyStore();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Removing an appointment takes it off the doctor's real Google Calendar
  // too, so it asks first — the same inline confirm the calls list uses.
  const removeAppointment = async (id: string) => {
    setPending(id);
    setError(null);
    const result = await deleteAppointment(id);
    if (!result.ok) setError(result.reason ?? "That didn't delete.");
    setPending(null);
    setConfirming(null);
    await reload();
  };

  const callDays = useMemo(
    () => spread(weekStart, tasks, (t) => t.scheduledAt),
    [weekStart, tasks],
  );
  const clinicDays = useMemo(
    () => spread(weekStart, appointments, (a) => a.startAt),
    [weekStart, appointments],
  );

  const callCount = callDays.reduce((n, d) => n + d.items.length, 0);
  const clinicCount = clinicDays.reduce((n, d) => n + d.items.length, 0);

  const label = `${weekStart.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
  })} – ${addDays(weekStart, 6).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl tracking-tight">Calendar</h1>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">{label}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Previous week"
            className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground max-sm:h-11 max-sm:w-11"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground max-sm:min-h-11"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Next week"
            className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground max-sm:h-11 max-sm:w-11"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-flag-surface px-4 py-3 text-sm text-flag">
          {error}
        </p>
      )}

      <section aria-labelledby="cal-medley">
        <CalendarHeading
          id="cal-medley"
          icon={<Phone className="h-3.5 w-3.5" aria-hidden />}
          title="Medley — calls"
          note="Dials itself, unattended, at the time shown."
          count={callCount}
          loading={loading}
        />
        <WeekGrid
          days={callDays}
          loading={loading}
          emptyLabel="No calls"
          renderItem={(t: CallTask) => (
            <Link
              to="/calls/$taskId"
              params={{ taskId: t.id }}
              className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-accent max-sm:py-2.5"
            >
              <div className="flex items-center gap-1.5">
                <StatusDot status={t.status} />
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatTime(t.scheduledAt)}
                </span>
              </div>
              {/* Struck through rather than removed: the doctor decided this
                  one wasn't needed, and seeing that decision in the week is
                  more use than a gap where it used to be. */}
              <div
                className={`mt-0.5 truncate text-micro font-medium ${
                  t.status === "cancelled" ? "text-muted-foreground line-through" : ""
                }`}
              >
                {patientById(t.patientId)?.name ?? "Unknown patient"}
              </div>
            </Link>
          )}
        />
      </section>

      <section aria-labelledby="cal-clinic" className="mt-8">
        <CalendarHeading
          id="cal-clinic"
          icon={<User className="h-3.5 w-3.5" aria-hidden />}
          title="Your clinic"
          note="In step with your Google Calendar."
          count={clinicCount}
          loading={loading}
        />
        <WeekGrid
          days={clinicDays}
          loading={loading}
          emptyLabel="Clear"
          renderItem={(a: Appointment) => {
            // A Google attendee we couldn't match to a patient still belongs
            // in the diary — under their own name, and without a link into a
            // record that isn't theirs.
            const patient = a.patientId ? patientById(a.patientId) : undefined;
            const who = patient?.name ?? a.inviteeName ?? "Unknown patient";
            // An appointment we pushed to Google comes back on the next pull,
            // and Google's summary — "Vlad Shuliar — Blood pressure review" —
            // overwrites our reason. The name is already the line above, so
            // showing it twice is just noise from the round trip.
            const reason = stripName(a.reason, who);

            if (confirming === a.id) {
              return (
                <div className="rounded-lg bg-secondary px-2 py-1.5">
                  <p className="text-xs leading-snug">Remove from both calendars?</p>
                  <div className="mt-1.5 flex gap-1">
                    <button
                      onClick={() => void removeAppointment(a.id)}
                      disabled={pending === a.id}
                      className="rounded-md bg-card px-2 py-1 text-xs font-medium shadow-soft disabled:opacity-60"
                    >
                      {pending === a.id ? "Removing…" : "Remove"}
                    </button>
                    <button
                      onClick={() => setConfirming(null)}
                      className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Keep
                    </button>
                  </div>
                </div>
              );
            }

            const body = (
              <>
                <div className="flex items-center gap-1.5">
                  {/* No status dot: an appointment in the diary has no state to
                      report. Colour on this page means a call's condition. */}
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {formatTime(a.startAt)}
                  </span>
                  {a.kind === "home-visit" && (
                    <span className="text-xs text-muted-foreground">· visit</span>
                  )}
                  {a.source === "google" && (
                    <span className="text-xs text-muted-foreground" title="From your Google Calendar">
                      · Google
                    </span>
                  )}
                </div>
                <div className="mt-0.5 truncate text-micro font-medium">{who}</div>
                {reason && (
                  <div className="truncate text-xs text-muted-foreground">{reason}</div>
                )}
              </>
            );

            return (
              <div className="group/appt relative">
                {patient ? (
                  <Link
                    to="/patients/$patientId"
                    params={{ patientId: patient.id }}
                    className="block rounded-lg px-2 py-1.5 pr-7 transition-colors hover:bg-accent max-sm:py-2.5"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="rounded-lg px-2 py-1.5 pr-7">{body}</div>
                )}
                <button
                  onClick={() => setConfirming(a.id)}
                  aria-label={`Remove ${who}'s appointment from both calendars`}
                  // Quiet until wanted, never hidden: opacity-0 would put it
                  // out of reach on a touchscreen, which has no hover.
                  className="absolute right-0.5 top-0.5 rounded-md p-1 text-muted-foreground opacity-50 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 group-hover/appt:opacity-100"
                >
                  <X className="h-3 w-3" aria-hidden />
                </button>
              </div>
            );
          }}
        />
      </section>

      {!loading && callCount === 0 && clinicCount === 0 && (
        <div className="py-10 text-center">
          <p className="text-body font-medium">Nothing scheduled this week</p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Follow-ups appear here as soon as you ask Medley to arrange one.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Ask Medley
          </Link>
        </div>
      )}
    </div>
  );
}

/** Drops a leading "Name — " that a Google round trip added back. */
function stripName(reason: string | null, who: string): string | null {
  if (!reason) return null;
  for (const dash of [" — ", " - "]) {
    const prefix = `${who}${dash}`;
    if (reason.startsWith(prefix)) return reason.slice(prefix.length) || null;
  }
  return reason;
}

function CalendarHeading({
  id,
  icon,
  title,
  note,
  count,
  loading,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  note: string;
  count: number;
  loading: boolean;
}) {
  return (
    <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
      <h2 id={id} className="flex items-center gap-1.5 text-sm font-medium">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </h2>
      <span className="text-xs tabular-nums text-muted-foreground">
        {loading ? "…" : count === 1 ? "1 this week" : `${count} this week`}
      </span>
      <span className="text-xs text-muted-foreground/70">{note}</span>
    </div>
  );
}
