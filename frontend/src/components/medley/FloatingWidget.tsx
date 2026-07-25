import { useState } from "react";
import { PhoneCall, Maximize2, X } from "lucide-react";
import { initialTasks, patientById } from "@/lib/mock-data";
import { formatTime } from "@/lib/format";

export function FloatingWidget({ onExpand }: { onExpand: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const active = initialTasks.find((t) => t.status === "calling");
  const next = initialTasks.find((t) => t.status === "queued");
  const patient = active ? patientById(active.patientId) : next ? patientById(next.patientId) : null;

  return (
    <div className="fixed bottom-5 right-5 z-50 w-[320px] overflow-hidden rounded-2xl border border-border bg-card shadow-float">
      <div className="flex items-center justify-between border-b border-border/60 bg-sidebar/60 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          Medley
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onExpand}
            title="Expand"
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setDismissed(true)}
            title="Close"
            className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {active && patient ? (
        <div className="px-4 py-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-primary">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-primary" />
            Live call
          </div>
          <div className="font-medium">{patient.name}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {active.purpose}
          </div>
          <button
            onClick={onExpand}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            <PhoneCall className="h-3.5 w-3.5" /> Open call
          </button>
        </div>
      ) : next && patient ? (
        <div className="px-4 py-4">
          <div className="mb-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            Next up · {formatTime(next.scheduledAt)}
          </div>
          <div className="font-medium">{patient.name}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
            {next.purpose}
          </div>
          <button
            onClick={onExpand}
            className="mt-3 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-secondary"
          >
            Open dashboard
          </button>
        </div>
      ) : (
        <div className="px-4 py-4 text-sm text-muted-foreground">All quiet.</div>
      )}
    </div>
  );
}
