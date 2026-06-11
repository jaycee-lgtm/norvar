-- Norvar v3 schema migration
-- Run in Supabase SQL Editor after existing v2 schema

-- ─── 1. ASSESSMENT NUMBERING ─────────────────────────────────────────────────
-- Add number column and sequence to assessments table

alter table assessments add column if not exists assessment_number text;
alter table assessments add column if not exists assigned_to       text[]; -- Clerk user IDs
alter table assessments add column if not exists folder_id         uuid;
alter table assessments add column if not exists tags              text[] default '{}';

-- Sequence for numbering (NRV-YYYY-####)
create sequence if not exists assessment_seq;

-- Function to generate assessment number on insert
create or replace function generate_assessment_number()
returns trigger language plpgsql as $$
begin
  if new.assessment_number is null then
    new.assessment_number := 'NRV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('assessment_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists assessment_number_trigger on assessments;
create trigger assessment_number_trigger
  before insert on assessments
  for each row execute function generate_assessment_number();


-- ─── 2. PROJECT FOLDERS ──────────────────────────────────────────────────────

create table if not exists project_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,
  name        text not null,
  description text,
  color       text default '#8b1a1a',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists folders_user_id_idx on project_folders (user_id, created_at desc);
grant all on public.project_folders to service_role;
grant select, insert, update, delete on public.project_folders to authenticated;


-- ─── 3. DOCUMENT REPOSITORY ──────────────────────────────────────────────────

create table if not exists documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       text not null,
  folder_id     uuid references project_folders(id) on delete set null,
  name          text not null,
  description   text,
  file_path     text not null,   -- Supabase Storage path
  file_size     integer,
  file_type     text,            -- 'pdf', 'docx', 'txt', etc.
  status        text default 'active' check (status in ('active', 'archived', 'deleted')),
  tags          text[] default '{}',
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists documents_user_id_idx  on documents (user_id, created_at desc);
create index if not exists documents_folder_id_idx on documents (folder_id);
grant all on public.documents to service_role;
grant select, insert, update, delete on public.documents to authenticated;


-- ─── 4. FOLDER ITEMS (link table) ───────────────────────────────────────────
-- Links assessments, documents, and chats to folders

create table if not exists folder_items (
  id            uuid primary key default gen_random_uuid(),
  folder_id     uuid not null references project_folders(id) on delete cascade,
  item_type     text not null check (item_type in ('assessment', 'document', 'chat')),
  item_id       uuid not null,
  added_at      timestamptz default now()
);

create index if not exists folder_items_folder_idx on folder_items (folder_id);
create unique index if not exists folder_items_unique_idx on folder_items (folder_id, item_type, item_id);
grant all on public.folder_items to service_role;
grant select, insert, delete on public.folder_items to authenticated;


-- ─── 5. REMEDIATION QUEUE ────────────────────────────────────────────────────

create table if not exists remediation_items (
  id                uuid primary key default gen_random_uuid(),
  assessment_id     uuid not null references assessments(id) on delete cascade,
  assessment_number text,

  -- Gap details (copied from assessment JSON at time of queuing)
  gap_title         text not null,
  gap_severity      text not null check (gap_severity in ('critical', 'high', 'medium', 'low')),
  gap_domain        text not null,
  gap_detail        text,
  gap_frameworks    text[] default '{}',
  remediation_steps text,

  -- Assignment — multiple users can be assigned simultaneously
  assigned_to       text[] default '{}',  -- Clerk user IDs
  created_by        text not null,         -- Clerk user ID who queued this

  -- Status tracking
  status            text default 'open' check (
                      status in ('open', 'in_progress', 'escalated', 'resolved', 'wont_fix')
                    ),
  escalated_to      text,
  escalation_email  text,
  escalation_recipient_name text,
  escalation_recipient_user_id text,
  escalation_role   text,
  escalation_question text,
  escalated_at      timestamptz,
  escalation_status text check (
                      escalation_status is null or escalation_status in (
                        'sent', 'viewed', 'in_review', 'responded', 'closed'
                      )
                    ),
  escalation_token  text unique,
  last_notified_at  timestamptz,
  assignee_meta     jsonb not null default '{}'::jsonb,
  escalation_note   text,
  due_date          timestamptz,
  resolved_at       timestamptz,
  resolution_note   text,

  -- Per-gap remediation chat (Claude thread)
  messages          jsonb not null default '[]'::jsonb,
  gap_key           text,
  project_title     text,

  -- Audit
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists remediation_assessment_idx on remediation_items (assessment_id);
create index if not exists remediation_assigned_idx   on remediation_items using gin (assigned_to);
create index if not exists remediation_status_idx     on remediation_items (status, created_at desc);
grant all on public.remediation_items to service_role;
grant select, insert, update on public.remediation_items to authenticated;

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists remediation_updated_at on remediation_items;
create trigger remediation_updated_at
  before update on remediation_items
  for each row execute function update_updated_at();

drop trigger if exists documents_updated_at on documents;
create trigger documents_updated_at
  before update on documents
  for each row execute function update_updated_at();

drop trigger if exists folders_updated_at on project_folders;
create trigger folders_updated_at
  before update on project_folders
  for each row execute function update_updated_at();


-- ─── 6. REMEDIATION ACTIVITY LOG ────────────────────────────────────────────

create table if not exists remediation_activity (
  id                uuid primary key default gen_random_uuid(),
  remediation_id    uuid not null references remediation_items(id) on delete cascade,
  user_id           text not null,
  action            text not null,  -- 'opened', 'assigned', 'status_changed', 'escalated', 'resolved', 'note_added'
  detail            text,
  created_at        timestamptz default now()
);

create index if not exists remediation_activity_item_idx on remediation_activity (remediation_id, created_at desc);
grant all on public.remediation_activity to service_role;
grant select, insert on public.remediation_activity to authenticated;


-- ─── 7. STORAGE BUCKET ───────────────────────────────────────────────────────
--
-- Norvar uses Clerk for auth and the Supabase SERVICE ROLE in API routes.
-- Access control is enforced in /api/documents (Clerk userId), not via auth.uid().
-- You only need a private bucket named "documents" — no auth.uid() RLS required.
--
-- Path convention (set by the app): {clerk_user_id}/{document_id}/{filename}
--
-- ── Option A: Supabase Dashboard (recommended) ──
-- 1. Open your project → Storage (left sidebar)
-- 2. Click "New bucket"
-- 3. Name: documents
-- 4. Public bucket: OFF (keep private)
-- 5. Click "Create bucket"
-- Done. No storage policies needed for the current app architecture.
--
-- ── Option B: SQL Editor ──
-- Run once in Supabase → SQL Editor:

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  52428800,  -- 50 MB max per file (adjust if needed)
  null       -- allow all MIME types; or e.g. array['application/pdf','text/plain']
)
on conflict (id) do nothing;

-- ── Verify ──
-- After creating the bucket, test from the app:
-- 1. Sign in → /documents → Upload a .txt or .pdf
-- 2. In Storage → documents, you should see: {your_clerk_user_id}/{uuid}/{filename}
-- 3. If upload fails with "Bucket not found", the bucket name must be exactly "documents"


-- ─── 8. GAP CHAT (upgrade path) ─────────────────────────────────────────────

alter table remediation_items add column if not exists messages jsonb not null default '[]'::jsonb;
alter table remediation_items add column if not exists gap_key text;
alter table remediation_items add column if not exists project_title text;
alter table assessments add column if not exists gap_chats jsonb not null default '{}'::jsonb;
