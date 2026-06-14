-- Inbox folders: archive + soft-delete with 90-day retention (see src/lib/inbox.ts)
alter table remediation_activity
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz;

create index if not exists remediation_activity_inbox_deleted_idx
  on remediation_activity (deleted_at)
  where deleted_at is not null;
