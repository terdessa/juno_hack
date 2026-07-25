import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, PhoneCall, Undo2, X } from "lucide-react";
import { MedleyProvider } from "@/lib/medley-store";
import { useMedleyStore } from "@/lib/medley-context";
import { Shell } from "@/components/medley/Shell";
import { MoodBadge, StatusDot, statusLabel } from "@/components/medley/status";
import { DetailSkeleton } from "@/components/medley/loading";
import { runTask, setTaskCancelled } from "@/lib/medley-api";
import { formatDate, formatDuration, formatTime } from "@/lib/format";

export const Route = createFileRoute("/calls/$taskId")({
  head: () => ({ meta: [{ title: "Call · Medley" }] }),
  component: () => (
    <MedleyProvider>
      <Shell>
        <CallPage />
      </Shell>
    </MedleyProvider>
  ),
});

type Dispatch =
  | { state: "idle" }
  | { state: "confirming" }
  | { state: "dialling" }
  | { state: "failed"; message: string };

function CallPage() {
  const { taskId } = useParams({ from: "/calls/$taskId" });
  const { tasks, patientById, loading, reload } = useMedleyStore();
  const [dispatch, setDispatch] = useState<Dispatch>({ state: "idle" });
  const [declining, setDeclining] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const task = tasks.find((t) => t.id === taskId);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <DetailSkeleton label="Loading this call" />
      </div>
    );
  }
  if (!task) {
    return (
      <p className="py-24 text-center text-muted-foreground">
        That call no longer exists.{" "}
        <Link to="/calls" className="text-foreground underline underline-offset-4">
          Back to calls
        </Link>
      </p>
    );
  }
  const patient = patientById(task.patientId);
  const questionCount = task.questions?.length ?? 0;

  const placeCall = async () => {
    setDispatch({ state: "dialling" });
    try {
      const result = await runTask(task.id);
      if (result.status === "error") throw new Error(result.message);
      await reload();
      setDispatch({ state: "idle" });
    } catch (err) {
      setDispatch({
        state: "failed",
        message: err instanceof Error ? err.message : "The practice server didn't respond.",
      });
    }
  };

  const setCancelled = async (cancelled: boolean) => {
    setDeclineError(null);
    const result = await setTaskCancelled(task.id, cancelled);
    if (!result.ok) setDeclineError(result.reason ?? "That didn't save.");
    setDeclining(false);
    await reload();
  };

  return (
    <article className="mx-auto max-w-2xl">
      <Link
        to="/calls"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Calls
      </Link>

      <div className="flex items-center gap-2.5">
        <StatusDot status={task.status} />
        <span className="text-sm font-medium text-muted-foreground">
          {statusLabel[task.status]}
        </span>
        {task.mood && <MoodBadge mood={task.mood} />}
      </div>

      <h1 className="mt-3 text-2xl leading-tight tracking-tight">{task.purpose}</h1>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
        {patient && (
          <Link
            to="/patients/$patientId"
            params={{ patientId: patient.id }}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {patient.name}
          </Link>
        )}
        <span className="tabular-nums">
          {formatDate(task.scheduledAt)} · {formatTime(task.scheduledAt)}
        </span>
        {task.durationSec != null && <span>{formatDuration(task.durationSec)}</span>}
      </div>

      {task.status === "queued" && (
        <div className="mt-6">
          {dispatch.state === "confirming" ? (
            /* Inline rather than a modal: the doctor can still read the
               questions underneath while deciding. */
            <div className="max-w-md rounded-xl border border-input bg-card p-4 shadow-soft">
              <p className="text-body font-medium">
                Ring {patient?.name ?? "this patient"}
                {patient?.phone ? ` on ${patient.phone}` : ""} now?
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Their phone rings straight away
                {questionCount > 0
                  ? `, and Medley asks ${questionCount} question${questionCount === 1 ? "" : "s"}.`
                  : "."}
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => void placeCall()}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <PhoneCall className="h-4 w-4" aria-hidden /> Yes, ring now
                </button>
                <button
                  onClick={() => setDispatch({ state: "idle" })}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : declining ? (
            /* Declining is the one action here that stops something from
               happening on its own, so it gets a sentence about what that
               means rather than a bare "Are you sure?". */
            <div className="max-w-md rounded-xl border border-input bg-card p-4 shadow-soft">
              <p className="text-body font-medium">
                Don't call {patient?.name ?? "this patient"}?
              </p>
              <p className="mt-1.5 text-sm text-muted-foreground">
                It comes off the queue and won't ring at{" "}
                {formatTime(task.scheduledAt)}. You can put it back afterwards.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => void setCancelled(true)}
                  className="rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary/70"
                >
                  Decline this call
                </button>
                <button
                  onClick={() => setDeclining(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setDispatch({ state: "confirming" })}
                disabled={dispatch.state === "dialling"}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                <PhoneCall className="h-4 w-4" aria-hidden />
                {dispatch.state === "dialling" ? "Dialling…" : "Call now"}
              </button>
              <button
                onClick={() => setDeclining(true)}
                disabled={dispatch.state === "dialling"}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60"
              >
                <X className="h-4 w-4" aria-hidden />
                Decline
              </button>
            </div>
          )}

          {dispatch.state === "failed" && (
            <div role="alert" className="mt-3 max-w-md rounded-xl bg-flag-surface px-4 py-3">
              <p className="text-sm text-flag">
                The call didn't start, so nobody has been rung. {dispatch.message}
              </p>
              <button
                onClick={() => setDispatch({ state: "confirming" })}
                className="mt-1.5 text-sm font-medium text-foreground underline underline-offset-4"
              >
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {task.status === "cancelled" && (
        <div className="mt-6 max-w-md rounded-xl border border-border bg-secondary p-4">
          <p className="text-body font-medium">You declined this call</p>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Nobody was rung, and it won't ring on its own. The questions are still below.
          </p>
          <button
            onClick={() => void setCancelled(false)}
            className="mt-3 inline-flex items-center gap-2 rounded-xl bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-soft transition-colors hover:bg-background"
          >
            <Undo2 className="h-4 w-4" aria-hidden />
            Put it back in the queue
          </button>
        </div>
      )}

      {declineError && (
        <p role="alert" className="mt-3 max-w-md rounded-xl bg-flag-surface px-4 py-3 text-sm text-flag">
          {declineError}
        </p>
      )}

      {task.summary && (
        <section className="mt-10">
          <h2 className="text-lg tracking-tight">What happened</h2>
          <p className="mt-2 max-w-[68ch] text-body leading-relaxed">{task.summary}</p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="text-lg tracking-tight">
          {task.status === "completed" ? "What was asked" : "What Medley will ask"}
        </h2>
        <ol className="mt-3 space-y-2.5">
          {(task.questions ?? []).map((q, i) => (
            <li key={i} className="flex gap-3 text-body leading-relaxed">
              <span className="w-4 shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="max-w-[64ch]">{q}</span>
            </li>
          ))}
        </ol>
      </section>

      {task.transcript && task.transcript.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg tracking-tight">Transcript</h2>
          <div className="mt-3 space-y-3">
            {task.transcript.map((turn, i) => (
              <div key={i} className="text-body">
                <div className="text-micro font-medium text-muted-foreground">
                  {turn.role === "agent" ? "Medley" : (patient?.name ?? "Patient")}
                </div>
                <p className="mt-0.5 max-w-[64ch]">{turn.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
