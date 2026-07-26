import { createFileRoute, Link } from "@tanstack/react-router";
import { Undo2, X } from "lucide-react";
import { useState } from "react";
import { MedleyProvider } from "@/lib/medley-store";
import { useMedleyStore } from "@/lib/medley-context";
import { Shell } from "@/components/medley/Shell";
import { StatusDot, StatusKey, statusLabel, statusText } from "@/components/medley/status";
import { ListSkeleton } from "@/components/medley/loading";
import { taskAction } from "@/lib/medley-api";
import { byUrgency, isOverdue, overdueCount } from "@/lib/overdue";
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
/*
 * Four, not six. Six equal-weight chips above an empty list is a decision the
 * doctor has to make before they can read anything. "On call" is already
 * pinned to the top of every screen by the live strip, and "Declined" is a
 * state you arrive at from a row rather than one you go hunting for — both
 * are still reachable, just not competing for the first glance.
 */
const FILTERS: Filter[] = ["all", "queued", "completed", "failed"];

function CallsPage() {
  const { tasks, patientById, loading, reload } = useMedleyStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // "All" means the work, not the archive. A call the doctor declined has been
  // dealt with, so it stops competing with the ones that haven't — but it is
  // one chip away, never gone.
  // Overdue first, oldest of those at the top. Without this the list was
  // ordered by whatever the agent happened to schedule most recently, which
  // is exactly the "loudest patient wins" failure the product exists to fix.
  const shown = byUrgency(
    filter === "all"
      ? tasks.filter((t) => t.status !== "cancelled")
      : tasks.filter((t) => t.status === filter),
  );
  const late = overdueCount(tasks);

  const decline = async (taskId: string, cancelled: boolean) => {
    setPending(taskId);
    setError(null);
    const result = await taskAction(taskId, cancelled ? "cancel" : "restore");
    if (!result.ok) setError(result.reason ?? "That didn't save.");
    setPending(null);
    setConfirming(null);
    await reload();
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl tracking-tight">Calls</h1>
          {/* The first thing worth knowing, in words, before any colour. */}
          <p className="mt-1 text-micro text-muted-foreground" role="status">
            {loading
              ? "Loading…"
              : late > 0
                ? `${late} overdue`
                : tasks.length === 0
                  ? "Nothing scheduled"
                  : "Nothing overdue"}
          </p>
        </div>
        <div role="group" aria-label="Filter calls by status" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
              className={`rounded-lg px-3 py-2 text-body font-medium transition-colors max-sm:min-h-11 ${
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
          <p className="mx-auto mt-1.5 max-w-sm text-body leading-relaxed text-muted-foreground">
            {filter === "all"
              ? "Tell Medley who to ring and why. It reads the record, writes the questions, and phones them."
              : "Try another filter, or ask Medley to set up a new follow-up."}
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-xl bg-primary px-4 py-2.5 text-body font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Ask Medley
          </Link>
        </div>
      )}

      <StatusKey className="mb-5" />

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-flag-surface px-4 py-3 text-body text-flag">
          {error}
        </p>
      )}

      <ul className="divide-y divide-border">
        {shown.map((t) => {
          const p = patientById(t.patientId);
          const name = p?.name ?? "Unknown patient";
          return (
            /* The link and the decline button are siblings, not nested: a
               button inside an anchor is neither valid nor operable by
               keyboard. The whole row still reads as one thing. */
            <li key={t.id} className="group flex items-center gap-2 pr-1">
              <Link
                to="/calls/$taskId"
                params={{ taskId: t.id }}
                className="flex min-w-0 flex-1 items-center gap-4 py-4 transition-colors group-hover:bg-secondary/40"
              >
                <StatusDot status={t.status} scheduledAt={t.scheduledAt} described={false} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span
                      className={`font-medium text-reading ${
                        t.status === "cancelled" ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {name}
                    </span>
                    {/* The dot alone carried status in colour only, which is
                        invisible to a third of readers and to every mobile
                        layout that hides the right-hand column. */}
                    {/* The dot carried status in colour alone, which is
                        invisible to a third of readers and to every mobile
                        layout that hides the right-hand column. Overdue says
                        how late, because "Overdue" without a number is just
                        an adjective. */}
                    <span
                      className={`text-micro ${
                        isOverdue(t) ? "font-medium text-overdue" : "text-muted-foreground"
                      }`}
                    >
                      {statusText(t)}
                      {isOverdue(t) && ` · ${formatRelative(t.scheduledAt)}`}
                    </span>
                  </div>
                  <div className="truncate text-micro text-muted-foreground">{t.purpose}</div>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <div
                    className={`text-body tabular-nums ${
                      t.status === "cancelled" ? "text-muted-foreground line-through" : ""
                    }`}
                  >
                    {formatTime(t.scheduledAt)}
                  </div>
                  <div className="text-micro text-muted-foreground">
                    {formatRelative(t.scheduledAt)}
                  </div>
                </div>
              </Link>

              {confirming === t.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => void decline(t.id, true)}
                    disabled={pending === t.id}
                    className="rounded-lg bg-secondary px-2.5 py-2 text-micro font-medium text-foreground hover:bg-secondary/70 disabled:opacity-60"
                  >
                    Don't call {name.split(" ")[0]}
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    className="rounded-lg px-2.5 py-2 text-micro font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    Keep
                  </button>
                </span>
              ) : t.status === "queued" ? (
                <button
                  onClick={() => setConfirming(t.id)}
                  aria-label={`Decline the call to ${name}`}
                  // Quiet until wanted, but never hidden: opacity-0 would make
                  // it unreachable on a touchscreen, which has no hover.
                  className="shrink-0 rounded-lg p-2 text-muted-foreground opacity-60 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : t.status === "cancelled" ? (
                <button
                  onClick={() => void decline(t.id, false)}
                  disabled={pending === t.id}
                  aria-label={`Put the call to ${name} back in the queue`}
                  className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
                >
                  <Undo2 className="h-4 w-4" aria-hidden />
                </button>
              ) : (
                // Keeps every row the same width whether or not it has an action.
                <span className="w-9 shrink-0" aria-hidden />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
