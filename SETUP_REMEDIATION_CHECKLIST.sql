-- Trackable remediation step checklist per gap item
alter table remediation_items add column if not exists step_checklist jsonb not null default '[]'::jsonb;
