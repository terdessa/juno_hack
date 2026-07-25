import { Link, useRouterState } from "@tanstack/react-router";
import { MessageSquare, ListChecks, Users, CalendarDays } from "lucide-react";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Medley", icon: MessageSquare },
  { to: "/calls", label: "Calls", icon: ListChecks },
  { to: "/patients", label: "Patients", icon: Users },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
] as const;

/**
 * One nav, four places, large targets. A doctor reads this between patients,
 * so labels stay visible rather than hiding behind icons.
 */
export function Shell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });

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
            {NAV.slice(1).map(({ to, label, icon: Icon }) => {
              const active = path.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto text-right">
            <div className="text-sm font-medium leading-tight">Dr Hartley</div>
            <div className="text-xs text-muted-foreground">Elm Surgery</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1240px] px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
