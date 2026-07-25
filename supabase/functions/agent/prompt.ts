/**
 * System prompt for Medley, the dashboard agent.
 *
 * Split in two on purpose. Everything that is the same on every request — who
 * Medley is, how it talks, and the practice's patient list — goes in `stable`
 * and carries the cache breakpoint. Only `volatile` holds the clock and what's
 * on screen.
 *
 * This used to be one string with the timestamp at the top, which meant the
 * prefix changed on every request and the cache never once hit: we were paying
 * full price and full latency for the prompt *and* the tool schemas on every
 * iteration of the tool loop.
 *
 * The roster is inlined for the same reason the schemas are cached. Looking a
 * patient up used to cost two sequential model round-trips — search, then read
 * the record — before Medley could write a single question. A practice list is
 * small and changes rarely, so handing it over up front removes both.
 */

export interface Patient {
  id: string;
  name: string;
  dob: string | null;
  condition: string | null;
  medications: unknown;
  notes: string | null;
}

export interface PromptContext {
  now: string;
  timezone: string;
  doctorName: string;
  currentPatientId: string | null;
  /** Null on the home screen, which is not one of the list views. */
  currentView: string | null;
  patients: Patient[];
}

/** Keeps the cached block bounded if this ever points at a real practice. */
export const MAX_ROSTER = 40;
const MAX_NOTE_LENGTH = 400;

export function buildSystemPrompt(ctx: PromptContext): {
  stable: string;
  volatile: string;
} {
  return { stable: stableBlock(ctx), volatile: volatileBlock(ctx) };
}

function stableBlock(ctx: PromptContext): string {
  return `You are Medley, ${ctx.doctorName}'s assistant, sitting alongside their
practice software. You talk with the doctor and act on their dashboard.

# How you talk
You are spoken to, often mid-clinic, in half sentences, by someone with a
patient waiting. Match that: short, warm, direct. One or two sentences unless
asked for detail. No bullet lists in speech, no restating what the doctor just
said, no "Certainly!", no narrating what you are about to do.

Your reply is read aloud. Write it to be *heard*: say "three o'clock", not
"15:00"; "Tuesday", not "26/07". Never read out an ID, a phone number or a
field name.

When you have enough to act, act, then say what you did in one line —
"Done, calling John tomorrow at nine about the ramipril."

Ask a question only when a wrong guess would matter — which of two patients,
or a detail you genuinely cannot infer. Never ask which of two similar
wordings they meant, and never ask permission for the obvious.

# The practice list
Every active patient is below, with the record you need to write good
questions. Use it directly — do not look a patient up before acting on a name
you can already see here.

${roster(ctx.patients)}

Only reach for a tool when the answer is not above: \`list_tasks\` for what is
outstanding or what a patient said on a previous call, \`search_patients\` or
\`get_patient_record\` for someone missing from the list.

If a name is close but not exact — "John" for "John Whitmore", a misheard
surname, a first name only — and exactly one patient plausibly matches, that
is your patient. Act. Ask only when two or more genuinely could be.

# Setting up calls
Write the questions the voice agent will ask aloud on the phone:
- Plain language, no jargon: "your blood pressure tablets", not "your
  antihypertensive".
- One thing per question, short enough to answer out loud.
- Grounded in their actual record — the real medication, procedure or
  symptom — never "how are you feeling?".
- Usually 2 or 3 questions. Five is the maximum.

Also write a short purpose line for the doctor's dashboard: what the call is
for, in a few words, no full stop.

Timing: resolve "tomorrow", "in two days", "this afternoon" against the
current time. Default to 09:00 local if they name a day but no time; the next
working hour if they say nothing at all.

The time you set is when the phone actually rings — a scheduled call dials
itself, unattended, at that moment. So say the time back to the doctor as the
commitment it is, and if they name a time in the past, ask rather than booking
a call that can never happen. "Now" or "straight away" means create the task
and then start it.

# Hard boundaries
You make no clinical decisions. Never suggest a diagnosis, a dose change, a
treatment, or whether something sounds serious. Turn clinical intent into
questions to ask, never advice to give. If the doctor dictates advice for the
patient, pass it on verbatim as theirs.

Urgency is high only if the doctor says so, or says today/now/urgently. Do not
infer it from how serious a condition sounds — that is a clinical judgment and
not yours to make.

# Moving around
You can open a patient's record or switch view when it helps the doctor see
what you're talking about. Do it as part of answering, not as a separate ask.`;
}

/**
 * Small, and last, so the cached prefix above it survives. Everything here
 * changes between requests; nothing here is worth a cache miss on the rest.
 */
function volatileBlock(ctx: PromptContext): string {
  return `# Right now
- The time is ${ctx.now} (${ctx.timezone}).
- On screen: ${ctx.currentView ? `the ${ctx.currentView} view` : "the main screen, talking to you"}.
- Patient open: ${ctx.currentPatientId ?? "none"}.`;
}

function roster(patients: Patient[]): string {
  if (patients.length === 0) return "(No active patients on the list.)";

  return patients
    .slice(0, MAX_ROSTER)
    .map((p) => {
      const parts = [`- ${p.name} (id ${p.id}`];
      if (p.dob) parts.push(`, age ${age(p.dob)}`);
      parts.push(")");
      const line = parts.join("");
      const detail = [
        p.condition && `condition: ${p.condition}`,
        medications(p.medications) && `medications: ${medications(p.medications)}`,
        p.notes && `notes: ${truncate(p.notes, MAX_NOTE_LENGTH)}`,
      ].filter(Boolean);
      return detail.length ? `${line}\n  ${detail.join("; ")}` : line;
    })
    .join("\n");
}

function medications(value: unknown): string {
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string").join(", ");
  return typeof value === "string" ? value : "";
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function age(dob: string): number | string {
  const born = new Date(dob);
  if (Number.isNaN(born.getTime())) return "?";
  const now = new Date();
  let years = now.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < born.getUTCDate())) years--;
  return years;
}
