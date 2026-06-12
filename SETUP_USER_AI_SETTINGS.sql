-- Per-user AI preferences (voice, defaults, etc.)
-- Run in Supabase SQL editor.

create table if not exists user_ai_settings (
  user_id    text primary key,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists user_ai_settings_updated_idx
  on user_ai_settings (updated_at desc);
