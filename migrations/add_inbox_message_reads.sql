-- Per-user read state for escalation inbox messages (remediation_activity rows)
create table if not exists inbox_message_reads (
  user_id    text not null,
  message_id uuid not null references remediation_activity(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (user_id, message_id)
);

create index if not exists inbox_message_reads_user_idx
  on inbox_message_reads (user_id, read_at desc);

grant all on public.inbox_message_reads to service_role;
