import {
  ESCALATION_EMAIL_REPLY_ACTION,
  ESCALATION_INBOX_SENT_ACTION,
  parseEscalationInboxThread,
  type EscalationInboxMessage,
} from "@/lib/escalation";

export type InboxFolder = "received" | "sent" | "archived" | "trash";

/** Escalation folders plus the monitoring feed view. */
export type InboxViewFolder = InboxFolder | "monitoring";

export const INBOX_FOLDERS: Array<{ id: InboxFolder; label: string; icon: "inbox" | "send" | "archive" | "trash" }> = [
  { id: "received", label: "Received",   icon: "inbox" },
  { id: "sent",     label: "Sent",       icon: "send" },
  { id: "archived", label: "Archived",   icon: "archive" },
  { id: "trash",    label: "Recycle bin", icon: "trash" },
];

export const INBOX_RETENTION_DAYS = 90;

export const INBOX_MESSAGE_ACTIONS = [
  ESCALATION_EMAIL_REPLY_ACTION,
  ESCALATION_INBOX_SENT_ACTION,
] as const;

export type InboxActivityRow = {
  id:           string;
  action:       string;
  detail:       string | null;
  created_at:   string;
  user_id?:     string;
  archived_at?: string | null;
  deleted_at?:  string | null;
};

export type InboxListItem = {
  message_id:        string;
  remediation_id:    string;
  direction:         "inbound" | "outbound";
  gap_title:         string;
  gap_severity:      string;
  project_title:     string | null;
  assessment_number: string | null;
  recipient_name:    string | null;
  recipient_email:   string | null;
  from_name:         string | null;
  from_email:        string;
  body_preview:      string;
  created_at:        string;
  archived_at:       string | null;
  deleted_at:        string | null;
  days_until_purge:  number | null;
  is_read:           boolean;
};

export type InboxFolderCounts = Record<InboxFolder, number> & {
  unread_received: number;
};

export function isInboxMessageUnread(
  msg: Pick<EscalationInboxMessage, "id" | "direction">,
  readIds: Set<string>,
): boolean {
  if (msg.direction !== "inbound") return false;
  return !readIds.has(msg.id);
}

export function attachInboxReadState(
  messages: EscalationInboxMessage[],
  readIds: Set<string>,
): EscalationInboxMessage[] {
  return messages.map(msg => ({
    ...msg,
    is_read: msg.direction === "outbound" || readIds.has(msg.id),
  }));
}

export function trashRetentionCutoff(): Date {
  const d = new Date();
  d.setDate(d.getDate() - INBOX_RETENTION_DAYS);
  return d;
}

export function trashRetentionCutoffIso(): string {
  return trashRetentionCutoff().toISOString();
}

export function daysUntilPurge(deletedAt: string): number {
  const purgeAt = new Date(deletedAt).getTime() + INBOX_RETENTION_DAYS * 86_400_000;
  return Math.max(0, Math.ceil((purgeAt - Date.now()) / 86_400_000));
}

export function isInboxMessageAction(action: string): boolean {
  return action === ESCALATION_EMAIL_REPLY_ACTION || action === ESCALATION_INBOX_SENT_ACTION;
}

export function stripInboxMessageBody(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^on .+ wrote:$/i.test(trimmed)) break;
    if (/^-{2,}\s*original message\s*-{2,}/i.test(trimmed)) break;
    if (/^from:\s/i.test(trimmed) && result.length > 2) break;
    if (/^_{3,}$/.test(trimmed)) break;
    if (trimmed.startsWith(">")) continue;
    result.push(line);
  }

  const stripped = result.join("\n").trim();
  if (stripped) return stripped;

  return text
    .split("\n")
    .filter(line => !line.trim().startsWith(">"))
    .join("\n")
    .trim();
}

export function messageMatchesFolder(
  msg: EscalationInboxMessage,
  folder: InboxFolder,
  cutoffIso = trashRetentionCutoffIso(),
): boolean {
  const deleted  = msg.deleted_at ?? null;
  const archived = msg.archived_at ?? null;

  if (folder === "trash") {
    return Boolean(deleted && deleted >= cutoffIso);
  }

  if (deleted || archived) return false;
  if (folder === "received") return msg.direction === "inbound";
  if (folder === "sent") return msg.direction === "outbound";
  return false;
}

export function messageMatchesArchivedFolder(msg: EscalationInboxMessage): boolean {
  return Boolean(msg.archived_at && !msg.deleted_at);
}

export function filterMessagesForFolder(
  messages: EscalationInboxMessage[],
  folder: InboxFolder,
): EscalationInboxMessage[] {
  if (folder === "archived") {
    return messages.filter(messageMatchesArchivedFolder);
  }
  return messages.filter(m => messageMatchesFolder(m, folder));
}

export function parseInboxMessages(activity: InboxActivityRow[]): EscalationInboxMessage[] {
  return parseEscalationInboxThread(activity);
}

function bodyPreview(text: string, max = 100): string {
  const one = stripInboxMessageBody(text).replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

export function buildInboxListItem(
  msg: EscalationInboxMessage,
  item: {
    id: string;
    gap_title: string;
    gap_severity: string;
    project_title: string | null;
    assessment_number: string | null;
    escalation_recipient_name: string | null;
    escalation_email: string | null;
  },
  readIds: Set<string> = new Set(),
): InboxListItem {
  return {
    message_id:        msg.id,
    remediation_id:    item.id,
    direction:         msg.direction,
    gap_title:         item.gap_title,
    gap_severity:      item.gap_severity,
    project_title:     item.project_title,
    assessment_number: item.assessment_number,
    recipient_name:    item.escalation_recipient_name,
    recipient_email:   item.escalation_email,
    from_name:         msg.from_name,
    from_email:        msg.from_email,
    body_preview:      bodyPreview(msg.body),
    created_at:        msg.created_at,
    archived_at:       msg.archived_at ?? null,
    deleted_at:        msg.deleted_at ?? null,
    days_until_purge:  msg.deleted_at ? daysUntilPurge(msg.deleted_at) : null,
    is_read:           !isInboxMessageUnread(msg, readIds),
  };
}

export function folderCounts(
  messages: EscalationInboxMessage[],
  readIds: Set<string> = new Set(),
): InboxFolderCounts {
  const cutoff = trashRetentionCutoffIso();
  return {
    received: messages.filter(m => messageMatchesFolder(m, "received", cutoff)).length,
    sent:     messages.filter(m => messageMatchesFolder(m, "sent", cutoff)).length,
    archived: messages.filter(messageMatchesArchivedFolder).length,
    trash:    messages.filter(m => messageMatchesFolder(m, "trash", cutoff)).length,
    unread_received: messages.filter(
      m => messageMatchesFolder(m, "received", cutoff) && isInboxMessageUnread(m, readIds),
    ).length,
  };
}
