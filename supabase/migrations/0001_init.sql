-- Doctor Task Copilot: initial schema
-- Single-doctor demo, no auth/RLS needed for the hackathon.

create table patients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dob date,
  phone text,
  last_seen_at timestamptz,
  status text not null default 'active' check (status in ('active', 'archived')),
  notes text,
  vaccinations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  instruction_raw text not null,
  questions jsonb not null default '[]'::jsonb,
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  urgency text not null default 'normal' check (urgency in ('low', 'normal', 'high')),
  created_at timestamptz not null default now()
);

create table calls (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id),
  started_at timestamptz,
  ended_at timestamptz,
  transcript text,
  extracted_answers jsonb not null default '{}'::jsonb,
  mood_score numeric,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id),
  task_id uuid references tasks(id),
  calendar_event_id text,
  start_at timestamptz not null,
  end_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter publication supabase_realtime add table tasks;
alter publication supabase_realtime add table calls;

-- Tables created this way get only REFERENCES/TRIGGER/TRUNCATE by default,
-- which makes every PostgREST request fail with a permission error — including
-- ones made with the service role. Grant DML explicitly.
grant select, insert, update, delete on all tables in schema public to service_role;

-- anon is the browser's identity: dashboard reads (and realtime) only.
-- All writes go through Edge Functions under the service role.
grant select on all tables in schema public to anon;
grant select on all tables in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant select on tables to anon, authenticated;
