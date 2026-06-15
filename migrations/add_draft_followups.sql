-- Add follow-up threads to drafted agreements
alter table drafted_agreements
  add column if not exists followups jsonb default '{}'::jsonb;
