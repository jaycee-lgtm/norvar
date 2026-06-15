-- Norvar — Drafted agreements table
-- Run in Supabase SQL Editor

create table if not exists drafted_agreements (
  id              uuid primary key default gen_random_uuid(),
  user_id         text not null,
  agent           text not null check (agent in ('cassius', 'nora')),
  agreement_type  text,
  governing_law   text,
  result          jsonb not null,
  document_id     uuid references documents(id) on delete set null,
  folder_id       uuid references project_folders(id) on delete set null,
  created_at      timestamptz default now()
);

create index if not exists drafted_agreements_user_idx
  on drafted_agreements (user_id, created_at desc);

grant all on public.drafted_agreements to service_role;
grant select, insert, update, delete on public.drafted_agreements to authenticated;
