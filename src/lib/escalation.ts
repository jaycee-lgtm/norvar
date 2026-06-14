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
export const ESCALATION_INBOX_SENT_ACTION = "escalation_inbox_sent";

export type EscalationEmailReply = {
  id:         string;
  from_email: string;
  from_name:  string | null;
  subject:    string | null;
  body:       string;
  created_at: string;
};

export type EscalationInboxMessage = {
  id:          string;
  direction:   "inbound" | "outbound";
  from_email:  string;
  from_name:   string | null;
  to_email?:   string | null;
  subject:     string | null;
  body:        string;
  created_at:  string;
  archived_at?: string | null;
  deleted_at?:  string | null;
  is_read?:    boolean;
};

export function escalationReplyDomain() {
  const configured = process.env.ESCALATION_REPLY_DOMAIN?.trim();
  if (configured) return configured;

  const from = process.env.EMAIL_FROM ?? "Norvar <notifications@norvar.io>";
  const match = from.match(/@([a-z0-9.-]+)/i);
  return match?.[1] ?? "norvar.io";
}

export function formatEscalationRef(
  assessmentNumber: string | null | undefined,
  token: string,
): string {
  const num = assessmentNumber?.trim();
  return num || token;
}

export function slugifyEscalationRef(ref: string): string {
  return ref.trim().toLowerCase();
}

export function isEscalationUuid(ref: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
}

export function assessmentNumberFromSlug(slug: string): string {
  const trimmed = slug.trim();
  if (!trimmed.includes("-")) return trimmed.toUpperCase();
  const parts = trimmed.split("-");
  parts[0] = parts[0].toUpperCase();
  return parts.join("-");
}

export function escalationReplyToAddress(
  token: string,
  assessmentNumber?: string | null,
): string {
  const ref = formatEscalationRef(assessmentNumber, token);
  return `escalations+${slugifyEscalationRef(ref)}@${escalationReplyDomain()}`;
}

export function extractEscalationRefFromAddress(address: string): string | null {
  const email = address.trim().toLowerCase();
  const match = email.match(/escalations\+([^@]+)@/i);
  return match?.[1] ?? null;
}

export function extractEscalationRefFromAddresses(addresses: string[]): string | null {
  for (const address of addresses) {
    const ref = extractEscalationRefFromAddress(address);
    if (ref) return ref;
  }
  return null;
}

export function extractEscalationRefFromSubject(subject: string | null | undefined): string | null {
  if (!subject) return null;
  const refMatch = subject.match(/\[ref:([^\]]+)\]/i);
  if (refMatch?.[1]) return refMatch[1].trim();
  const uuidMatch = subject.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  return uuidMatch?.[1] ?? null;
}

export function extractEscalationTokenFromAddress(address: string): string | null {
  const ref = extractEscalationRefFromAddress(address);
  if (!ref || !isEscalationUuid(ref)) return null;
  return ref;
}

export function extractEscalationTokenFromAddresses(addresses: string[]): string | null {
  for (const address of addresses) {
    const token = extractEscalationTokenFromAddress(address);
    if (token) return token;
  }
  return null;
}

export function extractEscalationTokenFromSubject(subject: string | null | undefined): string | null {
  const ref = extractEscalationRefFromSubject(subject);
  if (!ref || !isEscalationUuid(ref)) return null;
  return ref;
}

export function collectRecipientAddresses(
  ...groups: Array<string[] | string | null | undefined>
): string[] {
  const out: string[] = [];
  for (const group of groups) {
    if (!group) continue;
    if (Array.isArray(group)) out.push(...group);
    else out.push(group);
  }
  return out;
}

export function parseEscalationEmailReplies(
  activity: Array<{
    id: string;
    action: string;
    detail: string | null;
    created_at: string;
    user_id?: string;
  }>,
): EscalationEmailReply[] {
  return parseEscalationInboxThread(activity)
    .filter((m): m is EscalationInboxMessage & { direction: "inbound" } => m.direction === "inbound")
    .map(m => ({
      id:         m.id,
      from_email: m.from_email,
      from_name:  m.from_name,
      subject:    m.subject,
      body:       m.body,
      created_at: m.created_at,
    }));
}

function parseInboxDetail(
  detail: string | null,
  fallbackFrom: string,
): { from_email: string; from_name: string | null; to_email: string | null; subject: string | null; body: string } {
  try {
    const parsed = JSON.parse(detail ?? "{}") as {
      from_email?: string;
      from_name?:  string | null;
      to_email?:   string | null;
      subject?:    string | null;
      body?:       string;
    };
    return {
      from_email: parsed.from_email ?? fallbackFrom,
      from_name:  parsed.from_name ?? null,
      to_email:   parsed.to_email ?? null,
      subject:    parsed.subject ?? null,
      body:       parsed.body ?? detail ?? "",
    };
  } catch {
    return {
      from_email: fallbackFrom,
      from_name:  null,
      to_email:   null,
      subject:    null,
      body:       detail ?? "",
    };
  }
}

export function parseEscalationInboxThread(
  activity: Array<{
    id: string;
    action: string;
    detail: string | null;
    created_at: string;
    user_id?: string;
    archived_at?: string | null;
    deleted_at?: string | null;
  }>,
): EscalationInboxMessage[] {
  return activity
    .filter(a => a.action === ESCALATION_EMAIL_REPLY_ACTION || a.action === ESCALATION_INBOX_SENT_ACTION)
    .map(a => {
      const fallbackFrom = a.user_id ?? "unknown";
      const parsed = parseInboxDetail(a.detail, fallbackFrom);
      const inbound = a.action === ESCALATION_EMAIL_REPLY_ACTION;
      return {
        id:          a.id,
        direction:   inbound ? "inbound" as const : "outbound" as const,
        from_email:  parsed.from_email,
        from_name:   parsed.from_name,
        to_email:    parsed.to_email,
        subject:     parsed.subject,
        body:        parsed.body,
        created_at:  a.created_at,
        archived_at: a.archived_at ?? null,
        deleted_at:  a.deleted_at ?? null,
      };
    })
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}
