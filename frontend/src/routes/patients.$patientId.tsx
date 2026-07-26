import { useEffect, useState } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { MedleyProvider } from "@/lib/medley-store";
import { useMedleyStore } from "@/lib/medley-context";
import { Shell } from "@/components/medley/Shell";
import { StatusDot, statusLabel } from "@/components/medley/status";
import { DetailSkeleton } from "@/components/medley/loading";
import { formatDate, formatRelative } from "@/lib/format";
import { patientAction } from "@/lib/medley-api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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

/** One line of free text per medication/vaccination — matches how the record
 * already stores them (a plain string array), so there's nothing to parse
 * beyond dropping blank lines. */
function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function RecordEditor({
  patientId,
  notes,
  medications,
  vaccinations,
  onDone,
}: {
  patientId: string;
  notes: string;
  medications: string[];
  vaccinations: string[];
  onDone: () => void;
}) {
  const [notesText, setNotesText] = useState(notes);
  const [medicationsText, setMedicationsText] = useState(medications.join("\n"));
  const [vaccinationsText, setVaccinationsText] = useState(vaccinations.join("\n"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const result = await patientAction(patientId, {
        notes: notesText.trim(),
        medications: toLines(medicationsText),
        vaccinations: toLines(vaccinationsText),
      });
      if (result.ok) {
        onDone();
        return;
      }
      setError(result.reason ?? "That didn't save.");
    } catch {
      // A thrown network error (offline, DNS, CORS) rather than a normal
      // {ok:false} response — same recovery either way: let the doctor see
      // it and try again rather than trapping them in a disabled form.
      setError("Couldn't reach the practice system. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-lg tracking-tight">Notes</h2>
        <Textarea
          value={notesText}
          onChange={(e) => setNotesText(e.target.value)}
          placeholder="Anything the practice should know before calling."
          className="mt-2 min-h-24 max-w-[68ch]"
          disabled={saving}
        />
      </section>

      <section>
        <h2 className="text-lg tracking-tight">Medications</h2>
        <p className="mt-1 text-micro text-muted-foreground">One per line.</p>
        <Textarea
          value={medicationsText}
          onChange={(e) => setMedicationsText(e.target.value)}
          placeholder="Ramipril 5mg"
          className="mt-2 min-h-20 max-w-[68ch]"
          disabled={saving}
        />
      </section>

      <section>
        <h2 className="text-lg tracking-tight">Vaccinations</h2>
        <p className="mt-1 text-micro text-muted-foreground">One per line.</p>
        <Textarea
          value={vaccinationsText}
          onChange={(e) => setVaccinationsText(e.target.value)}
          placeholder="Flu — Oct 2025"
          className="mt-2 min-h-20 max-w-[68ch]"
          disabled={saving}
        />
      </section>

      {error && <p className="text-body text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />}
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function PatientPage() {
  const { patientId } = useParams({ from: "/patients/$patientId" });
  const { patients, tasks, loading, reload } = useMedleyStore();
  const p = patients.find((x) => x.id === patientId);
  const [editing, setEditing] = useState(false);

  // Navigating to a different patient (e.g. via the assistant's "open
  // patient" action) doesn't unmount this component — only patientId
  // changes. Without this, a half-typed edit for the previous patient could
  // be saved against this one.
  useEffect(() => {
    setEditing(false);
  }, [patientId]);

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

      <header className="flex items-start justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="text-2xl leading-tight tracking-tight">{p.name}</h1>
          <p className="mt-2 text-body text-muted-foreground">
            {p.age} · NHS {p.nhsNumber} · last seen {formatRelative(p.lastVisit)}
          </p>
          <p className="mt-3 text-body font-medium">{p.condition}</p>
        </div>
        {!editing && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit record
          </Button>
        )}
      </header>

      <div className="grid gap-10 pt-8 lg:grid-cols-[1fr_20rem]">
        <div>
          {editing ? (
            <RecordEditor
              key={p.id}
              patientId={p.id}
              notes={p.notes ?? ""}
              medications={p.medications}
              vaccinations={p.vaccinations}
              onDone={async () => {
                await reload();
                setEditing(false);
              }}
            />
          ) : (
            <>
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

              {!p.notes && p.medications.length === 0 && p.vaccinations.length === 0 && (
                <p className="text-body text-muted-foreground">
                  Nothing on file yet.{" "}
                  <button
                    type="button"
                    onClick={() => setEditing(true)}
                    className="text-foreground underline underline-offset-4"
                  >
                    Add a note
                  </button>
                  .
                </p>
              )}
            </>
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
