import { STATUS_LABELS, STATUS_STYLES, type RemediationStatus } from "@/lib/remediation";

export default function StatusBadge({ status }: { status: string }) {
  const key = (status in STATUS_LABELS ? status : "open") as RemediationStatus;
  const s   = STATUS_STYLES[key] ?? STATUS_STYLES.open;
  return (
    <span className="remediation-status-badge" style={{
      background: s.bg,
      color:      s.color,
      border:     `0.5px solid ${s.bdr}`,
    }}>
      {STATUS_LABELS[key]}
    </span>
  );
}
