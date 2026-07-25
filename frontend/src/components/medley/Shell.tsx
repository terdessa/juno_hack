import { Link, useRouterState } from "@tanstack/react-router";
import { MessageSquare, ListChecks, Users, CalendarDays, RotateCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useMedleyStoreOptional } from "@/lib/medley-context";

const NAV = [
  { to: "/", label: "Medley", icon: MessageSquare },
  { to: "/calls", label: "Calls", icon: ListChecks },
  { to: "/patients", label: "Patients", icon: Users },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
] as const;

/**
 * One nav, four places, large targets. A doctor reads this between patients,
 * so labels stay visible rather than hiding behind icons.
 *
 * Two things live here rather than on any single page, because both must be
 * true everywhere: a call in progress, and a list that failed to load. An
 * empty list that silently means "the database is down" is the one failure
 * this product cannot afford.
 */
export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  // Optional: the nav must render even if this is mounted without the data
  // provider. The strip and the banner are decoration on top of the data, not
  // a reason to take the whole app down.
  const store = useMedleyStoreOptional();
  const [retrying, setRetrying] = useState(false);

  const live = store?.tasks.find((t) => t.status === "calling");
  const error = store?.error;

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
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center gap-1 px-4 sm:px-6">
          <Link to="/" className="mr-4 flex shrink-0 items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground">
              M
            </span>
            <span className="font-display text-xl tracking-tight">Medley</span>
          </Link>

          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon }) => {
              // "/" would prefix-match everything, so home is matched exactly.
              const active = to === "/" ? path === "/" : path.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors max-sm:min-h-11 sm:px-3.5 ${
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                  <span className={to === "/" ? "sr-only sm:not-sr-only" : ""}>{label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto hidden text-right sm:block">
            <div className="text-sm font-medium leading-tight">Dr Hartley</div>
            <div className="text-xs text-muted-foreground">Elm Surgery</div>
          </div>
        </div>

        {live && (
          <Link
            to="/calls/$taskId"
            params={{ taskId: live.id }}
            className="flex items-center gap-3 border-t border-border bg-live-surface px-4 py-2.5 transition-opacity hover:opacity-85 sm:px-6"
          >
            <span className="pulse-dot ml-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-live text-live" />
            <span className="text-sm font-medium text-live">On a call now</span>
            <span className="truncate text-sm text-foreground">
              {store?.patientById(live.patientId)?.name ?? "Patient"} · {live.purpose}
            </span>
          </Link>
        )}
      </header>

      {error && (
        <div role="alert" className="border-b border-border bg-flag-surface">
          <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
            <p className="text-sm text-flag">
              Today's list didn't load, so anything below may be out of date.
            </p>
            <button
              type="button"
              onClick={() => void retry()}
              disabled={retrying}
              className="inline-flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
            >
              <RotateCw
                className={`h-3.5 w-3.5 ${retrying ? "animate-spin motion-reduce:animate-none" : ""}`}
                aria-hidden
              />
              {retrying ? "Retrying…" : "Try again"}
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
