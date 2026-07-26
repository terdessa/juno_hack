import { Link, useRouterState } from "@tanstack/react-router";
import {
  MessageSquare,
  ListChecks,
  Users,
  CalendarDays,
  Inbox,
  RotateCw,
  Command,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useMedleyStoreOptional } from "@/lib/medley-context";
import { Mark } from "./Mark";
import { VoiceDock } from "./VoiceDock";
import { useDockOpen, toggleDock } from "@/lib/dock";
import { useAgentActions } from "@/lib/useAgentActions";

const NAV = [
  { to: "/", label: "Medley", icon: MessageSquare },
  // Directly under Medley, above the lists: this is the one nav item that has
  // something to say on its own.
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/calls", label: "Calls", icon: ListChecks },
  { to: "/patients", label: "Patients", icon: Users },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
] as const;

/**
 * A persistent rail on its own surface, one shade down and a hair cool from
 * the content behind it. Two planes rather than one flat page is what stops a
 * tool reading as a document — and it gives the eye a fixed place to start,
 * which matters when the reader is between patients.
 *
 * Two things live here rather than on any page, because both must be true
 * everywhere: a call in progress, and a list that failed to load. An empty
 * list that silently means "the database is down" is the one failure this
 * product cannot afford.
 */
export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  // Optional: the nav must render even without the data provider. The live
  // strip and the banner are decoration on top of the data, not a reason to
  // take the whole app down.
  const store = useMedleyStoreOptional();
  const [retrying, setRetrying] = useState(false);
  const dockOpen = useDockOpen();
  const onAgentAction = useAgentActions();

  // One keystroke to Medley, from anywhere. Not a search box: what the doctor
  // wants mid-clinic is to say a sentence, not to find a record.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggleDock();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const live = store?.tasks.find((t) => t.status === "calling");
  const error = store?.error;
  const waiting = store?.inbox.filter((i) => i.status === "open") ?? [];

  const retry = async () => {
    if (!store) return;
    setRetrying(true);
    try {
      await store.reload();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Rail. Horizontal strip under the header on small screens, where a
          220px column would eat half the width. */}
      <aside
        style={{ zIndex: "var(--z-rail)" }}
        className="fixed inset-x-0 top-0 flex h-14 items-center gap-1 border-b border-sidebar-border bg-sidebar px-3
                   md:inset-y-0 md:right-auto md:h-auto md:w-[228px] md:flex-col md:items-stretch md:gap-0 md:border-b-0 md:border-r md:px-3 md:py-4"
      >
        <Link
          to="/"
          className="mr-3 flex shrink-0 items-center gap-2.5 rounded-lg px-2 py-1.5 md:mr-0 md:mb-6"
        >
          <Mark className="h-[18px] w-[18px] text-foreground" />
          <span className="text-body font-semibold tracking-tight">Medley</span>
        </Link>

        <nav className="flex items-center gap-1 md:flex-col md:items-stretch md:gap-0.5">
          {NAV.map(({ to, label, icon: Icon }) => {
            // "/" would prefix-match everything, so home is matched exactly.
            const active = to === "/" ? path === "/" : path.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-body font-medium transition-colors duration-150 max-md:min-h-10 ${
                  active
                    ? "bg-card text-foreground shadow-soft"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
                }`}
              >
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"}`}
                  aria-hidden
                />
                <span className={to === "/" ? "sr-only md:not-sr-only" : ""}>{label}</span>
                {/* The count is the whole reason the inbox exists: it has to be
                    true on every screen, not just when someone opens it. */}
                {to === "/inbox" && waiting.length > 0 && (
                  <span
                    className={`ml-auto min-w-5 rounded-full px-1.5 py-0.5 text-center text-micro font-medium tabular-nums ${
                      waiting.some((i) => i.urgency === "urgent")
                        ? "bg-flag text-background"
                        : "bg-foreground text-background"
                    }`}
                  >
                    {waiting.length}
                    <span className="sr-only">
                      {" "}
                      waiting{waiting.some((i) => i.urgency === "urgent") ? ", one urgent" : ""}
                    </span>
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Pinned to the bottom of the rail on desktop: identity last, the way
            every tool the doctor already uses does it. */}
        <div className="ml-auto flex items-center gap-2 md:ml-0 md:mt-auto md:flex-col md:items-stretch md:gap-3">
          <button
            type="button"
            data-dock-toggle
            onClick={toggleDock}
            aria-pressed={dockOpen}
            aria-expanded={dockOpen}
            className={`hidden items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-micro transition-colors md:flex ${
              dockOpen
                ? "bg-card text-foreground shadow-soft"
                : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
            }`}
          >
            <Command className="h-3 w-3" aria-hidden />
            <span>K to ask Medley</span>
          </button>
          <div className="rounded-lg px-2.5 py-1.5 text-right md:bg-sidebar-accent/60 md:text-left">
            <div className="text-micro font-medium leading-tight text-foreground">Dr Hartley</div>
            <div className="text-micro leading-tight text-muted-foreground">Elm Surgery</div>
          </div>
        </div>
      </aside>

      <div className="pt-14 md:pl-[228px] md:pt-0">
        {live && (
          <Link
            to="/calls/$taskId"
            params={{ taskId: live.id }}
            style={{ zIndex: "var(--z-sticky)" }}
            className="sticky top-14 flex items-center gap-3 border-b border-border bg-live-surface px-5 py-2.5 transition-opacity hover:opacity-85 md:top-0"
          >
            <span className="pulse-dot ml-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-live text-live" />
            <span className="text-micro font-medium text-live">On a call now</span>
            <span className="truncate text-micro text-foreground">
              {store?.patientById(live.patientId)?.name ?? "Patient"} · {live.purpose}
            </span>
          </Link>
        )}

        {error && (
          <div role="alert" className="border-b border-border bg-flag-surface">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
              <p className="text-micro text-flag">
                Today's list didn't load, so anything below may be out of date.
              </p>
              <button
                type="button"
                onClick={() => void retry()}
                disabled={retrying}
                className="inline-flex items-center gap-1.5 rounded-lg bg-card px-2.5 py-1.5 text-micro font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
              >
                <RotateCw
                  className={`h-3 w-3 ${retrying ? "animate-spin motion-reduce:animate-none" : ""}`}
                  aria-hidden
                />
                {retrying ? "Retrying…" : "Try again"}
              </button>
            </div>
          </div>
        )}

        <main className="mx-auto max-w-[980px] px-5 py-8 sm:px-8">{children}</main>
      </div>

      {dockOpen && <VoiceDock onAction={onAgentAction} />}
    </div>
  );
}
