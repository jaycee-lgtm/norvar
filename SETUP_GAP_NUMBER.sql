-- Stable gap identifiers: {assessment_number}-{DOMAIN_CODE}-{index}
-- e.g. NRV-2026-0009-PRIV-1

alter table remediation_items add column if not exists gap_number text;

create index if not exists remediation_gap_number_idx
  on remediation_items (assessment_id, gap_number);
