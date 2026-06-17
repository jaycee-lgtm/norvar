import type { SupabaseClient } from "@supabase/supabase-js";
import { clerkClient } from "@clerk/nextjs/server";
import { findUserByEmail, resolveNotificationEmails, resolveUserProfiles } from "@/lib/clerk-users";
import {
  ESCALATION_EMAIL_REPLY_ACTION,
  ESCALATION_INBOX_SENT_ACTION,
  appBaseUrl,
  escalationReplyToAddress,
  type EscalationStatus,
} from "@/lib/escalation";
import {
  sendEscalationAssigneeReplyNotification,
  sendEscalationInboxReply,
} from "@/lib/email";

export type EscalationThreadItem = {
  id:                         string;
  created_by:                 string;
  assigned_to:                string[] | null;
  escalation_email:           string | null;
  escalation_token:           string | null;
  escalation_recipient_name:  string | null;
  assessment_number:          string | null;
  gap_title:                  string;
  project_title:              string | null;
  escalation_status:          EscalationStatus | null;
};

const THREAD_SELECT = `
  id, created_by, assigned_to, escalation_email, escalation_token,
  escalation_recipient_name, assessment_number, gap_title, project_title, escalation_status
`;

export async function loadEscalationByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<EscalationThreadItem | null> {
  const { data, error } = await supabase
    .from("remediation_items")
    .select(THREAD_SELECT)
    .eq("escalation_token", token)
    .maybeSingle();

  if (error || !data) return null;
  return data as EscalationThreadItem;
}

export async function loadEscalationById(
  supabase: SupabaseClient,
  remediationId: string,
): Promise<EscalationThreadItem | null> {
  const { data, error } = await supabase
    .from("remediation_items")
    .select(THREAD_SELECT)
    .eq("id", remediationId)
    .maybeSingle();

  if (error || !data) return null;
  return data as EscalationThreadItem;
}

async function assigneeEmails(item: EscalationThreadItem): Promise<string[]> {
  const ids = Array.from(new Set([item.created_by, ...(item.assigned_to ?? [])].filter(Boolean)));
  return resolveNotificationEmails(ids);
}

export async function resolveTeamSender(
  item: EscalationThreadItem,
  senderEmail: string,
): Promise<{ userId: string; name: string; email: string } | null> {
  const normalized = senderEmail.trim().toLowerCase();
  if (!normalized) return null;

  const allowedIds = new Set([item.created_by, ...(item.assigned_to ?? [])]);
  const profiles   = await resolveUserProfiles([...allowedIds]);

  for (const id of allowedIds) {
    const profile = profiles[id];
    if (profile?.email?.trim().toLowerCase() === normalized) {
      return { userId: id, name: profile.name, email: profile.email };
    }
  }

  const byEmail = await findUserByEmail(normalized);
  if (byEmail && allowedIds.has(byEmail.id)) {
    return { userId: byEmail.id, name: byEmail.name, email: byEmail.email };
  }

  const client = await clerkClient();
  for (const id of allowedIds) {
    try {
      const { data: memberships } = await client.users.getOrganizationMembershipList({ userId: id, limit: 10 });
      for (const membership of memberships) {
        const identifier = membership.publicUserData?.identifier?.trim().toLowerCase();
        if (identifier === normalized) {
          const profile = profiles[id] ?? (await resolveUserProfiles([id]))[id];
          return {
            userId: id,
            name:   profile?.name ?? "Norvar user",
            email:  profile?.email || identifier,
          };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

export function isEscalationRecipientSender(
  item: EscalationThreadItem,
  senderEmail: string,
): boolean {
  const recipient = item.escalation_email?.trim().toLowerCase();
  return !!recipient && recipient === senderEmail.trim().toLowerCase();
}

export async function notifyAssigneesOfRecipientReply(
  item: EscalationThreadItem,
  input: {
    fromName:    string | null;
    fromEmail:   string;
    body:        string;
    source:      "email" | "form";
  },
): Promise<void> {
  const recipients = (await assigneeEmails(item)).filter(
    email => email !== item.escalation_email?.trim().toLowerCase(),
  );
  if (!recipients.length || !item.escalation_token) {
    console.warn("[escalation] assignee notification skipped", {
      remediation_id: item.id,
      reason:         !item.escalation_token ? "missing token" : "no assignee emails",
      created_by:     item.created_by,
      assigned_to:    item.assigned_to,
    });
    return;
  }

  const inboxUrl = `${appBaseUrl()}/inbox?folder=received&thread=${item.id}`;

  const result = await sendEscalationAssigneeReplyNotification({
    toEmails:         recipients,
    token:            item.escalation_token,
    assessmentNumber: item.assessment_number,
    gapTitle:         item.gap_title,
    projectTitle:     item.project_title,
    recipientName:    item.escalation_recipient_name,
    recipientEmail:   item.escalation_email ?? input.fromEmail,
    replyBody:        input.body,
    replySource:      input.source,
    inboxUrl,
  });

  if (!result.ok) {
    console.warn("[escalation] assignee notification email failed", {
      remediation_id: item.id,
      recipients,
      error:          result.error,
    });
    throw new Error(result.error ?? "Assignee notification failed");
  }
}

export async function sendTeamEscalationReply(
  supabase: SupabaseClient,
  item: EscalationThreadItem,
  input: {
    userId:          string;
    senderName:      string;
    senderEmail:     string;
    body:            string;
    inboundEmailId?: string;
  },
): Promise<{
  ok: boolean;
  error?: string;
  duplicate?: boolean;
  activityId?: string;
  createdAt?: string;
}> {
  if (!item.escalation_email || !item.escalation_token) {
    return { ok: false, error: "Escalation email not configured" };
  }

  const body = input.body.trim();
  if (!body) return { ok: false, error: "Empty reply body" };

  if (input.inboundEmailId) {
    const { data: existing } = await supabase
      .from("remediation_activity")
      .select("id")
      .eq("remediation_id", item.id)
      .eq("action", ESCALATION_INBOX_SENT_ACTION)
      .ilike("detail", `%${input.inboundEmailId}%`)
      .limit(1);

    if (existing?.length) {
      return { ok: true, duplicate: true, activityId: existing[0].id as string };
    }
  }

  const emailResult = await sendEscalationInboxReply({
    token:            item.escalation_token,
    assessmentNumber: item.assessment_number,
    recipientEmail:   item.escalation_email,
    recipientName:    item.escalation_recipient_name,
    gapTitle:         item.gap_title,
    projectTitle:     item.project_title,
    body,
    senderName:       input.senderName,
  });

  const detailPayload: Record<string, string | null> = {
    from_email: input.senderEmail,
    from_name:  input.senderName,
    to_email:   item.escalation_email,
    subject:    null,
    body,
  };
  if (input.inboundEmailId) detailPayload.inbound_email_id = input.inboundEmailId;

  const { data: activity, error: insertError } = await supabase.from("remediation_activity").insert({
    remediation_id: item.id,
    user_id:        input.userId,
    action:         ESCALATION_INBOX_SENT_ACTION,
    detail:         JSON.stringify(detailPayload),
  }).select("id, created_at").single();

  if (insertError) return { ok: false, error: insertError.message };

  if (item.escalation_status !== "closed") {
    await supabase
      .from("remediation_items")
      .update({ last_notified_at: new Date().toISOString() })
      .eq("id", item.id);
  }

  if (!emailResult.ok) {
    return { ok: false, error: emailResult.error ?? "Email failed" };
  }

  return {
    ok:         true,
    activityId: activity.id,
    createdAt:  activity.created_at,
  };
}
