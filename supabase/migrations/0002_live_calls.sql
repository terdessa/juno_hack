-- Brings the migration history back in line with the database, and adds what
-- the real call loop needs.
--
-- 0001 was applied and then the live schema was edited by hand as the dashboard
-- took shape: the columns the code actually queries (patients.condition,
-- tasks.purpose, calls.summary, and friends) exist in the project but appear in
-- no migration. Everything below is written to be safe to re-run, so it states
-- the truth about the live schema as much as it changes it.

-- --- columns the dashboard already reads -----------------------------------

alter table patients add column if not exists nhs_number text;
alter table patients add column if not exists alt_phone text;
alter table patients add column if not exists email text;
alter table patients add column if not exists address text;
alter table patients add column if not exists preferred_contact text;
alter table patients add column if not exists next_of_kin jsonb;
alter table patients add column if not exists condition text;
alter table patients add column if not exists medications jsonb not null default '[]'::jsonb;

alter table tasks add column if not exists purpose text;
alter table tasks add column if not exists assignee_id text not null default 'medley';

alter table calls add column if not exists summary text;
alter table calls add column if not exists mood text;
alter table calls add column if not exists tags jsonb;
alter table calls add column if not exists follow_up_type text;

-- The dashboard renders the transcript as a list of turns, so it is jsonb here
-- rather than the flat text 0001 declared.
alter table calls alter column transcript type jsonb using
  case
    when transcript is null then null
    when jsonb_typeof(transcript::jsonb) is not null then transcript::jsonb
  end;

-- --- statuses --------------------------------------------------------------
--
-- 0001's vocabulary (pending/in_progress/done) never matched what got built.
-- A task is queued until we dial, calling while the line is open, and then
-- either completed or failed. Named to match the dashboard's own union so a
-- status can travel from Postgres to the screen without translation.

alter table tasks drop constraint if exists tasks_status_check;
update tasks set status = 'queued' where status = 'pending';
update tasks set status = 'calling' where status = 'in_progress';
update tasks set status = 'completed' where status = 'done';
alter table tasks add constraint tasks_status_check
  check (status in ('queued', 'calling', 'completed', 'failed'));
alter table tasks alter column status set default 'queued';

alter table calls drop constraint if exists calls_status_check;
update calls set status = 'calling' where status = 'in_progress';
alter table calls add constraint calls_status_check
  check (status in ('calling', 'completed', 'failed'));
alter table calls alter column status set default 'calling';

-- --- correlating a webhook with the call that caused it ---------------------
--
-- ElevenLabs answers the dispatch with a conversation id and later posts the
-- finished transcript quoting the same id. Storing it is what lets the receiver
-- find the right row, and the unique index is what makes a redelivered webhook
-- update that row instead of inserting a second one.

alter table calls add column if not exists elevenlabs_conversation_id text;
create unique index if not exists calls_elevenlabs_conversation_id_key
  on calls (elevenlabs_conversation_id)
  where elevenlabs_conversation_id is not null;

-- Why a call failed, in the words of whatever refused it. Shown to the doctor,
-- so it has to survive the trip rather than only reaching the function logs.
alter table calls add column if not exists error text;

-- The scheduler asks one question every minute — which queued tasks are due —
-- and this is the index that answers it without reading the table.
create index if not exists tasks_due_queued_idx on tasks (due_at) where status = 'queued';

-- --- grants ----------------------------------------------------------------
-- Re-stated because columns added later don't inherit 0001's grants.

grant select, insert, update, delete on all tables in schema public to service_role;
grant select on all tables in schema public to anon, authenticated;
