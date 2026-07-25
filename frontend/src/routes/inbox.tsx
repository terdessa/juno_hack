import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Undo2, X } from "lucide-react";
import { MedleyProvider } from "@/lib/medley-store";
import { useMedleyStore } from "@/lib/medley-context";
import { Shell } from "@/components/medley/Shell";
import { ListSkeleton } from "@/components/medley/loading";
import { inboxAction } from "@/lib/medley-api";
import { formatRelative } from "@/lib/format";
import type { InboxItem, InboxKind, InboxUrgency } from "@/lib/types";

export const Route = createFileRoute("/inbox")({
  head: () => ({ meta: [{ title: "Inbox · Medley" }] }),
  component: () => (
    <MedleyProvider>
      <Shell>
        <InboxPage />
      </Shell>
    </MedleyProvider>
  ),
});

export const inboxKindLabel: Record<InboxKind, string> = {
  prescription: "Prescription",
  "appointment-request": "Wants an appointment",
  "symptom-concern": "Symptom",
  "medication-issue": "Medication",
  safeguarding: "Safeguarding",
  "low-mood": "Low mood",
  "callback-request": "Wants a call back",
  other: "Needs a look",
};

const URGENCY_LABEL: Record<InboxUrgency, string> = {
  urgent: "Urgent",
  soon: "Soon",
  routine: "Routine",
};

/**
 * The inbox.
 *
 * Everything else in Medley is something the doctor went looking for. This is
 * the one surface that comes to them, so it earns that by being short: a call
 * where the patient was fine and answered the questions puts nothing here at
 * all. An inbox that catches everything is one nobody reads, and then the one
 * line that mattered is the one that gets missed.
 */
function InboxPage() {
  const { inbox, patientById, loading, reload } = useMedleyStore();
  const [showDone, setShowDone] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = inbox.filter((i) => i.status === "open");
  const closed = inbox.filter((i) => i.status !== "open");
  const shown = showDone ? closed : open;

  // Urgent first, then newest. A doctor scanning this from the doorway reads
  // the top of the list and nothing else.
  const order: Record<InboxUrgency, number> = { urgent: 0, soon: 1, routine: 2 };
  const sorted = [...shown].sort(
    (a, b) => order[a.urgency] - order[b.urgency] || b.createdAt.localeCompare(a.createdAt),
  );

  const act = async (item: InboxItem, action: "done" | "dismiss" | "reopen") => {
    setPending(item.id);
    setError(null);
    const result = await inboxAction(item.id, action);
    if (!result.ok) setError(result.reason ?? "That didn't save.");
    setPending(null);
    await reload();
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl tracking-tight">Inbox</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : open.length === 0
                ? "Nothing needs you."
                : `${open.length} thing${open.length === 1 ? "" : "s"} need${open.length === 1 ? "s" : ""} you.`}
          </p>
        </div>
        {closed.length > 0 && (
          <button
            onClick={() => setShowDone(!showDone)}
            aria-pressed={showDone}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors max-sm:min-h-11 ${
              showDone
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            Cleared ({closed.length})
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-flag-surface px-4 py-3 text-sm text-flag">
          {error}
        </p>
      )}

      {loading && <ListSkeleton label="Loading your inbox" />}

      {!loading && sorted.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-body font-medium">
            {showDone ? "Nothing cleared yet" : "Nothing needs you"}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {showDone
              ? "Things you mark done or dismiss are kept here."
              : "When a call turns up something that needs a person — a prescription that's run out, a symptom, a request to be seen — it lands here. Routine calls don't."}
          </p>
        </div>
      )}

      <ul className="space-y-2.5">
        {sorted.map((item) => {
          const patient = patientById(item.patientId);
          const urgent = item.urgency === "urgent";
          return (
            <li
              key={item.id}
              className={`rounded-xl border bg-card p-4 ${
                urgent && item.status === "open" ? "border-flag/40" : "border-border"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                {/* Urgency is a word first. The border tint is a second signal
                    for people who already know what it means, never the only
                    one. */}
                {item.urgency !== "routine" && item.status === "open" && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-micro font-medium ${
                      urgent ? "bg-flag-surface text-flag" : "bg-overdue-surface text-overdue"
                    }`}
                  >
                    {URGENCY_LABEL[item.urgency]}
                  </span>
                )}
                <span className="text-micro text-muted-foreground">
                  {inboxKindLabel[item.kind]}
                </span>
                <span className="text-micro text-muted-foreground">
                  · {formatRelative(item.createdAt)}
                </span>
                {item.status !== "open" && (
                  <span className="text-micro text-muted-foreground">
                    · {item.status === "done" ? "Done" : "Dismissed"}
                  </span>
                )}
              </div>

              <p className="mt-1.5 font-medium text-reading leading-snug">{item.title}</p>

              {item.detail && (
                <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-muted-foreground">
                  “{item.detail}”
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                {patient && (
                  <Link
                    to="/patients/$patientId"
                    params={{ patientId: patient.id }}
                    className="text-sm font-medium underline underline-offset-4"
                  >
                    {patient.name}
                  </Link>
                )}
                {item.taskId && (
                  <Link
                    to="/calls/$taskId"
                    params={{ taskId: item.taskId }}
                    className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
                  >
                    The call
                  </Link>
                )}

                <span className="ml-auto flex items-center gap-1.5">
                  {item.status === "open" ? (
                    <>
                      <button
                        onClick={() => void act(item, "done")}
                        disabled={pending === item.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-2 text-micro font-medium text-foreground transition-colors hover:bg-secondary/70 disabled:opacity-60"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        Done
                      </button>
                      <button
                        onClick={() => void act(item, "dismiss")}
                        disabled={pending === item.id}
                        aria-label={`Dismiss: ${item.title}`}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => void act(item, "reopen")}
                      disabled={pending === item.id}
                      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-micro font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden />
                      Put back
                    </button>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
