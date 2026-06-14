-- Run in Supabase SQL Editor
-- Stores Nora chat transcript when user switches to Cassius mid-conversation.

alter table assessments add column if not exists prior_nora_chat jsonb not null default '[]'::jsonb;
