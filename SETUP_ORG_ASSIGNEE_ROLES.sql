-- Org-level default roles/functions for gap owners (Clerk organization id)
create table if not exists org_assignee_roles (
  org_id      text primary key,
  roles       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

create index if not exists org_assignee_roles_updated_idx
  on org_assignee_roles (updated_at desc);

grant all on public.org_assignee_roles to service_role;
