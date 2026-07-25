import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MedleyProvider, useMedleyStore } from "@/lib/medley-store";
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
  const { tasks, patientById } = useMedleyStore();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const today = new Date();

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        return {
          date,
          isToday: date.toDateString() === today.toDateString(),
          items: tasks
            .filter((t) => new Date(t.scheduledAt).toDateString() === date.toDateString())
            .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
        };
      }),
    [weekStart, tasks],
  );

  const label = `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "long" })} – ${addDays(
    weekStart,
    6,
  ).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight">Calendar</h1>
          <p className="mt-1 text-sm tabular-nums text-muted-foreground">{label}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Previous week"
            className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            Today
          </button>
          <button
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Next week"
            className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-7">
        {days.map(({ date, isToday, items }) => (
          <div key={date.toISOString()} className="min-h-[9rem] bg-card p-3">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {DAY_NAMES[(date.getDay() + 6) % 7]}
              </span>
              <span
                className={`text-sm tabular-nums ${isToday ? "font-semibold text-foreground" : "text-muted-foreground"}`}
              >
                {date.getDate()}
              </span>
            </div>

            <ul className="mt-2 space-y-1.5">
              {items.map((t) => (
                <li key={t.id}>
                  <Link
                    to="/calls/$taskId"
                    params={{ taskId: t.id }}
                    className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-secondary"
                  >
                    <div className="flex items-center gap-1.5">
                      <StatusDot status={t.status} />
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatTime(t.scheduledAt)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate font-display text-[13px]">
                      {patientById(t.patientId)?.name ?? "—"}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
