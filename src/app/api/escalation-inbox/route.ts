import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { resolveUserProfiles } from "@/lib/clerk-users";
import { getActiveOrganizationId, isOrgMember } from "@/lib/clerk-org";
import {
  type EscalationInboxMessage,
  type EscalationStatus,
} from "@/lib/escalation";
import { loadEscalationById, sendTeamEscalationReply } from "@/lib/escalation-thread-server";
import {
  type InboxFolder,
  type InboxActivityRow,
  attachInboxReadState,
  buildInboxListItem,
  filterMessagesForFolder,
  folderCounts,
  isInboxMessageUnread,
  parseInboxMessages,
  trashRetentionCutoffIso,
  INBOX_MESSAGE_ACTIONS,
  isInboxMessageAction,
} from "@/lib/inbox";
import { enrichRemediationGapIds } from "@/lib/gap-id";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type ItemRow = {
  id: string;
  assessment_id: string;
  gap_title: string;
  gap_severity: string;
  gap_domain: string;
  gap_key: string | null;
  gap_number: string | null;
  project_title: string | null;
  assessment_number: string | null;
  created_at: string;
  escalation_email: string | null;
  escalation_recipient_name: string | null;
  escalation_token: string | null;
  escalation_status: EscalationStatus | null;
  escalation_question: string | null;
  escalation_note: string | null;
  escalated_at: string | null;
  created_by: string;
  assigned_to: string[] | null;
  remediation_activity?: InboxActivityRow[];
};

function parseFolder(value: string | null): InboxFolder {
  if (value === "sent" || value === "archived" || value === "trash") return value;
  return "received";
}

function canManageItem(item: { created_by: string; assigned_to: string[] | null }, userId: string) {
  return item.created_by === userId || (item.assigned_to ?? []).includes(userId);
}

async function canAccessItem(
  item: { created_by: string; assigned_to: string[] | null },
  userId: string,
  orgId: string | null,
): Promise<boolean> {
  if (canManageItem(item, userId)) return true;
  if (!orgId) return false;

  if (!(await isOrgMember(orgId, userId))) return false;
  if (await isOrgMember(orgId, item.created_by)) return true;

  for (const assigneeId of item.assigned_to ?? []) {
    if (await isOrgMember(orgId, assigneeId)) return true;
  }

  return false;
}

async function purgeExpiredDeleted() {
  const cutoff = trashRetentionCutoffIso();
  await supabase
    .from("remediation_activity")
    .delete()
    .in("action", [...INBOX_MESSAGE_ACTIONS])
    .lt("deleted_at", cutoff);
}

async function loadReadMessageIds(userId: string, messageIds: string[]): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("inbox_message_reads")
    .select("message_id")
    .eq("user_id", userId)
    .in("message_id", messageIds);

  if (error) {
    if (error.message.includes("inbox_message_reads")) return new Set();
    throw new Error(error.message);
  }

  return new Set((data ?? []).map(row => row.message_id as string));
}

async function markMessagesRead(userId: string, messageIds: string[]): Promise<void> {
  const unreadIds = messageIds.filter(Boolean);
  if (unreadIds.length === 0) return;

  const now  = new Date().toISOString();
  const rows = unreadIds.map(message_id => ({ user_id: userId, message_id, read_at: now }));

  const { error } = await supabase
    .from("inbox_message_reads")
    .upsert(rows, { onConflict: "user_id,message_id", ignoreDuplicates: true });

  if (error && !error.message.includes("inbox_message_reads")) {
    throw new Error(error.message);
  }
}

function activeThreadMessages(messages: EscalationInboxMessage[]) {
  return messages.filter(m => !m.deleted_at && !m.archived_at);
}

function serializeThread(
  item: ItemRow,
  messages: EscalationInboxMessage[],
  folder: InboxFolder,
  readIds: Set<string>,
) {
  const withRead = attachInboxReadState(messages, readIds);
  const filtered = folder === "received" || folder === "sent"
    ? activeThreadMessages(withRead)
    : filterMessagesForFolder(withRead, folder);
  const allCounts = folderCounts(withRead, readIds);

  const [enriched] = enrichRemediationGapIds([item]);

  return {
    remediation_id:      item.id,
    assessment_id:       item.assessment_id,
    escalation_token:    item.escalation_token,
    gap_title:           item.gap_title,
    gap_id:              enriched.gap_id,
    gap_severity:        item.gap_severity,
    gap_domain:          item.gap_domain,
    project_title:       item.project_title,
    assessment_number:   item.assessment_number,
    created_at:          item.created_at,
    recipient_name:      item.escalation_recipient_name,
    recipient_email:     item.escalation_email,
    escalation_status:   item.escalation_status,
    escalated_at:        item.escalated_at,
    escalation_question: item.escalation_question,
    escalation_note:     item.escalation_note,
    folder,
    counts:              allCounts,
    messages:            filtered,
  };
}

async function loadAccessibleItems(userId: string, activeOrgId: string | null) {
  const { data, error } = await supabase
    .from("remediation_items")
    .select(`
      id, assessment_id, gap_title, gap_severity, gap_domain, gap_key, gap_number,
      project_title, assessment_number, created_at,
      escalation_email, escalation_recipient_name, escalation_token, escalation_status,
      escalation_question, escalation_note, escalated_at,
      created_by, assigned_to, remediation_activity(*)
    `)
    .not("escalation_email", "is", null)
    .order("escalated_at", { ascending: false });

  if (error) throw new Error(error.message);

  const accessible: ItemRow[] = [];
  for (const row of data ?? []) {
    const item = row as ItemRow;
    if (await canAccessItem(item, userId, activeOrgId)) accessible.push(item);
  }
  return accessible;
}

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const activeOrgId = await getActiveOrganizationId(userId, orgId);
  const params      = new URL(req.url).searchParams;
  const threadId    = params.get("thread");
  const folder      = parseFolder(params.get("folder"));

  await purgeExpiredDeleted();

  const accessible = await loadAccessibleItems(userId, activeOrgId);

  const allMessages = accessible.flatMap(item =>
    parseInboxMessages(item.remediation_activity ?? []),
  );
  const readIds = await loadReadMessageIds(userId, allMessages.map(m => m.id));
  const counts  = folderCounts(allMessages, readIds);

  if (threadId) {
    const item = accessible.find(i => i.id === threadId);
    if (!item) return Response.json({ error: "Thread not found" }, { status: 404 });

    const messages = attachInboxReadState(
      parseInboxMessages(item.remediation_activity ?? []),
      readIds,
    );

    const toMark = messages
      .filter(m => isInboxMessageUnread(m, readIds))
      .map(m => m.id);
    if (toMark.length) {
      await markMessagesRead(userId, toMark);
      for (const id of toMark) readIds.add(id);
    }

    const markedMessages = attachInboxReadState(messages, readIds);
    return Response.json({
      thread: serializeThread(item, markedMessages, folder, readIds),
      counts: folderCounts(markedMessages, readIds),
    });
  }

  const items = accessible.flatMap(item => {
    const messages = filterMessagesForFolder(
      parseInboxMessages(item.remediation_activity ?? []),
      folder,
    );
    return messages.map(msg => buildInboxListItem(msg, item, readIds));
  }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return Response.json({ folder, items, counts });
}

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { remediation_id, message } = await req.json() as {
    remediation_id?: string;
    message?:        string;
  };

  const body = message?.trim();
  if (!remediation_id || !body) {
    return Response.json({ error: "remediation_id and message required" }, { status: 400 });
  }

  const activeOrgId = await getActiveOrganizationId(userId, orgId);

  const { data: item, error } = await supabase
    .from("remediation_items")
    .select(`
      id, gap_title, gap_severity, gap_domain, project_title, assessment_number,
      escalation_email, escalation_recipient_name, escalation_token, escalation_status,
      escalation_question, escalation_note, escalated_at,
      created_by, assigned_to
    `)
    .eq("id", remediation_id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!item) return Response.json({ error: "Thread not found" }, { status: 404 });

  const row = item as ItemRow;
  if (!(await canAccessItem(row, userId, activeOrgId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!canManageItem(row, userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!row.escalation_email || !row.escalation_token) {
    return Response.json({ error: "This gap has not been escalated by email" }, { status: 400 });
  }

  const profiles = await resolveUserProfiles([userId]);
  const senderName = profiles[userId]?.name ?? "Norvar user";
  const senderEmail = profiles[userId]?.email ?? userId;

  const threadItem = await loadEscalationById(supabase, remediation_id);
  if (!threadItem) {
    return Response.json({ error: "Thread not found" }, { status: 404 });
  }

  const sendResult = await sendTeamEscalationReply(supabase, threadItem, {
    userId,
    senderName,
    senderEmail,
    body,
  });

  if (!sendResult.ok && !sendResult.duplicate) {
    return Response.json({ error: sendResult.error ?? "Send failed" }, { status: 500 });
  }

  const outbound: EscalationInboxMessage = {
    id:          sendResult.activityId ?? remediation_id,
    direction:   "outbound",
    from_email:  senderEmail,
    from_name:   senderName,
    to_email:    row.escalation_email,
    subject:     null,
    body,
    created_at:  sendResult.createdAt ?? new Date().toISOString(),
    archived_at: null,
    deleted_at:  null,
    is_read:     true,
  };

  return Response.json({
    message:     outbound,
    email_sent:  sendResult.ok,
    email_error: sendResult.error,
  });
}

type PatchAction = "archive" | "delete" | "restore" | "unarchive" | "purge";

async function applyMessagePatch(
  messageId: string,
  action: PatchAction,
  userId: string,
  activeOrgId: string | null,
): Promise<{ purged?: boolean }> {
  const { data: activity, error } = await supabase
    .from("remediation_activity")
    .select("id, action, remediation_id, archived_at, deleted_at")
    .eq("id", messageId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!activity || !isInboxMessageAction(activity.action)) {
    throw new Error("Message not found");
  }

  const { data: item, error: itemError } = await supabase
    .from("remediation_items")
    .select("id, created_by, assigned_to")
    .eq("id", activity.remediation_id)
    .maybeSingle();

  if (itemError || !item) throw new Error("Thread not found");
  if (!(await canAccessItem(item, userId, activeOrgId))) {
    throw new Error("Forbidden");
  }

  if (action === "purge") {
    if (!activity.deleted_at) throw new Error("Only deleted messages can be purged");
    const { error: delError } = await supabase
      .from("remediation_activity")
      .delete()
      .eq("id", messageId);
    if (delError) throw new Error(delError.message);
    return { purged: true };
  }

  const now = new Date().toISOString();
  const updates: { archived_at: string | null; deleted_at: string | null } = {
    archived_at: activity.archived_at ?? null,
    deleted_at:  activity.deleted_at ?? null,
  };

  switch (action) {
    case "archive":
      updates.archived_at = now;
      updates.deleted_at  = null;
      break;
    case "delete":
      updates.deleted_at  = now;
      updates.archived_at = null;
      break;
    case "restore":
      updates.deleted_at  = null;
      break;
    case "unarchive":
      updates.archived_at = null;
      break;
  }

  const { error: updateError } = await supabase
    .from("remediation_activity")
    .update(updates)
    .eq("id", messageId);

  if (updateError) throw new Error(updateError.message);
  return {};
}

export async function PATCH(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const body = await req.json() as {
    message_id?:  string;
    message_ids?: string[];
    action?:      PatchAction;
  };

  const action = body.action;
  const ids    = body.message_ids?.length
    ? body.message_ids
    : body.message_id
      ? [body.message_id]
      : [];

  if (!ids.length || !action) {
    return Response.json({ error: "message_id or message_ids and action required" }, { status: 400 });
  }

  const valid: PatchAction[] = ["archive", "delete", "restore", "unarchive", "purge"];
  if (!valid.includes(action)) {
    return Response.json({ error: "Invalid action" }, { status: 400 });
  }

  const activeOrgId = await getActiveOrganizationId(userId, orgId);
  const errors: Array<{ id: string; error: string }> = [];
  let updated = 0;

  for (const id of ids) {
    try {
      await applyMessagePatch(id, action, userId, activeOrgId);
      updated += 1;
    } catch (err) {
      errors.push({
        id,
        error: err instanceof Error ? err.message : "Update failed",
      });
    }
  }

  if (updated === 0) {
    return Response.json(
      { error: errors[0]?.error ?? "Could not update messages", errors },
      { status: errors.some(e => e.error === "Forbidden") ? 403 : 400 },
    );
  }

  return Response.json({
    ok:      errors.length === 0,
    updated,
    errors:  errors.length ? errors : undefined,
  });
}
