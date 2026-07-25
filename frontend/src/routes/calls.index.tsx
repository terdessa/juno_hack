import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MedleyProvider } from "@/lib/medley-store";
import { useMedleyStore } from "@/lib/medley-context";
import { Shell } from "@/components/medley/Shell";
import { StatusDot, statusLabel } from "@/components/medley/status";
import { ListSkeleton } from "@/components/medley/loading";
import { formatRelative, formatTime } from "@/lib/format";
import type { CallTask } from "@/lib/types";

export const Route = createFileRoute("/calls/")({
  head: () => ({ meta: [{ title: "Calls · Medley" }] }),
  component: () => (
    <MedleyProvider>
      <Shell>
        <CallsPage />
      </Shell>
    </MedleyProvider>
  ),
});

type Filter = "all" | CallTask["status"];
const FILTERS: Filter[] = ["all", "queued", "calling", "completed", "failed"];

function CallsPage() {
  const { tasks, patientById, loading } = useMedleyStore();
  const [filter, setFilter] = useState<Filter>("all");
  const shown = filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-2xl tracking-tight">Calls</h1>
        <div role="group" aria-label="Filter calls by status" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors max-sm:min-h-11 ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : statusLabel[f]}
            </button>
          ))}
        </div>
      </div>

      {loading && <ListSkeleton label="Loading calls" />}

      {!loading && shown.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-body font-medium">
            {filter === "all"
              ? "No follow-ups yet"
              : `Nothing ${statusLabel[filter].toLowerCase()}`}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {filter === "all"
              ? "Tell Medley who to ring and why. It reads the record, writes the questions, and phones them."
              : "Try another filter, or ask Medley to set up a new follow-up."}
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Ask Medley
          </Link>
        </div>
      )}

      <ul className="divide-y divide-border">
        {shown.map((t) => {
          const p = patientById(t.patientId);
          return (
            <li key={t.id}>
              <Link
                to="/calls/$taskId"
                params={{ taskId: t.id }}
                className="flex items-center gap-4 py-4 transition-colors hover:bg-secondary/40"
              >
                <StatusDot status={t.status} described={false} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium text-reading leading-snug">
                      {p?.name ?? "Unknown patient"}
                    </span>
                    {/* The dot alone carried status in colour only, which is
                        invisible to a third of readers and to every mobile
                        layout that hides the right-hand column. */}
                    <span className="text-micro text-muted-foreground">
                      {statusLabel[t.status]}
                    </span>
                  </div>
                  <div className="truncate text-sm text-muted-foreground">{t.purpose}</div>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <div className="text-sm tabular-nums">{formatTime(t.scheduledAt)}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatRelative(t.scheduledAt)}
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
