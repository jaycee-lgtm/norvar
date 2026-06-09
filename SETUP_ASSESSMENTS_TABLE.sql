-- Run this in Supabase SQL Editor
-- Dashboard > SQL Editor > New Query > paste > Run

create table if not exists assessments (
    id            uuid primary key default gen_random_uuid(),
    user_id       text not null,
    title         text,
    description   text not null,
    result        jsonb not null,
    messages      jsonb not null default '[]'::jsonb,
    risk_tier     text,
    risk_score    integer,
    domains       text[],
    jurisdictions text[],
    created_at    timestamptz default now()
);

-- Add columns if upgrading from previous schema
alter table assessments add column if not exists title    text;
alter table assessments add column if not exists messages jsonb not null default '[]'::jsonb;

drop index if exists assessments_created_at_idx;
drop index if exists assessments_user_id_idx;
create index if not exists assessments_user_id_idx
    on assessments (user_id, created_at desc);

grant all on public.assessments to service_role;
