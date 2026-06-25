-- Norvar Monitoring Agent schema
-- Run in Supabase SQL Editor

-- ─── ORG MONITORING CONFIG ───────────────────────────────────────────────────
-- Per-org settings: who gets notified for each domain, connector credentials

create table if not exists org_monitoring_config (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  text not null unique,

  -- Domain compliance contacts — configurable per org
  privacy_contact_user_id        text,
  privacy_contact_email          text,
  ai_governance_contact_user_id  text,
  ai_governance_contact_email    text,
  cybersecurity_contact_user_id  text,
  cybersecurity_contact_email    text,

  -- Org admin (fallback recipient, always notified)
  admin_user_id           text,
  admin_email              text,

  enabled                  boolean default true,
  created_at               timestamptz default now(),
  updated_at               timestamptz default now()
);

-- ─── CONNECTOR CONFIG ─────────────────────────────────────────────────────────
-- Which repos / projects are being watched, OAuth tokens

create table if not exists monitoring_connectors (
  id                uuid primary key default gen_random_uuid(),
  org_id            text not null,
  provider          text not null check (provider in ('github', 'gitlab', 'jira')),

  -- OAuth
  access_token      text,
  refresh_token     text,
  token_expires_at  timestamptz,
  installation_id   text,

  -- Scope
  account_name      text,
  watched_repos     jsonb default '[]'::jsonb,
  watched_projects  jsonb default '[]'::jsonb,
  watched_branches  jsonb default '["main", "master", "production"]'::jsonb,

  webhook_secret    text,
  webhook_id        text,

  status            text default 'active' check (status in ('active', 'paused', 'error', 'disconnected')),
  last_event_at     timestamptz,
  error_message     text,

  connected_by      text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),

  unique(org_id, provider, installation_id)
);

create index if not exists monitoring_connectors_org_idx on monitoring_connectors (org_id, provider);

-- ─── GIT USER MAPPING ─────────────────────────────────────────────────────────
-- Maps git/Jira identities to Norvar users for repo-owner notification

create table if not exists monitoring_user_mapping (
  id                uuid primary key default gen_random_uuid(),
  org_id            text not null,
  provider          text not null check (provider in ('github', 'gitlab', 'jira')),

  external_id       text not null,
  external_name     text,
  external_email    text,

  norvar_user_id    text,
  norvar_email      text,

  mapped_by         text,
  created_at        timestamptz default now(),

  unique(org_id, provider, external_id)
);

create index if not exists monitoring_user_mapping_org_idx on monitoring_user_mapping (org_id, provider, external_id);

-- ─── MONITORING SIGNALS ───────────────────────────────────────────────────────
-- Every detected signal, full classification, notification record

create table if not exists monitoring_signals (
  id                  uuid primary key default gen_random_uuid(),
  org_id              text not null,

  -- Source
  provider            text not null check (provider in ('github', 'gitlab', 'jira')),
  source_type         text not null check (source_type in ('push', 'pull_request', 'merge_request', 'jira_ticket')),
  source_url          text,
  source_id           text,
  repo_or_project     text,

  -- Authorship
  author_external_id  text,
  author_external_name text,
  author_norvar_user_id text,
  author_email        text,

  -- Raw signal content
  title               text,
  content_excerpt      text,

  -- Classification (from Claude)
  domains             jsonb default '[]'::jsonb,
  severity            text check (severity in ('high', 'medium', 'low', 'none')),
  confidence          text check (confidence in ('high', 'medium', 'low')),
  signal_kind         text check (signal_kind in ('new_exposure', 'regression', 'new_integration', 'none')),

  summary             text,
  gaps_identified      jsonb default '[]'::jsonb,
  frameworks_cited     jsonb default '[]'::jsonb,
  reasoning            text,

  -- Action taken
  notified_admin       boolean default false,
  notified_author       boolean default false,
  notified_compliance   boolean default false,
  compliance_domain_notified text,
  notification_sent_at  timestamptz,

  -- Outcome tracking
  assessment_triggered  boolean default false,
  assessment_id          uuid references assessments(id) on delete set null,
  user_dismissed         boolean default false,
  user_marked_false_positive boolean default false,

  created_at            timestamptz default now()
);

create index if not exists monitoring_signals_org_idx      on monitoring_signals (org_id, created_at desc);
create index if not exists monitoring_signals_severity_idx on monitoring_signals (severity);
create index if not exists monitoring_signals_provider_idx on monitoring_signals (provider, source_type);

-- ─── WEBHOOK EVENT LOG ────────────────────────────────────────────────────────
-- Raw inbound webhook log for debugging and replay — short retention

create table if not exists monitoring_webhook_log (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,
  org_id        text,
  event_type    text,
  payload       jsonb,
  processed     boolean default false,
  error_message text,
  created_at    timestamptz default now()
);

create index if not exists monitoring_webhook_log_created_idx on monitoring_webhook_log (created_at desc);

-- ─── GRANTS ───────────────────────────────────────────────────────────────────

grant all on public.org_monitoring_config   to service_role;
grant all on public.monitoring_connectors   to service_role;
grant all on public.monitoring_user_mapping to service_role;
grant all on public.monitoring_signals      to service_role;
grant all on public.monitoring_webhook_log  to service_role;

revoke all on public.org_monitoring_config   from authenticated;
revoke all on public.monitoring_connectors   from authenticated;
revoke all on public.monitoring_user_mapping from authenticated;
revoke all on public.monitoring_signals      from authenticated;
revoke all on public.monitoring_webhook_log  from authenticated;
