import { useEffect, useMemo, useState } from "react";
import {
  Phone,
  PhoneCall,
  PhoneOff,
  CheckCircle2,
  Clock,
  Minimize2,
  Plus,
  Search,
  Calendar,
  Users,
  ListChecks,
  Mic,
  X,
  ArrowUpDown,
  ChevronRight,
  ChevronLeft,
  Heart,
  Pill,
  Syringe,
  FileText,
  Pin,
  Sun,
  Moon,
  AlertTriangle,
  CalendarClock,
  Pencil,
  Trash2,
  UserRound,
  Mail,
  MapPin,
  Contact,

} from "lucide-react";

import { patients, initialTasks, patientById, assignees, assigneeById, type CallTask, type CallTag, type Mood, type Assignee } from "@/lib/mock-data";
import { formatTime, formatRelative, formatDate, formatDuration } from "@/lib/format";

type View = "calls" | "patients" | "calendar";

const moodMeta: Record<Mood, { label: string; className: string; dot: string }> = {
  positive: { label: "Positive", className: "bg-success/10 text-success", dot: "bg-success" },
  neutral: { label: "Neutral", className: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
  low: { label: "Low mood", className: "bg-warning/15 text-warning-foreground", dot: "bg-warning" },
  distressed: { label: "Distressed", className: "bg-destructive/10 text-destructive", dot: "bg-destructive" },
};

const statusMeta: Record<CallTask["status"], { label: string; icon: typeof Phone; className: string }> = {
  queued: { label: "Queued", icon: Clock, className: "text-muted-foreground bg-muted" },
  calling: { label: "On call", icon: PhoneCall, className: "text-primary bg-primary/10" },
  completed: { label: "Completed", icon: CheckCircle2, className: "text-success bg-success/10" },
  failed: { label: "No answer", icon: PhoneOff, className: "text-destructive bg-destructive/10" },
};

const tagMeta: Record<CallTag, { label: string; className: string; severity: "warn" | "alert" | "info" }> = {
  "depression-detected": { label: "Depression detected", className: "bg-destructive/10 text-destructive border-destructive/30", severity: "alert" },
  "anxiety-detected": { label: "Anxiety detected", className: "bg-warning/15 text-warning-foreground border-warning/40", severity: "warn" },
  "safeguarding-concern": { label: "Safeguarding concern", className: "bg-destructive/10 text-destructive border-destructive/30", severity: "alert" },
  "reschedule-requested": { label: "Reschedule requested", className: "bg-primary/10 text-primary border-primary/30", severity: "info" },
  "human-call-requested": { label: "Human call requested", className: "bg-primary/10 text-primary border-primary/30", severity: "info" },
  "medication-issue": { label: "Medication issue", className: "bg-warning/15 text-warning-foreground border-warning/40", severity: "warn" },
  "no-answer": { label: "No answer", className: "bg-muted text-muted-foreground border-border", severity: "info" },
};

export function Dashboard({ onMinimize }: { onMinimize: () => void }) {
  const [tasks, setTasks] = useState<CallTask[]>(initialTasks);
  const [view, setView] = useState<View>("calls");
  const [selectedId, setSelectedId] = useState<string | null>(initialTasks[0].id);
  const [newOpen, setNewOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const activeCall = tasks.find((t) => t.status === "calling");
  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const editing = tasks.find((t) => t.id === editingId) ?? null;

  const addTask = (t: CallTask) => {
    setTasks((prev) => [t, ...prev]);
    setSelectedId(t.id);
  };

  const updateTask = (id: string, patch: Partial<CallTask>) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const cancelTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setSelectedId((cur) => (cur === id ? null : cur));
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1400px]">
        <Sidebar view={view} setView={setView} onNewCall={() => setNewOpen(true)} />

        <main className="flex-1 border-x border-border/60 bg-background">
          <Topbar activeCall={activeCall} onMinimize={onMinimize} onNewCall={() => setNewOpen(true)} />

          {view === "calls" && (
            <CallsView
              tasks={tasks}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
          {view === "patients" && <PatientsView />}
          {view === "calendar" && <CalendarView tasks={tasks} onSelect={setSelectedId} selectedId={selectedId} />}
        </main>

        <aside className="hidden w-[380px] shrink-0 border-l border-border/60 bg-sidebar/40 xl:block">
          <DetailPanel
            task={selected}
            onEdit={() => selected && setEditingId(selected.id)}
            onCancel={() => selected && cancelTask(selected.id)}
            onRemoveTag={(tag) =>
              selected &&
              updateTask(selected.id, {
                tags: (selected.tags ?? []).filter((t) => t !== tag),
              })
            }
            onReassign={(id) => selected && updateTask(selected.id, { assigneeId: id })}
          />
        </aside>
      </div>

      {newOpen && <NewCallDialog onClose={() => setNewOpen(false)} onCreate={addTask} />}
      {editing && (
        <EditCallDialog
          task={editing}
          onClose={() => setEditingId(null)}
          onSave={(patch) => {
            updateTask(editing.id, patch);
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Sidebar ---------------- */

function Sidebar({
  view,
  setView,
  onNewCall,
}: {
  view: View;
  setView: (v: View) => void;
  onNewCall: () => void;
}) {
  const items: { id: View; label: string; icon: typeof Phone; count?: number }[] = [
    { id: "calls", label: "Calls", icon: ListChecks, count: initialTasks.length },
    { id: "patients", label: "Patients", icon: Users, count: patients.length },
    { id: "calendar", label: "Calendar", icon: Calendar },
  ];

  return (
    <aside className="hidden w-[240px] shrink-0 flex-col gap-6 bg-sidebar px-4 py-6 md:flex">
      <div className="flex items-center gap-2 px-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary font-display text-sm font-semibold text-primary-foreground">
          M
        </div>
        <div className="min-w-0">
          <div className="font-display text-xl leading-none tracking-tight">Medley</div>
          <div className="text-[11px] text-muted-foreground">Dr Hartley · Elm Surgery</div>
        </div>
      </div>

      <button
        onClick={onNewCall}
        className="flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90"
      >
        <Plus className="h-4 w-4" />
        Assign a call
      </button>

      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`group flex items-center justify-between rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4" />
                {item.label}
              </span>
              {item.count !== undefined && (
                <span className="rounded-md bg-background/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {item.count}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-border/70 bg-background/60 p-3 text-xs text-muted-foreground">
        <div className="mb-1 font-medium text-foreground">Today</div>
        <div className="flex items-center justify-between">
          <span>Completed calls</span>
          <span className="font-semibold text-foreground">
            {initialTasks.filter((t) => t.status === "completed").length}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span>Time saved</span>
          <span className="font-semibold text-foreground">≈ 42 min</span>
        </div>
      </div>
    </aside>
  );
}

/* ---------------- Topbar ---------------- */

function Topbar({
  activeCall,
  onMinimize,
  onNewCall,
}: {
  activeCall: CallTask | undefined;
  onMinimize: () => void;
  onNewCall: () => void;
}) {
  return (
    <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/60 px-6 py-4 sm:flex sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate font-display text-2xl leading-tight sm:text-3xl">
          Your call queue
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={onNewCall}
          className="hidden items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium transition hover:bg-secondary md:inline-flex"
        >
          <Plus className="h-4 w-4" /> New call
        </button>
        <ThemeToggle />

      </div>
    </header>
  );
}

/* ---------------- Calls View ---------------- */

function CallsView({
  tasks,
  selectedId,
  onSelect,
}: {
  tasks: CallTask[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | CallTask["status"]>("all");
  const filtered = tasks.filter((t) => filter === "all" || t.status === filter);

  const filters: { id: typeof filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "calling", label: "Live" },
    { id: "queued", label: "Queued" },
    { id: "completed", label: "Completed" },
  ];

  return (
    <div className="px-6 py-6">
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === f.id
                ? "bg-foreground text-background"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/70"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className="flex flex-col gap-2">
        {filtered.map((task) => (
          <CallRow
            key={task.id}
            task={task}
            active={task.id === selectedId}
            onClick={() => onSelect(task.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function CallRow({
  task,
  active,
  onClick,
}: {
  task: CallTask;
  active: boolean;
  onClick: () => void;
}) {
  const p = patientById(task.patientId)!;
  const s = statusMeta[task.status];
  const StatusIcon = s.icon;

  return (
    <li>
      <button
        onClick={onClick}
        className={`group grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition ${
          active
            ? "border-primary/40 bg-primary/5 shadow-soft"
            : "border-border/60 bg-card hover:border-border hover:bg-secondary/40"
        }`}
      >
        <Avatar name={p.name} />

        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="truncate font-medium">{p.name}</span>
            <span className="text-xs text-muted-foreground">· {p.age}</span>
          </div>
          <div className="mt-0.5 truncate text-sm text-muted-foreground">{task.purpose}</div>
          {task.tags && task.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {task.tags.map((tag) => {
                const meta = tagMeta[tag];
                return (
                  <span
                    key={tag}
                    className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${meta.className}`}
                  >
                    {meta.severity !== "info" && <AlertTriangle className="h-2.5 w-2.5" />}
                    {meta.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>


        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${s.className}`}>
            {task.status === "calling" ? (
              <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-current" />
            ) : (
              <StatusIcon className="h-3 w-3" />
            )}
            {s.label}
          </span>
          <span className="text-[11px] text-muted-foreground">
            {formatTime(task.scheduledAt)} · {formatRelative(task.scheduledAt)}
          </span>
          <AssigneeChip assignee={assigneeById(task.assigneeId)} />
        </div>
      </button>
    </li>
  );
}

/* ---------------- Patients View ---------------- */

function PatientsView() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"age" | "recent" | "name">("age");
  const [openId, setOpenId] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<Set<string>>(new Set(["p6"]));

  const toggleFlag = (id: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const list = useMemo(() => {
    const filtered = patients.filter((p) =>
      p.name.toLowerCase().includes(q.toLowerCase())
    );
    const sorted = [...filtered].sort((a, b) => {
      if (sort === "age") return b.age - a.age;
      if (sort === "name") return a.name.localeCompare(b.name);
      return new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime();
    });
    // Flagged patients always float to the top, preserving current sort within groups.
    return sorted.sort((a, b) => {
      const af = flagged.has(a.id) ? 0 : 1;
      const bf = flagged.has(b.id) ? 0 : 1;
      return af - bf;
    });
  }, [q, sort, flagged]);

  return (
    <div className="px-6 py-6">
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:justify-between">
        <div className="relative min-w-0 max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search patients…"
            className="w-full rounded-lg border border-border bg-card py-2 pl-9 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <button
          onClick={() =>
            setSort(sort === "age" ? "recent" : sort === "recent" ? "name" : "age")
          }
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm hover:bg-secondary/60"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          Sort: {sort === "age" ? "Age" : sort === "recent" ? "Recent visit" : "Name"}
        </button>
      </div>

      {flagged.size > 0 && (
        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Pin className="h-3.5 w-3.5 text-primary" />
          <span>
            {flagged.size} flagged {flagged.size === 1 ? "patient" : "patients"} pinned to top
          </span>
        </div>
      )}

      <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/60 bg-card">
        {list.map((p) => {
          const open = openId === p.id;
          const isFlagged = flagged.has(p.id);
          return (
            <li
              key={p.id}
              className={isFlagged ? "bg-primary/[0.04]" : undefined}
            >
              <div className="grid w-full grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3.5 text-left transition hover:bg-secondary/40">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFlag(p.id);
                  }}
                  title={isFlagged ? "Unflag patient" : "Flag patient — pin to top"}
                  aria-pressed={isFlagged}
                  className={`grid h-8 w-8 place-items-center rounded-lg border transition ${
                    isFlagged
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-transparent text-muted-foreground/60 hover:border-border hover:text-foreground"
                  }`}
                >
                  <Pin className={`h-4 w-4 ${isFlagged ? "fill-current" : ""}`} />
                </button>
                <button
                  onClick={() => setOpenId(open ? null : p.id)}
                  className="contents text-left"
                >
                  <Avatar name={p.name} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{p.name}</span>
                      {isFlagged && (
                        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                          Flagged
                        </span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.age} yrs · {p.condition}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span className="hidden sm:inline">Last seen {formatDate(p.lastVisit)}</span>
                    <ChevronRight
                      className={`h-4 w-4 transition ${open ? "rotate-90" : ""}`}
                    />
                  </div>
                </button>
              </div>
              {open && (
                <div className="grid gap-4 border-t border-border/60 bg-secondary/20 px-4 py-4 sm:grid-cols-2">
                  <ContactBlock patient={p} className="sm:col-span-2" />
                  <RecordBlock
                    icon={Syringe}
                    title="Vaccinations"
                    items={p.vaccinations}
                  />
                  <RecordBlock icon={Pill} title="Medications" items={p.medications} />
                  <RecordBlock
                    icon={FileText}
                    title="Notes"
                    items={[p.notes]}
                    className="sm:col-span-2"
                  />
                </div>
              )}

            </li>
          );
        })}
      </ul>
    </div>
  );
}


function RecordBlock({
  icon: Icon,
  title,
  items,
  className = "",
}: {
  icon: typeof Phone;
  title: string;
  items: string[];
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border/60 bg-card p-3 ${className}`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {title}
      </div>
      <ul className="space-y-1 text-sm">
        {items.map((it, i) => (
          <li key={i} className="text-foreground/90">
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContactBlock({
  patient,
  className = "",
}: {
  patient: (typeof patients)[number];
  className?: string;
}) {
  const rows: { icon: typeof Phone; label: string; value: string; primary?: boolean }[] = [
    { icon: Phone, label: "Primary phone", value: patient.phone, primary: true },
  ];
  if (patient.altPhone) rows.push({ icon: Phone, label: "Alternative", value: patient.altPhone });
  if (patient.email) rows.push({ icon: Mail, label: "Email", value: patient.email });
  if (patient.address) rows.push({ icon: MapPin, label: "Address", value: patient.address });
  if (patient.preferredContact)
    rows.push({ icon: Clock, label: "Preferred contact", value: patient.preferredContact });

  return (
    <div className={`rounded-lg border border-border/60 bg-card p-3 ${className}`}>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Contact className="h-3.5 w-3.5" /> Contact details
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            <r.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {r.label}
              </div>
              <div className={`truncate ${r.primary ? "font-medium text-foreground" : "text-foreground/90"}`}>
                {r.value}
              </div>
            </div>
          </div>
        ))}
        {patient.nextOfKin && (
          <div className="flex items-start gap-2 text-sm sm:col-span-2">
            <UserRound className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Next of kin
              </div>
              <div className="text-foreground/90">
                {patient.nextOfKin.name} · {patient.nextOfKin.relation} · {patient.nextOfKin.phone}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


/* ---------------- Calendar View (weekly) ---------------- */

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - day);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function CalendarView({ tasks, onSelect, selectedId }: { tasks: CallTask[]; onSelect: (id: string) => void; selectedId: string | null }) {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const hours = Array.from({ length: 11 }, (_, i) => 8 + i); // 8:00 - 18:00
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();
  const weekEnd = addDays(weekStart, 6);

  const monthLabel = (() => {
    if (weekStart.getMonth() === weekEnd.getMonth()) {
      return `${MONTH_NAMES[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
    }
    return `${MONTH_NAMES[weekStart.getMonth()].slice(0,3)} – ${MONTH_NAMES[weekEnd.getMonth()].slice(0,3)} ${weekEnd.getFullYear()}`;
  })();

  // Month/year picker + week-in-month selector
  const [pickerMonth, setPickerMonth] = useState<number>(weekStart.getMonth());
  const [pickerYear, setPickerYear] = useState<number>(weekStart.getFullYear());

  const weeksInPickerMonth = useMemo(() => {
    const first = new Date(pickerYear, pickerMonth, 1);
    const last = new Date(pickerYear, pickerMonth + 1, 0);
    const firstWeek = startOfWeek(first);
    const out: Date[] = [];
    let cur = firstWeek;
    while (cur <= last) {
      out.push(cur);
      cur = addDays(cur, 7);
    }
    return out;
  }, [pickerMonth, pickerYear]);

  const goPrevWeek = () => setWeekStart(addDays(weekStart, -7));
  const goNextWeek = () => setWeekStart(addDays(weekStart, 7));
  const goToday = () => setWeekStart(startOfWeek(new Date()));

  const years = Array.from({ length: 5 }, (_, i) => today.getFullYear() - 2 + i);

  const GUTTER = "56px";
  const gridCols = { gridTemplateColumns: `${GUTTER} repeat(7, minmax(0, 1fr))` };

  return (
    <div className="px-4 py-4">
      {/* Controls */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">

        <div className="flex items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-lg border border-border bg-background">
            <button
              onClick={goPrevWeek}
              className="inline-flex h-8 w-8 items-center justify-center hover:bg-secondary"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="w-px bg-border" />
            <button
              onClick={goNextWeek}
              className="inline-flex h-8 w-8 items-center justify-center hover:bg-secondary"
              aria-label="Next week"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={goToday}
            className="h-8 rounded-lg border border-border bg-background px-3 text-xs font-medium hover:bg-secondary"
          >
            Today
          </button>
          <div className="flex items-baseline gap-2">
            <h2 className="font-display text-xl leading-none">{monthLabel}</h2>
            <span className="text-xs text-muted-foreground">
              {weekStart.getDate()} {MONTH_NAMES[weekStart.getMonth()].slice(0, 3)} – {weekEnd.getDate()} {MONTH_NAMES[weekEnd.getMonth()].slice(0, 3)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={pickerMonth}
            onChange={(e) => setPickerMonth(Number(e.target.value))}
            className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
          >
            {MONTH_NAMES.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <select
            value={pickerYear}
            onChange={(e) => setPickerYear(Number(e.target.value))}
            className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
          >
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <select
            value={
              weeksInPickerMonth.findIndex((w) => sameDay(w, weekStart)) === -1
                ? ""
                : String(weeksInPickerMonth.findIndex((w) => sameDay(w, weekStart)))
            }
            onChange={(e) => {
              const idx = Number(e.target.value);
              if (!Number.isNaN(idx) && weeksInPickerMonth[idx]) {
                setWeekStart(weeksInPickerMonth[idx]);
              }
            }}
            className="h-8 rounded-lg border border-border bg-background px-2 text-xs"
          >
            <option value="">Jump to week…</option>
            {weeksInPickerMonth.map((w, i) => {
              const e = addDays(w, 6);
              return (
                <option key={w.toISOString()} value={i}>
                  Week {i + 1} · {w.getDate()} {MONTH_NAMES[w.getMonth()].slice(0, 3)} – {e.getDate()} {MONTH_NAMES[e.getMonth()].slice(0, 3)}
                </option>
              );
            })}
          </select>
        </div>
      </div>

      {/* Weekly grid */}
      <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
        {/* Header row */}
        <div className="grid border-b border-border/60 bg-secondary/40" style={gridCols}>
          <div />
          {days.map((d, i) => {
            const isToday = sameDay(d, today);
            return (
              <div
                key={i}
                className="flex flex-col items-center gap-0.5 border-l border-border/60 py-1.5"
              >
                <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  {DAY_NAMES[i]}
                </div>
                <div
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                    isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                  }`}
                >
                  {d.getDate()}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hour rows */}
        <div>
          {hours.map((h) => (
            <div
              key={h}
              className="grid border-b border-border/60 last:border-b-0"
              style={gridCols}
            >
              {/* Hour label — right-aligned, sitting on top border like Google Cal */}
              <div className="relative h-12">
                <span className="absolute right-2 top-0 -translate-y-1/2 bg-card px-1 text-[10px] font-medium tabular-nums text-muted-foreground">
                  {h.toString().padStart(2, "0")}:00
                </span>
              </div>
              {days.map((d, di) => {
                const isToday = sameDay(d, today);
                const at = tasks.filter((t) => {
                  const td = new Date(t.scheduledAt);
                  return sameDay(td, d) && td.getHours() === h;
                });
                return (
                  <div
                    key={di}
                    className={`relative h-12 border-l border-border/60 p-0.5 ${
                      isToday ? "bg-primary/[0.03]" : ""
                    }`}
                  >
                    {at.map((t) => {
                      const p = patientById(t.patientId)!;
                      const s = statusMeta[t.status];
                      const dot =
                        s.className.split(" ")[1]?.replace("text-", "bg-") ?? "bg-primary";
                      const isSelected = t.id === selectedId;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => onSelect(t.id)}
                          className={`mb-0.5 flex w-full items-center gap-1 overflow-hidden rounded border px-1.5 py-0.5 text-left text-[10px] leading-tight transition ${
                            isSelected
                              ? "border-primary bg-primary/15 shadow-soft"
                              : "border-border/60 bg-background hover:border-primary/40 hover:bg-secondary"
                          }`}
                          title={`${p.name} · ${t.purpose}`}
                        >
                          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
                          <span className="font-medium tabular-nums shrink-0">{formatTime(t.scheduledAt)}</span>
                          <span className="truncate text-muted-foreground">{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}

            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ---------------- Detail Panel ---------------- */

function DetailPanel({
  task,
  onEdit,
  onCancel,
  onRemoveTag,
  onReassign,
}: {
  task: CallTask | null;
  onEdit: () => void;
  onCancel: () => void;
  onRemoveTag: (tag: CallTag) => void;
  onReassign: (id: string) => void;
}) {
  if (!task) {
    return (
      <div className="grid h-full place-items-center px-6 py-10 text-center text-sm text-muted-foreground">
        Select a call to see the transcript and summary.
      </div>
    );
  }
  const p = patientById(task.patientId)!;
  const s = statusMeta[task.status];
  const StatusIcon = s.icon;
  const isQueued = task.status === "queued";
  const isEditable = task.status === "queued" || task.status === "failed";

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border/60 px-5 py-5">
        <div className="flex items-center gap-3">
          <Avatar name={p.name} size="lg" />
          <div className="min-w-0">
            <div className="truncate font-display text-xl leading-tight">{p.name}</div>
            <div className="text-xs text-muted-foreground">
              {p.age} yrs · NHS {p.nhsNumber}
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between text-xs">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${s.className}`}>
            <StatusIcon className="h-3 w-3" />
            {s.label}
          </span>
          <span className="text-muted-foreground">
            {formatTime(task.scheduledAt)} · {formatDuration(task.durationSec)}
          </span>
        </div>

        {isEditable && (
          <div className="mt-4 grid grid-cols-3 gap-1.5">
            <button
              onClick={onEdit}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium transition hover:bg-secondary"
            >
              <CalendarClock className="h-3.5 w-3.5" /> Reschedule
            </button>
            <button
              onClick={onEdit}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium transition hover:bg-secondary"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit purpose
            </button>
            <button
              onClick={() => {
                if (confirm("Cancel this call?")) onCancel();
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs font-medium text-destructive transition hover:bg-destructive/10"
            >
              <Trash2 className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        )}
        {!isEditable && !isQueued && (
          <div className="mt-4 grid grid-cols-2 gap-1.5">
            <button
              onClick={onEdit}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium transition hover:bg-secondary"
            >
              <PhoneCall className="h-3.5 w-3.5" /> Call again
            </button>
            <button
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-medium transition hover:bg-secondary"
            >
              <UserRound className="h-3.5 w-3.5" /> Assign to me
            </button>
          </div>
        )}
      </div>

      {task.tags && task.tags.length > 0 && (
        <div className="border-b border-border/60 px-5 py-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
            <AlertTriangle className="h-3 w-3" /> Flags detected
          </div>
          <div className="flex flex-wrap gap-1.5">
            {task.tags.map((tag) => {
              const meta = tagMeta[tag];
              return (
                <span
                  key={tag}
                  className={`group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.className}`}
                >
                  {meta.severity !== "info" && <AlertTriangle className="h-3 w-3" />}
                  {meta.label}
                  <button
                    onClick={() => onRemoveTag(tag)}
                    title="Dismiss flag"
                    className="ml-0.5 rounded-full p-0.5 opacity-60 hover:bg-background/40 hover:opacity-100"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="border-b border-border/60 px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Assigned to
          </div>
        </div>
        <AssigneeGrid value={task.assigneeId} onChange={onReassign} compact />
      </div>


      <div className="border-b border-border/60 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Purpose
          </div>
          {isEditable && (
            <button
              onClick={onEdit}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Edit
            </button>
          )}
        </div>
        <div className="mt-1 text-sm">{task.purpose}</div>
      </div>


      {task.summary && (
        <div className="border-b border-border/60 px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              AI Summary
            </div>
            {task.mood && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${moodMeta[task.mood].className}`}
              >
                <Heart className="h-3 w-3" />
                {moodMeta[task.mood].label}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground/90">{task.summary}</p>
          {task.followUp && task.followUp.type !== "none" && (
            <div className="mt-3 rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs">
              <div className="flex items-center gap-1.5 font-medium text-primary">
                <Calendar className="h-3.5 w-3.5" />
                Follow-up suggested
              </div>
              <div className="mt-1 text-foreground/90">
                {task.followUp.type === "in-person" ? "In-person appointment" : "Phone review"}
                {task.followUp.suggestedAt &&
                  ` · ${formatDate(task.followUp.suggestedAt)} at ${formatTime(task.followUp.suggestedAt)}`}
              </div>
              <button className="mt-2 inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:opacity-90">
                Add to calendar
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          Transcript
        </div>
        {task.transcript && task.transcript.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {task.transcript.map((m, i) => (
              <li
                key={i}
                className={`flex ${m.role === "agent" ? "justify-start" : "justify-end"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                    m.role === "agent"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-primary text-primary-foreground"
                  }`}
                >
                  <div className="mb-0.5 text-[10px] uppercase tracking-wider opacity-70">
                    {m.role === "agent" ? "Medley" : p.name.split(" ")[0]}
                  </div>
                  {m.text}
                </div>
              </li>
            ))}
            {task.status === "calling" && (
              <li className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl bg-secondary px-3 py-2.5">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
                </div>
              </li>
            )}
          </ul>
        ) : (
          <div className="text-sm text-muted-foreground">Call hasn't started yet.</div>
        )}
      </div>
    </div>
  );
}

/* ---------------- New Call Dialog ---------------- */

function NewCallDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (t: CallTask) => void;
}) {
  const [patientId, setPatientId] = useState(patients[0].id);
  const [purpose, setPurpose] = useState("");
  const [when, setWhen] = useState("now");
  const [voiceMode, setVoiceMode] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string>("medley");
  const now = new Date();
  const defaultDate = now.toISOString().slice(0, 10);
  const defaultTime = new Date(now.getTime() + 30 * 60_000)
    .toTimeString()
    .slice(0, 5);
  const [customDate, setCustomDate] = useState(defaultDate);
  const [customTime, setCustomTime] = useState(defaultTime);

  const submit = () => {
    if (!purpose.trim()) return;
    let scheduledAt: string;
    if (when === "custom") {
      const d = new Date(`${customDate}T${customTime}`);
      if (isNaN(d.getTime())) return;
      scheduledAt = d.toISOString();
    } else {
      scheduledAt = new Date(
        Date.now() + (when === "now" ? 60_000 : when === "15" ? 15 * 60_000 : 60 * 60_000)
      ).toISOString();
    }
    const isAgent = assigneeById(assigneeId)?.kind === "agent";
    onCreate({
      id: `t${Date.now()}`,
      patientId,
      purpose: purpose.trim(),
      scheduledAt,
      assigneeId,
      status: when === "now" && isAgent ? "calling" : "queued",
      transcript: when === "now" && isAgent ? [{ role: "agent", text: "Dialling…" }] : undefined,
    });
    onClose();
  };


  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-foreground/25 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="font-medium">Assign a call to Medley</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <button
            onClick={() => setVoiceMode(!voiceMode)}
            className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${
              voiceMode
                ? "border-primary/40 bg-primary/5"
                : "border-border bg-background hover:bg-secondary/40"
            }`}
          >
            <div className={`grid h-10 w-10 place-items-center rounded-full ${voiceMode ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}>
              <Mic className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {voiceMode ? "Listening… speak your instruction" : "Dictate the task"}
              </div>
              <div className="text-xs text-muted-foreground">
                "Call Edward, rebook his cardiology, ask about ankle swelling."
              </div>
            </div>
          </button>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Patient
            </label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.age} · {p.condition}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Assign to
            </label>
            <AssigneeGrid value={assigneeId} onChange={setAssigneeId} compact />

          </div>


          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Purpose of the call
            </label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              placeholder="e.g. Rebook missed cardiology appointment and check for chest pain or breathlessness."
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              When
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { id: "now", label: "Call now" },
                { id: "15", label: "In 15 min" },
                { id: "60", label: "In 1 hour" },
                { id: "custom", label: "Pick date & time" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => setWhen(opt.id)}
                  className={`rounded-lg border px-3 py-2 text-sm transition ${
                    when === opt.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background hover:bg-secondary/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {when === "custom" && (
              <div className="mt-3 grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-border/70 bg-secondary/30 p-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Date
                  </label>
                  <input
                    type="date"
                    value={customDate}
                    min={defaultDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    Time
                  </label>
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <p className="col-span-2 text-[11px] text-muted-foreground">
                  Medley will call the patient at this time.
                </p>
              </div>
            )}
          </div>

        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-secondary/30 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!purpose.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90 disabled:opacity-40"
          >
            <PhoneCall className="h-4 w-4" />
            Assign to Medley
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Avatar ---------------- */

function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");
  const cls =
    size === "lg" ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs";
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full bg-secondary font-semibold text-secondary-foreground ${cls}`}
    >
      {initials}
    </div>
  );
}

/* ---------------- Theme Toggle ---------------- */

function ThemeToggle() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem("medley-theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", dark);
    localStorage.setItem("medley-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <button
      onClick={() => setDark((d) => !d)}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      className="inline-flex items-center justify-center rounded-lg border border-border bg-background p-2 text-sm font-medium transition hover:bg-secondary"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}


/* ---------------- Edit Call Dialog ---------------- */

function EditCallDialog({
  task,
  onClose,
  onSave,
}: {
  task: CallTask;
  onClose: () => void;
  onSave: (patch: Partial<CallTask>) => void;
}) {
  const [purpose, setPurpose] = useState(task.purpose);
  const [patientId, setPatientId] = useState(task.patientId);
  const [assigneeId, setAssigneeId] = useState(task.assigneeId);
  const d = new Date(task.scheduledAt);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const [date, setDate] = useState(
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  );
  const [time, setTime] = useState(`${pad(d.getHours())}:${pad(d.getMinutes())}`);

  const save = () => {
    if (!purpose.trim()) return;
    const scheduled = new Date(`${date}T${time}`);
    if (isNaN(scheduled.getTime())) return;
    onSave({
      purpose: purpose.trim(),
      patientId,
      assigneeId,
      scheduledAt: scheduled.toISOString(),
      status: task.status === "failed" ? "queued" : task.status,
    });
  };

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-foreground/25 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            <span className="font-medium">Edit call</span>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Patient
            </label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            >
              {patients.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.age} · {p.condition}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Purpose of the call
            </label>
            <textarea
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Assigned to
            </label>
            <AssigneeGrid value={assigneeId} onChange={setAssigneeId} compact />
          </div>


          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-secondary/30 p-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-secondary/30 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={!purpose.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-soft transition hover:opacity-90 disabled:opacity-40"
          >
            <CalendarClock className="h-4 w-4" />
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Assignee helpers ---------------- */

function assigneeKindStyles(kind: Assignee["kind"] | undefined) {
  switch (kind) {
    case "agent":
      return { badge: "bg-primary/10 text-primary border-primary/30", dot: "bg-primary" };
    case "doctor":
      return { badge: "bg-success/10 text-success border-success/30", dot: "bg-success" };
    case "nurse":
      return { badge: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30", dot: "bg-sky-500" };
    case "pharmacist":
      return { badge: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30", dot: "bg-violet-500" };
    case "physio":
      return { badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30", dot: "bg-amber-500" };
    case "mental-health":
      return { badge: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30", dot: "bg-rose-500" };
    case "social":
      return { badge: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/30", dot: "bg-teal-500" };
    case "admin":
      return { badge: "bg-secondary text-secondary-foreground border-border", dot: "bg-muted-foreground" };
    default:
      return { badge: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };
  }
}


function AssigneeChip({ assignee }: { assignee: Assignee | undefined }) {
  const styles = assigneeKindStyles(assignee?.kind);
  const isAgent = assignee?.kind === "agent";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${styles.badge}`}
      title={assignee ? `${assignee.name} · ${assignee.role}` : "Unassigned"}
    >
      {isAgent ? (
        <PhoneCall className="h-2.5 w-2.5" />
      ) : (
        <UserRound className="h-2.5 w-2.5" />
      )}
      {assignee?.name ?? "Unassigned"}
    </span>
  );
}

function AssigneeGrid({
  value,
  onChange,
  compact = false,
}: {
  value: string;
  onChange: (id: string) => void;
  compact?: boolean;
}) {
  const groups = assignees.reduce<Record<string, Assignee[]>>((acc, a) => {
    (acc[a.discipline] ||= []).push(a);
    return acc;
  }, {});
  const order = ["GP", "AI", "Nursing", "Pharmacy", "Physiotherapy", "Mental health", "Social prescribing", "Admin"];
  const disciplines = order.filter((d) => groups[d]);

  if (compact) {
    const humansByDiscipline = disciplines
      .filter((d) => d !== "AI")
      .map((d) => [d, groups[d]] as const);
    const agent = assignees.find((a) => a.id === "medley");
    const isAgent = assignees.find((a) => a.id === value)?.kind === "agent";
    return (
      <div className="flex items-center gap-1.5">
        <select
          value={isAgent ? "" : value}
          onChange={(e) => e.target.value && onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
        >
          {isAgent && <option value="">Assign to a person…</option>}
          {humansByDiscipline.map(([d, list]) => (
            <optgroup key={d} label={d}>
              {list.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {a.role}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {agent && (
          <button
            type="button"
            onClick={() => onChange(agent.id)}
            className={`inline-flex h-[30px] w-[150px] shrink-0 items-center justify-center gap-1 rounded-lg border px-2 text-[11px] font-medium transition ${
              value === agent.id
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background hover:bg-secondary/40"
            }`}
            title="Assign to Medley AI voice agent"
          >
            <PhoneCall className="h-3 w-3" />
            Assign to Medley AI
          </button>
        )}

      </div>
    );
  }


  return (
    <div className="space-y-3">
      {disciplines.map((d) => (
        <div key={d}>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {d}
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {groups[d].map((a) => {
              const active = value === a.id;
              const styles = assigneeKindStyles(a.kind);
              return (
                <button
                  key={a.id}
                  onClick={() => onChange(a.id)}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                    active
                      ? "border-primary bg-primary/5"
                      : "border-border bg-background hover:bg-secondary/40"
                  }`}
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${styles.dot}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{a.name}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {a.role}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
