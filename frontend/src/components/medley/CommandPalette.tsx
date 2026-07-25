import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ListChecks, Users, CalendarDays, MessageSquare, Search, CornerDownLeft } from "lucide-react";
import { useMedleyStoreOptional } from "@/lib/medley-context";

type Item = {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  run: () => void;
};

/**
 * ⌘K. One keystroke to any patient, any call, or Medley itself.
 *
 * Rendered in a native <dialog> rather than a positioned div: it gets the top
 * layer, focus trapping and Escape from the platform, none of which is worth
 * reimplementing — and none of which can be clipped by an ancestor's overflow.
 */
export function CommandPalette() {
  const navigate = useNavigate();
  const store = useMedleyStoreOptional();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const close = () => {
    dialog.current?.close();
    setQuery("");
    setActive(0);
  };

  const items = useMemo<Item[]>(() => {
    const go = (to: string) => () => {
      close();
      void navigate({ to });
    };

    const places: Item[] = [
      { id: "nav-home", label: "Ask Medley", icon: MessageSquare, run: go("/") },
      { id: "nav-calls", label: "Calls", icon: ListChecks, run: go("/calls") },
      { id: "nav-patients", label: "Patients", icon: Users, run: go("/patients") },
      { id: "nav-calendar", label: "Calendar", icon: CalendarDays, run: go("/calendar") },
    ];

    const patients: Item[] = (store?.patients ?? []).map((p) => ({
      id: `patient-${p.id}`,
      label: p.name,
      hint: p.condition,
      icon: Users,
      run: () => {
        close();
        void navigate({ to: "/patients/$patientId", params: { patientId: p.id } });
      },
    }));

    const calls: Item[] = (store?.tasks ?? []).map((t) => ({
      id: `task-${t.id}`,
      label: t.purpose,
      hint: store?.patientById(t.patientId)?.name,
      icon: ListChecks,
      run: () => {
        close();
        void navigate({ to: "/calls/$taskId", params: { taskId: t.id } });
      },
    }));

    return [...places, ...patients, ...calls];
  }, [store, navigate]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 8);
    return items
      .filter((i) => `${i.label} ${i.hint ?? ""}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [items, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const el = dialog.current;
        if (!el) return;
        if (el.open) close();
        else el.showModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <dialog
      ref={dialog}
      onClose={() => {
        setQuery("");
        setActive(0);
      }}
      // Clicking the backdrop is the dialog element itself; clicking the panel
      // is a descendant, so this closes on the former only.
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
      className="w-[min(560px,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-0 text-foreground shadow-float
                 backdrop:bg-foreground/25 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-2.5 border-b border-border px-4">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % Math.max(results.length, 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => (i - 1 + results.length) % Math.max(results.length, 1));
            }
            if (e.key === "Enter") {
              e.preventDefault();
              results[active]?.run();
            }
          }}
          placeholder="Search patients, calls, or jump to a page"
          aria-label="Search"
          className="w-full bg-transparent py-3.5 text-body outline-none placeholder:text-muted-foreground"
        />
        <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-micro text-muted-foreground sm:block">
          esc
        </kbd>
      </div>

      {results.length === 0 ? (
        <p className="px-4 py-8 text-center text-body text-muted-foreground">
          Nothing matches “{query}”.
        </p>
      ) : (
        <ul className="max-h-[min(340px,50vh)] overflow-y-auto p-1.5">
          {results.map((item, i) => {
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={item.run}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors duration-100 ${
                    i === active ? "bg-secondary" : ""
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate text-body">{item.label}</span>
                  {item.hint && (
                    <span className="hidden min-w-0 max-w-[45%] truncate text-micro text-muted-foreground sm:block">
                      {item.hint}
                    </span>
                  )}
                  {i === active && (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </dialog>
  );
}
