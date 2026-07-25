import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { MedleyProvider, useMedleyStore } from "@/lib/medley-store";
import { Shell } from "@/components/medley/Shell";
import { StatusDot, statusLabel } from "@/components/medley/status";
import { formatRelative, formatTime } from "@/lib/format";
import type { CallTask } from "@/lib/mock-data";

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
        <h1 className="font-display text-3xl tracking-tight">Calls</h1>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
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

      {loading && <p className="py-16 text-center text-muted-foreground">Loading…</p>}

      {!loading && shown.length === 0 && (
        <p className="py-16 text-center text-muted-foreground">
          Nothing here.{" "}
          <Link to="/" className="text-foreground underline underline-offset-4">
            Ask Medley to set up a call
          </Link>
          .
        </p>
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
                <StatusDot status={t.status} />
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[17px] leading-snug">{p?.name ?? "—"}</div>
                  <div className="truncate text-sm text-muted-foreground">{t.purpose}</div>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <div className="text-sm tabular-nums">{formatTime(t.scheduledAt)}</div>
                  <div className="text-xs text-muted-foreground">{formatRelative(t.scheduledAt)}</div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
