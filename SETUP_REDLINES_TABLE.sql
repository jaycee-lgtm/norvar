-- Run in Supabase SQL Editor

create table if not exists redlines (
  id             uuid primary key default gen_random_uuid(),
  user_id        text not null,
  agent          text not null check (agent in ('cassius', 'nora')),
  agreement_type text,
  governing_law  text,
  overall_status text,
  result         jsonb not null,
  followups      jsonb not null default '{}'::jsonb,
  document_id    uuid references documents(id) on delete set null,
  created_at     timestamptz default now()
);

create index if not exists redlines_user_id_idx
  on redlines (user_id, created_at desc);

-- If the table already exists:
alter table redlines add column if not exists followups jsonb not null default '{}'::jsonb;

grant all on public.redlines to service_role;
