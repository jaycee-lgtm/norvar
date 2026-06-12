export type EscalationStatus = "sent" | "viewed" | "in_review" | "responded" | "closed";

export type AssigneeMeta = Record<string, { role?: string; since: string }>;

export const ESCALATION_STEPS: { value: EscalationStatus; label: string }[] = [
  { value: "sent",       label: "Notified" },
  { value: "viewed",     label: "Viewed" },
  { value: "in_review",  label: "In review" },
  { value: "responded",  label: "Responded" },
  { value: "closed",     label: "Closed" },
];

export function escalationStepIndex(status: EscalationStatus | null | undefined) {
  if (!status) return -1;
  return ESCALATION_STEPS.findIndex(s => s.value === status);
}

export function formatDuration(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "just now";
  const days  = Math.floor(ms / 86_400_000);
  const hours = Math.floor((ms % 86_400_000) / 3_600_000);
  const mins  = Math.floor((ms % 3_600_000) / 60_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function touchAssigneeMeta(
  current: AssigneeMeta,
  userIds: string[],
  defaultRoles?: Record<string, string>,
): AssigneeMeta {
  const now  = new Date().toISOString();
  const next: AssigneeMeta = { ...current };
  for (const id of userIds) {
    const role = defaultRoles?.[id]?.trim() ?? "";
    if (!next[id]) {
      next[id] = { role, since: now };
    } else if (!next[id].role && role) {
      next[id] = { ...next[id], role };
    }
  }
  for (const id of Object.keys(next)) {
    if (!userIds.includes(id)) delete next[id];
  }
  return next;
}

export function appBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://norvar.io");
}

export function escalationViewUrl(token: string) {
  return `${appBaseUrl()}/escalation/${token}`;
}
