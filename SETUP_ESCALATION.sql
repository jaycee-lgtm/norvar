-- Escalation tracking columns for remediation_items
-- Run in Supabase SQL Editor

alter table remediation_items drop constraint if exists remediation_items_escalated_to_check;

alter table remediation_items add column if not exists escalation_email text;
alter table remediation_items add column if not exists escalation_recipient_name text;
alter table remediation_items add column if not exists escalation_recipient_user_id text;
alter table remediation_items add column if not exists escalation_role text;
alter table remediation_items add column if not exists escalation_question text;
alter table remediation_items add column if not exists escalated_at timestamptz;
alter table remediation_items add column if not exists escalation_status text
  check (escalation_status is null or escalation_status in ('sent', 'viewed', 'in_review', 'responded', 'closed'));
alter table remediation_items add column if not exists escalation_token text unique;
alter table remediation_items add column if not exists last_notified_at timestamptz;
alter table remediation_items add column if not exists assignee_meta jsonb not null default '{}'::jsonb;

create index if not exists remediation_escalation_token_idx on remediation_items (escalation_token)
  where escalation_token is not null;
