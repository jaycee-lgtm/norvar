import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { resolveUserProfiles } from "@/lib/clerk-users";
import { getActiveOrganizationId, isOrgMember } from "@/lib/clerk-org";
import {
  ESCALATION_INBOX_SENT_ACTION,
  parseEscalationInboxThread,
  type EscalationInboxMessage,
  type EscalationStatus,
} from "@/lib/escalation";
import { sendEscalationInboxReply } from "@/lib/email";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type ItemRow = {
  id: string;
  gap_title: string;
  gap_severity: string;
  gap_domain: string;
  project_title: string | null;
  assessment_number: string | null;
  escalation_email: string | null;
  escalation_recipient_name: string | null;
  escalation_token: string | null;
  escalation_status: EscalationStatus | null;
  escalation_question: string | null;
  escalation_note: string | null;
  escalated_at: string | null;
  created_by: string;
  assigned_to: string[] | null;
  remediation_activity?: Array<{
    id: string;
    action: string;
    detail: string | null;
    created_at: string;
    user_id?: string;
  }>;
};

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

function buildThreadSummary(item: ItemRow) {
  const messages = parseEscalationInboxThread(item.remediation_activity ?? []);
  const lastMessage = messages[messages.length - 1] ?? null;
  const inboundCount = messages.filter(m => m.direction === "inbound").length;

  return {
    remediation_id:    item.id,
    gap_title:         item.gap_title,
    gap_severity:      item.gap_severity,
    gap_domain:        item.gap_domain,
    project_title:     item.project_title,
    assessment_number: item.assessment_number,
    recipient_name:    item.escalation_recipient_name,
    recipient_email:   item.escalation_email,
    escalation_status: item.escalation_status,
    escalated_at:      item.escalated_at,
    last_message_at:   lastMessage?.created_at ?? item.escalated_at,
    message_count:     messages.length,
    inbound_count:     inboundCount,
    has_unread:        inboundCount > 0 && item.escalation_status !== "closed",
  };
}

function serializeThread(item: ItemRow, messages: EscalationInboxMessage[]) {
  return {
    ...buildThreadSummary(item),
    escalation_question: item.escalation_question,
    escalation_note:     item.escalation_note,
    messages,
  };
}

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const activeOrgId = await getActiveOrganizationId(userId, orgId);
  const threadId    = new URL(req.url).searchParams.get("thread");

  const { data, error } = await supabase
    .from("remediation_items")
    .select(`
      id, gap_title, gap_severity, gap_domain, project_title, assessment_number,
      escalation_email, escalation_recipient_name, escalation_token, escalation_status,
      escalation_question, escalation_note, escalated_at,
      created_by, assigned_to, remediation_activity(*)
    `)
    .not("escalation_email", "is", null)
    .order("escalated_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const accessible: ItemRow[] = [];
  for (const row of data ?? []) {
    const item = row as ItemRow;
    if (await canAccessItem(item, userId, activeOrgId)) accessible.push(item);
  }

  if (threadId) {
    const item = accessible.find(i => i.id === threadId);
    if (!item) return Response.json({ error: "Thread not found" }, { status: 404 });

    const messages = parseEscalationInboxThread(item.remediation_activity ?? []);
    return Response.json({ thread: serializeThread(item, messages) });
  }

  const threads = accessible
    .map(buildThreadSummary)
    .sort((a, b) => {
      const aTime = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
      const bTime = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
      return bTime - aTime;
    });

  const unreadCount = threads.filter(t => t.has_unread).length;

  return Response.json({ threads, unread_count: unreadCount });
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

  const emailResult = await sendEscalationInboxReply({
    token:          row.escalation_token,
    recipientEmail: row.escalation_email,
    recipientName:  row.escalation_recipient_name,
    gapTitle:       row.gap_title,
    projectTitle:   row.project_title,
    body,
    senderName,
  });

  const detail = JSON.stringify({
    from_email: senderEmail,
    from_name:  senderName,
    to_email:   row.escalation_email,
    subject:    null,
    body,
  });

  const { data: activity, error: insertError } = await supabase
    .from("remediation_activity")
    .insert({
      remediation_id: remediation_id,
      user_id:        userId,
      action:         ESCALATION_INBOX_SENT_ACTION,
      detail,
    })
    .select("id, action, detail, created_at, user_id")
    .single();

  if (insertError) return Response.json({ error: insertError.message }, { status: 500 });

  if (row.escalation_status !== "closed") {
    await supabase
      .from("remediation_items")
      .update({ last_notified_at: new Date().toISOString() })
      .eq("id", remediation_id);
  }

  const outbound: EscalationInboxMessage = {
    id:         activity.id,
    direction:  "outbound",
    from_email: senderEmail,
    from_name:  senderName,
    to_email:   row.escalation_email,
    subject:    null,
    body,
    created_at: activity.created_at,
  };

  return Response.json({
    message:    outbound,
    email_sent: emailResult.ok,
    email_error: emailResult.error,
  });
}
