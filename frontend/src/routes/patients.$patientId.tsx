import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { MedleyProvider } from "@/lib/medley-store";
import { useMedleyStore } from "@/lib/medley-context";
import { Shell } from "@/components/medley/Shell";
import { StatusDot, statusLabel } from "@/components/medley/status";
import { DetailSkeleton } from "@/components/medley/loading";
import { formatDate, formatRelative } from "@/lib/format";

export const Route = createFileRoute("/patients/$patientId")({
  head: () => ({ meta: [{ title: "Patient · Medley" }] }),
  component: () => (
    <MedleyProvider>
      <Shell>
        <PatientPage />
      </Shell>
    </MedleyProvider>
  ),
});

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="py-2.5">
      <dt className="text-micro text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-body">{value}</dd>
    </div>
  );
}

function PatientPage() {
  const { patientId } = useParams({ from: "/patients/$patientId" });
  const { patients, tasks, loading } = useMedleyStore();
  const p = patients.find((x) => x.id === patientId);

  if (loading) return <DetailSkeleton label="Loading patient record" />;
  if (!p) {
    return (
      <p className="py-24 text-center text-muted-foreground">
        No such patient.{" "}
        <Link to="/patients" className="text-foreground underline underline-offset-4">
          Back to patients
        </Link>
      </p>
    );
  }

  const history = tasks.filter((t) => t.patientId === p.id);

  return (
    <article>
      <Link
        to="/patients"
        className="mb-8 inline-flex items-center gap-1.5 text-body text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Patients
      </Link>

      <header className="border-b border-border pb-6">
        <h1 className="text-2xl leading-tight tracking-tight">{p.name}</h1>
        <p className="mt-2 text-body text-muted-foreground">
          {p.age} · NHS {p.nhsNumber} · last seen {formatRelative(p.lastVisit)}
        </p>
        <p className="mt-3 text-body font-medium">{p.condition}</p>
      </header>

      <div className="grid gap-10 pt-8 lg:grid-cols-[1fr_20rem]">
        <div>
          {p.notes && (
            <section>
              <h2 className="text-lg tracking-tight">Notes</h2>
              <p className="mt-2 max-w-[68ch] text-body leading-relaxed">{p.notes}</p>
            </section>
          )}

          {p.medications.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg tracking-tight">Medications</h2>
              <ul className="mt-2 space-y-1">
                {p.medications.map((m) => (
                  <li key={m} className="text-body">
                    {m}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {p.vaccinations.length > 0 && (
            <section className="mt-8">
              <h2 className="text-lg tracking-tight">Vaccinations</h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {p.vaccinations.map((v) => (
                  <li
                    key={v}
                    className="rounded-md bg-secondary px-2.5 py-1 text-micro text-muted-foreground"
                  >
                    {v}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-8">
            <h2 className="text-lg tracking-tight">Follow-up calls</h2>
            {history.length === 0 ? (
              <p className="mt-2 text-body text-muted-foreground">
                None yet.{" "}
                <Link to="/" className="text-foreground underline underline-offset-4">
                  Ask Medley to set one up
                </Link>
                .
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border">
                {history.map((t) => (
                  <li key={t.id}>
                    <Link
                      to="/calls/$taskId"
                      params={{ taskId: t.id }}
                      className="flex items-center gap-3 py-3 transition-colors hover:bg-secondary/40"
                    >
                      <StatusDot status={t.status} described={false} />
                      <span className="min-w-0 flex-1 truncate text-body">{t.purpose}</span>
                      <span className="shrink-0 text-micro tabular-nums text-muted-foreground">
                        {formatDate(t.scheduledAt)}
                      </span>
                      <span className="shrink-0 text-micro text-muted-foreground">
                        {statusLabel[t.status]}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside>
          <h2 className="text-lg tracking-tight">Contact</h2>
          <dl className="mt-1 divide-y divide-border">
            <Field label="Mobile" value={p.phone} />
            <Field label="Alternative" value={p.altPhone} />
            <Field label="Preferred" value={p.preferredContact} />
            <Field label="Email" value={p.email} />
            <Field label="Address" value={p.address} />
            <Field
              label="Next of kin"
              value={
                p.nextOfKin &&
                `${p.nextOfKin.name} (${p.nextOfKin.relation}) · ${p.nextOfKin.phone}`
              }
            />
          </dl>
        </aside>
      </div>
    </article>
  );
}
