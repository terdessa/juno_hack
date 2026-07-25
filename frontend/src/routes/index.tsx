import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "@/components/medley/Dashboard";
import { FloatingWidget } from "@/components/medley/FloatingWidget";
import { MedleyProvider } from "@/lib/medley-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Medley — AI call agent for GP practices" },
      {
        name: "description",
        content:
          "Assign a call, Medley phones the patient and brings back a mood-aware summary and follow-up.",
      },
      { property: "og:title", content: "Medley — AI call agent for GP practices" },
      {
        property: "og:description",
        content:
          "An AI voice agent that takes patient follow-up calls off doctors' shoulders.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const [minimized, setMinimized] = useState(false);
  return (
    <MedleyProvider>
      {minimized ? (
        <MinimizedShell onExpand={() => setMinimized(false)} />
      ) : (
        <Dashboard onMinimize={() => setMinimized(true)} />
      )}
    </MedleyProvider>
  );
}

function MinimizedShell({ onExpand }: { onExpand: () => void }) {
  return (
    <div className="relative min-h-screen bg-background">
      {/* faux backdrop — makes it look like the widget overlays the doctor's own screen */}
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,theme(colors.secondary.DEFAULT)_0%,transparent_60%)]" />
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
          Medley is minimised
        </div>
        <h1 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
          Working quietly in the corner.
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-sm text-muted-foreground">
          Medley sits on top of your usual practice software (EMIS, SystmOne…) so
          you never have to leave your main screen. It'll ping you here when a
          call needs your attention.
        </p>
        <button
          onClick={onExpand}
          className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-soft hover:opacity-90"
        >
          Open full dashboard
        </button>
      </div>
      <FloatingWidget onExpand={onExpand} />
    </div>
  );
}
