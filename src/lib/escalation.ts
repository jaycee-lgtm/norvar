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

export const ESCALATION_EMAIL_REPLY_ACTION = "escalation_email_reply";

export type EscalationEmailReply = {
  id:         string;
  from_email: string;
  from_name:  string | null;
  subject:    string | null;
  body:       string;
  created_at: string;
};

export function escalationReplyDomain() {
  const configured = process.env.ESCALATION_REPLY_DOMAIN?.trim();
  if (configured) return configured;

  const from = process.env.EMAIL_FROM ?? "Norvar <notifications@norvar.io>";
  const match = from.match(/@([a-z0-9.-]+)/i);
  return match?.[1] ?? "norvar.io";
}

export function escalationReplyToAddress(token: string) {
  return `escalations+${token}@${escalationReplyDomain()}`;
}

export function extractEscalationTokenFromAddress(address: string): string | null {
  const email = address.trim().toLowerCase();
  const match = email.match(/escalations\+([0-9a-f-]{36})@/i);
  return match?.[1] ?? null;
}

export function extractEscalationTokenFromAddresses(addresses: string[]): string | null {
  for (const address of addresses) {
    const token = extractEscalationTokenFromAddress(address);
    if (token) return token;
  }
  return null;
}

export function parseEscalationEmailReplies(
  activity: Array<{
    id: string;
    action: string;
    detail: string | null;
    created_at: string;
    user_id: string;
  }>,
): EscalationEmailReply[] {
  return activity
    .filter(a => a.action === ESCALATION_EMAIL_REPLY_ACTION)
    .map(a => {
      try {
        const parsed = JSON.parse(a.detail ?? "{}") as {
          from_email?: string;
          from_name?: string | null;
          subject?: string | null;
          body?: string;
        };
        return {
          id:         a.id,
          from_email: parsed.from_email ?? a.user_id,
          from_name:  parsed.from_name ?? null,
          subject:    parsed.subject ?? null,
          body:       parsed.body ?? a.detail ?? "",
          created_at: a.created_at,
        };
      } catch {
        return {
          id:         a.id,
          from_email: a.user_id,
          from_name:  null,
          subject:    null,
          body:       a.detail ?? "",
          created_at: a.created_at,
        };
      }
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}
