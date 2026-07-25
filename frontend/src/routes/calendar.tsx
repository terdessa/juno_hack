import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MedleyProvider } from "@/lib/medley-store";
import { useMedleyStore } from "@/lib/medley-context";
import { Shell } from "@/components/medley/Shell";
import { StatusDot } from "@/components/medley/status";
import { formatTime } from "@/lib/format";

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

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

function CalendarPage() {
  const { tasks, patientById, loading } = useMedleyStore();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));

  const days = useMemo(() => {
    // Resolved inside the memo so "today" can't go stale against a render that
    // happened before midnight.
    const todayKey = new Date().toDateString();
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      return {
        date,
        isToday: date.toDateString() === todayKey,
        items: tasks
          .filter((t) => new Date(t.scheduledAt).toDateString() === date.toDateString())
          .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
      };
    });
  }, [weekStart, tasks]);

  const weekTotal = days.reduce((sum, d) => sum + d.items.length, 0);

  const label = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "long" })} – ${addDays(
    weekStart,
    6,
  ).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;

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

      <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-7">
        {days.map(({ date, isToday, items }) => (
          <div
            key={date.toISOString()}
            className={`min-h-36 p-3 ${isToday ? "bg-secondary" : "bg-card"}`}
          >
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {DAY_NAMES[(date.getDay() + 6) % 7]}
              </span>
              <span
                className={`text-sm tabular-nums ${isToday ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                {date.getDate()}
              </span>
              {isToday && <span className="text-xs text-muted-foreground">Today</span>}
            </div>

            {loading ? (
              <div className="mt-3 space-y-2" aria-hidden>
                <span className="block h-3 w-16 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                <span className="block h-3 w-24 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              </div>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {items.map((t) => (
                  <li key={t.id}>
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
                      <div className="mt-0.5 truncate text-micro font-medium">
                        {patientById(t.patientId)?.name ?? "Unknown patient"}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      {!loading && weekTotal === 0 && (
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
