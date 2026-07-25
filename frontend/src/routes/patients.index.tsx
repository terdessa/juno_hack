import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Search } from "lucide-react";
import { MedleyProvider, useMedleyStore } from "@/lib/medley-store";
import { Shell } from "@/components/medley/Shell";
import { PatientPeek } from "@/components/medley/PatientPeek";
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
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search"
            aria-label="Search patients"
            className="w-56 rounded-xl border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/25"
          />
        </div>
      </div>

      {loading && <p className="py-16 text-center text-muted-foreground">Loading…</p>}
      {!loading && shown.length === 0 && (
        <p className="py-16 text-center text-muted-foreground">No patients match “{q}”.</p>
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
                  <div className="font-display text-[17px] leading-snug">{p.name}</div>
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
