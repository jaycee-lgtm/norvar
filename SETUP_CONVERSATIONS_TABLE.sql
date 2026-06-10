-- Run this in Supabase SQL Editor
-- Dashboard > SQL Editor > New Query > paste > Run

create table if not exists conversations (
    id         uuid primary key default gen_random_uuid(),
    user_id    text not null,
    title      text,
    messages   jsonb not null default '[]'::jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

create index if not exists conversations_user_id_idx
    on conversations (user_id, updated_at desc);

grant all on public.conversations to service_role;
