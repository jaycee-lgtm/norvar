-- Pending OAuth sessions for monitoring connector setup (GitHub App install flow)

create table if not exists monitoring_oauth_sessions (
  id           uuid primary key default gen_random_uuid(),
  org_id       text not null,
  user_id      text not null,
  provider     text not null default 'github' check (provider in ('github', 'gitlab', 'jira')),
  state_token  text not null unique,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  created_at   timestamptz default now()
);

create index if not exists monitoring_oauth_sessions_org_idx
  on monitoring_oauth_sessions (org_id, provider, expires_at desc);
