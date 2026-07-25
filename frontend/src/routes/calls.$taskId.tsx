import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, PhoneCall } from "lucide-react";
import { MedleyProvider, useMedleyStore } from "@/lib/medley-store";
import { Shell } from "@/components/medley/Shell";
import { MoodBadge, StatusDot, statusLabel } from "@/components/medley/status";
import { runTask } from "@/lib/medley-api";
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

function CallPage() {
  const { taskId } = useParams({ from: "/calls/$taskId" });
  const { tasks, patientById, loading, reload } = useMedleyStore();
  const task = tasks.find((t) => t.id === taskId);

  if (loading) return <p className="py-24 text-center text-muted-foreground">Loading…</p>;
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
        <span className="text-sm font-medium text-muted-foreground">{statusLabel[task.status]}</span>
        {task.mood && <MoodBadge mood={task.mood} />}
      </div>

      <h1 className="mt-3 font-display text-3xl leading-tight tracking-tight">{task.purpose}</h1>

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
        <button
          onClick={() => void runTask(task.id).then(reload)}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <PhoneCall className="h-4 w-4" /> Call now
        </button>
      )}

      {task.summary && (
        <section className="mt-10">
          <h2 className="font-display text-lg tracking-tight">What happened</h2>
          <p className="mt-2 max-w-[68ch] text-[15px] leading-relaxed">{task.summary}</p>
        </section>
      )}

      <section className="mt-10">
        <h2 className="font-display text-lg tracking-tight">
          {task.status === "completed" ? "What was asked" : "What Medley will ask"}
        </h2>
        <ol className="mt-3 space-y-2.5">
          {(task.questions ?? []).map((q, i) => (
            <li key={i} className="flex gap-3 text-[15px] leading-relaxed">
              <span className="w-4 shrink-0 tabular-nums text-muted-foreground">{i + 1}</span>
              <span className="max-w-[64ch]">{q}</span>
            </li>
          ))}
        </ol>
      </section>

      {task.transcript && task.transcript.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg tracking-tight">Transcript</h2>
          <div className="mt-3 space-y-3">
            {task.transcript.map((turn, i) => (
              <div key={i} className="text-[15px] leading-relaxed">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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
