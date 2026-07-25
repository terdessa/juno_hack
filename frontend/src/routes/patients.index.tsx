import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { MedleyProvider } from "@/lib/medley-store";
import { useMedleyStore } from "@/lib/medley-context";
import { Shell } from "@/components/medley/Shell";
import { PatientPeek } from "@/components/medley/PatientPeek";
import { ListSkeleton } from "@/components/medley/loading";
import { formatRelative } from "@/lib/format";

export const Route = createFileRoute("/patients/")({
  head: () => ({ meta: [{ title: "Patients · Medley" }] }),
  component: () => (
    <MedleyProvider>
      <Shell>
        <PatientsPage />
      </Shell>
    </MedleyProvider>
  ),
});

function PatientsPage() {
  const { patients, loading } = useMedleyStore();
  const [q, setQ] = useState("");
  const shown = patients.filter((p) =>
    `${p.name} ${p.condition}`.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl tracking-tight">Patients</h1>
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            placeholder="Search name or condition"
            aria-label="Search patients by name or condition"
            className="w-full min-w-0 rounded-xl border border-input bg-card py-2.5 pl-9 pr-3 text-sm placeholder:text-muted-foreground sm:w-64"
          />
        </div>
      </div>

      {loading && <ListSkeleton label="Loading patients" />}

      {!loading && shown.length === 0 && (
        <div className="py-16 text-center">
          <p className="text-body font-medium">
            {q ? `No patients match “${q}”` : "No patients on your list"}
          </p>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {q
              ? "Search matches names and conditions. Check the spelling, or clear the search to see everyone."
              : "Patients appear here once they're registered to your list at the practice."}
          </p>
          {q && (
            <button
              onClick={() => setQ("")}
              className="mt-4 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Clear search
            </button>
          )}
        </div>
      )}

      <ul className="divide-y divide-border">
        {shown.map((p) => (
          <li key={p.id}>
            <PatientPeek patient={p}>
              <Link
                to="/patients/$patientId"
                params={{ patientId: p.id }}
                className="flex items-center gap-4 py-4 transition-colors hover:bg-secondary/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-display text-reading leading-snug">{p.name}</div>
                  <div className="truncate text-sm text-muted-foreground">{p.condition}</div>
                </div>
                <div className="hidden shrink-0 text-right text-sm text-muted-foreground sm:block">
                  <div className="tabular-nums text-foreground">{p.age}</div>
                  <div className="text-xs">seen {formatRelative(p.lastVisit)}</div>
                </div>
              </Link>
            </PatientPeek>
          </li>
        ))}
      </ul>
    </div>
  );
}
