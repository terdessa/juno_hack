export type CallStatus = "queued" | "calling" | "completed" | "failed";
export type Mood = "positive" | "neutral" | "low" | "distressed";
export type CallTag =
  | "depression-detected"
  | "anxiety-detected"
  | "safeguarding-concern"
  | "reschedule-requested"
  | "human-call-requested"
  | "medication-issue"
  | "no-answer";

export interface Patient {
  id: string;
  name: string;
  age: number;
  nhsNumber: string;
  phone: string;
  altPhone?: string;
  email?: string;
  address?: string;
  preferredContact?: string;
  nextOfKin?: { name: string; relation: string; phone: string };
  condition: string;
  lastVisit: string; // ISO
  vaccinations: string[];
  medications: string[];
  notes: string;
}


export type AssigneeKind = "doctor" | "nurse" | "pharmacist" | "physio" | "mental-health" | "social" | "admin" | "agent";
export interface Assignee {
  id: string;
  name: string;
  role: string;
  kind: AssigneeKind;
  discipline: string; // MDT grouping label
}

export const assignees: Assignee[] = [
  // You & AI
  { id: "me", name: "Dr Hartley", role: "You · GP", kind: "doctor", discipline: "GP" },
  { id: "medley", name: "Medley AI", role: "Voice agent", kind: "agent", discipline: "AI" },
  { id: "medley-triage", name: "Medley Triage", role: "AI · triage", kind: "agent", discipline: "AI" },
  // Doctors
  { id: "dr-okafor", name: "Dr Okafor", role: "GP colleague", kind: "doctor", discipline: "GP" },
  { id: "dr-chen", name: "Dr Chen", role: "GP registrar", kind: "doctor", discipline: "GP" },
  // Nursing
  { id: "nurse-shah", name: "Priya Shah", role: "Practice nurse", kind: "nurse", discipline: "Nursing" },
  { id: "nurse-adeyemi", name: "Tola Adeyemi", role: "District nurse", kind: "nurse", discipline: "Nursing" },
  // Pharmacy
  { id: "pharm-patel", name: "Rohan Patel", role: "Clinical pharmacist", kind: "pharmacist", discipline: "Pharmacy" },
  // Physiotherapy
  { id: "physio-novak", name: "Ana Novak", role: "Physiotherapist", kind: "physio", discipline: "Physiotherapy" },
  // Mental health
  { id: "mh-oconnor", name: "Sam O'Connor", role: "Mental health practitioner", kind: "mental-health", discipline: "Mental health" },
  // Social prescribing
  { id: "social-diallo", name: "Awa Diallo", role: "Social prescriber", kind: "social", discipline: "Social prescribing" },
  // Admin
  { id: "recept-lee", name: "Jamie Lee", role: "Reception", kind: "admin", discipline: "Admin" },
];


export const assigneeById = (id: string) => assignees.find((a) => a.id === id);

export interface CallTask {
  id: string;
  patientId: string;
  purpose: string;
  /** What the voice agent asks aloud. Drafted by Medley from the record. */
  questions?: string[];
  scheduledAt: string; // ISO
  status: CallStatus;
  assigneeId: string;
  durationSec?: number;
  transcript?: { role: "agent" | "patient"; text: string }[];
  summary?: string;
  mood?: Mood;
  followUp?: { type: "in-person" | "phone" | "none"; suggestedAt?: string };
  tags?: CallTag[];
}

export const patients: Patient[] = [
  {
    id: "p1",
    name: "Margaret Whitfield",
    age: 78,
    nhsNumber: "485 777 3456",
    phone: "+44 7700 900123",
    altPhone: "+44 20 7946 0011 (landline)",
    email: "m.whitfield@example.co.uk",
    address: "14 Elm Court, Hackney, London E8 3PQ",
    preferredContact: "Mobile · mornings 9am–11am",
    nextOfKin: { name: "Sarah Whitfield", relation: "Daughter", phone: "+44 7700 900321" },
    condition: "Post-op knee replacement",
    lastVisit: "2026-07-11",
    vaccinations: ["Flu 2025", "COVID-19 Booster 2025", "Pneumococcal 2023"],
    medications: ["Paracetamol 500mg", "Amlodipine 5mg"],
    notes: "Lives alone. Daughter visits Sundays. Prefers morning calls.",
  },
  {
    id: "p2",
    name: "Nikita Volkov",
    age: 34,
    nhsNumber: "485 221 8890",
    phone: "+44 7700 900456",
    email: "n.volkov@example.com",
    address: "Flat 3, 88 Rivington St, London EC2A 3AY",
    preferredContact: "Mobile · after 6pm (shift worker)",
    nextOfKin: { name: "Elena Volkov", relation: "Partner", phone: "+44 7700 900654" },
    condition: "Chronic migraine review",
    lastVisit: "2026-07-18",
    vaccinations: ["COVID-19 2024", "Tetanus 2021"],
    medications: ["Sumatriptan 50mg PRN"],
    notes: "Works shifts. Best reached after 6pm.",
  },
  {
    id: "p3",
    name: "Aisha Patel",
    age: 52,
    nhsNumber: "485 903 1122",
    phone: "+44 7700 900789",
    altPhone: "+44 20 7946 0022 (work)",
    email: "a.patel@example.co.uk",
    address: "27 Beechwood Ave, Ealing, London W5 3DY",
    preferredContact: "Mobile · lunchtime 12pm–2pm",
    nextOfKin: { name: "Raj Patel", relation: "Husband", phone: "+44 7700 900987" },
    condition: "Type 2 Diabetes follow-up",
    lastVisit: "2026-07-02",
    vaccinations: ["Flu 2025", "COVID-19 Booster 2025"],
    medications: ["Metformin 1g", "Atorvastatin 20mg"],
    notes: "HbA1c trending up. Discuss diet & activity.",
  },
  {
    id: "p4",
    name: "James O'Connor",
    age: 67,
    nhsNumber: "485 554 9021",
    phone: "+44 7700 900234",
    altPhone: "+44 20 7946 0033 (home)",
    email: "j.oconnor@example.co.uk",
    address: "5 Priory Lane, Richmond, London TW10 5HH",
    preferredContact: "Landline · afternoons",
    nextOfKin: { name: "Mary O'Connor", relation: "Wife", phone: "+44 7700 900432" },
    condition: "Hypertension monitoring",
    lastVisit: "2026-06-28",
    vaccinations: ["Flu 2025", "Shingles 2024"],
    medications: ["Ramipril 10mg", "Bisoprolol 2.5mg"],
    notes: "Home BP readings inconsistent.",
  },
  {
    id: "p5",
    name: "Fatima Al-Rashid",
    age: 29,
    nhsNumber: "485 667 4410",
    phone: "+44 7700 900567",
    email: "f.alrashid@example.com",
    address: "42 Camberwell Grove, London SE5 8JA",
    preferredContact: "Mobile · any time, SMS if no answer",
    nextOfKin: { name: "Omar Al-Rashid", relation: "Husband", phone: "+44 7700 900765" },
    condition: "Antenatal check-in",
    lastVisit: "2026-07-20",
    vaccinations: ["Whooping cough 2026", "Flu 2025"],
    medications: ["Folic acid 400mcg", "Vitamin D 10mcg"],
    notes: "28 weeks. First pregnancy.",
  },
  {
    id: "p6",
    name: "Edward Thompson",
    age: 84,
    nhsNumber: "485 118 7733",
    phone: "+44 7700 900890",
    altPhone: "+44 20 7946 0044 (care home reception)",
    email: "care@oakwoodhouse.example.co.uk",
    address: "Oakwood Care Home, 3 Oak Ln, Barnet, London EN5 2BJ",
    preferredContact: "Care home reception first · then mobile",
    nextOfKin: { name: "Helen Thompson", relation: "Daughter", phone: "+44 7700 900098" },
    condition: "Missed appointment — cardiology",
    lastVisit: "2026-06-15",
    vaccinations: ["Flu 2025", "COVID-19 Booster 2025", "Pneumococcal 2022"],
    medications: ["Warfarin 3mg", "Furosemide 40mg"],
    notes: "No-show last Tuesday. Please rebook.",
  },
];


export const initialTasks: CallTask[] = [
  {
    id: "t1",
    patientId: "p6",
    purpose: "Rebook missed cardiology appointment & check symptoms",
    scheduledAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    status: "completed", assigneeId: "medley",
    durationSec: 218,
    mood: "neutral",
    summary:
      "Edward apologised for missing Tuesday. Reports mild ankle swelling but no chest pain. Requested an in-person review. Booked for Weds 30 Jul, 10:20am.",
    followUp: { type: "in-person", suggestedAt: "2026-07-30T10:20:00Z" },
    transcript: [
      { role: "agent", text: "Hello Edward, this is Medley calling from Dr Hartley's practice. Is now an okay time?" },
      { role: "patient", text: "Yes, sorry I missed Tuesday, my daughter couldn't drive me." },
      { role: "agent", text: "No problem at all. How have you been feeling — any chest pain or breathlessness?" },
      { role: "patient", text: "No chest pain. My ankles have been a bit puffy though." },
      { role: "agent", text: "Understood. I'll get that noted and offer you the next available slot with Dr Hartley." },
    ],
    tags: ["reschedule-requested", "human-call-requested"],
  },
  {
    id: "t2",
    patientId: "p3",
    purpose: "Check blood glucose readings & lifestyle review",
    scheduledAt: new Date(Date.now() + 3 * 60_000).toISOString(),
    status: "calling", assigneeId: "medley",
    transcript: [
      { role: "agent", text: "Hello Aisha, this is Medley from the surgery — do you have a moment?" },
      { role: "patient", text: "Yes, go ahead." },
    ],
  },
  {
    id: "t3",
    patientId: "p1",
    purpose: "Post-op recovery check-in (2 weeks)",
    scheduledAt: new Date(Date.now() + 45 * 60_000).toISOString(),
    status: "queued", assigneeId: "dr-okafor",
  },
  {
    id: "t4",
    patientId: "p2",
    purpose: "Migraine diary review before repeat prescription",
    scheduledAt: new Date(Date.now() + 2 * 3600_000).toISOString(),
    status: "queued", assigneeId: "nurse-shah",
  },
  {
    id: "t5",
    patientId: "p4",
    purpose: "Home BP readings & medication tolerance",
    scheduledAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    status: "completed", assigneeId: "me",
    durationSec: 164,
    mood: "positive",
    summary:
      "James reports BP averaging 128/82 over past week. No side effects from Ramipril. Happy to continue. No follow-up needed.",
    followUp: { type: "none" },
    transcript: [
      { role: "agent", text: "Morning James, quick check on your blood pressure readings — how have they been?" },
      { role: "patient", text: "Pretty good actually, mostly around 128 over 82." },
      { role: "agent", text: "Excellent. Any dizziness or cough from the Ramipril?" },
      { role: "patient", text: "None at all." },
    ],
  },
  {
    id: "t6",
    patientId: "p5",
    purpose: "Antenatal wellbeing call — 28 week check",
    scheduledAt: new Date(Date.now() - 26 * 3600_000).toISOString(),
    status: "completed", assigneeId: "medley",
    durationSec: 302,
    mood: "low",
    summary:
      "Fatima described feeling anxious about the birth and reported poor sleep. Baby movements normal. Recommend midwife catch-up and consider signposting to perinatal mental health.",
    followUp: { type: "in-person", suggestedAt: "2026-07-28T14:00:00Z" },
    transcript: [
      { role: "agent", text: "Hi Fatima, just checking in on how you're feeling at 28 weeks." },
      { role: "patient", text: "Honestly, I haven't been sleeping well. I'm quite worried about everything." },
      { role: "agent", text: "That's really common but let's make sure you have support. I'll flag this for your midwife." },
    ],
    tags: ["depression-detected", "anxiety-detected"],
  },
];

export const patientById = (id: string) => patients.find((p) => p.id === id);
