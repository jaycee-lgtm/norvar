import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { resolveUserProfiles } from "@/lib/clerk-users";
import { escalationStepIndex, ESCALATION_EMAIL_REPLY_ACTION, parseEscalationInboxThread, type EscalationStatus } from "@/lib/escalation";
import { enrichRemediationGapIds, lookupGapChat, resolveGapKey } from "@/lib/gap-id";
import { loadEscalationById, notifyAssigneesOfRecipientReply } from "@/lib/escalation-thread-server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const STATUS_ORDER: EscalationStatus[] = ["sent", "viewed", "in_review", "responded", "closed"];

function advanceStatus(current: EscalationStatus | null, next: EscalationStatus): EscalationStatus {
  const curIdx  = escalationStepIndex(current);
  const nextIdx = escalationStepIndex(next);
  if (curIdx >= nextIdx) return current ?? next;
  return next;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return Response.json({ error: "Token required" }, { status: 400 });

  const { data: item, error } = await supabase
    .from("remediation_items")
    .select(`
      id, assessment_id, project_title, assessment_number,
      gap_key, gap_number, gap_title, gap_severity, gap_domain, gap_detail,
      gap_frameworks, remediation_steps, messages, status,
      escalation_email, escalation_recipient_name, escalation_role,
      escalation_question, escalation_note, escalated_at, escalation_status,
      last_notified_at, assignee_meta, assigned_to, created_at, escalation_token
    `)
    .eq("escalation_token", token)
    .single();

  if (error || !item) return Response.json({ error: "Escalation not found" }, { status: 404 });

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, title, description, risk_tier, risk_score, result, created_at, domains, jurisdictions, gap_chats, messages")
    .eq("id", item.assessment_id)
    .single();

  const [enriched] = enrichRemediationGapIds([item]);
  const gapKey = resolveGapKey(
    enriched.gap_key,
    enriched.gap_number,
    enriched.assessment_number,
    enriched.gap_domain,
    enriched.gap_severity,
    enriched.gap_title,
  );
  const gapChats = (assessment?.gap_chats && typeof assessment.gap_chats === "object")
    ? assessment.gap_chats as Record<string, unknown[]>
    : {};
  const assessmentGapChat = lookupGapChat(gapChats, gapKey);

  const userIds = [...(item.assigned_to ?? []), ...(assessment ? [] : [])];
  const users   = await resolveUserProfiles(userIds);

  const { data: activity } = await supabase
    .from("remediation_activity")
    .select("id, action, detail, created_at, user_id")
    .eq("remediation_id", item.id)
    .order("created_at", { ascending: false })
    .limit(100);

  // Mark as viewed on first open
  if (item.escalation_status === "sent") {
    await supabase
      .from("remediation_items")
      .update({ escalation_status: "viewed" })
      .eq("id", item.id);
    item.escalation_status = "viewed";
    await supabase.from("remediation_activity").insert({
      remediation_id: item.id,
      user_id:        "system",
      action:         "escalation_viewed",
      detail:         "Recipient opened escalation link",
    });
  }

  return Response.json({
    item:     { ...enriched, escalation_status: item.escalation_status, gap_key: gapKey, gap_id: enriched.gap_id },
    assessment,
    assessment_gap_chat: assessmentGapChat,
    inbox_thread:        parseEscalationInboxThread(activity ?? []),
    users,
    activity: activity ?? [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) return Response.json({ error: "Token required" }, { status: 400 });

  const body = await req.json();
  const { status, response_note } = body as {
    status?:        EscalationStatus;
    response_note?: string;
  };

  const { data: item } = await supabase
    .from("remediation_items")
    .select("id, escalation_status, escalation_email, escalation_recipient_name, escalation_recipient_user_id")
    .eq("escalation_token", token)
    .single();

  if (!item) return Response.json({ error: "Escalation not found" }, { status: 404 });

  const { userId } = await auth();
  const actorId = userId ?? "recipient";

  const updates: Record<string, unknown> = {};
  let activityDetail = "";

  if (status && STATUS_ORDER.includes(status)) {
    updates.escalation_status = advanceStatus(item.escalation_status as EscalationStatus, status);
    activityDetail = `Escalation status: ${updates.escalation_status}`;
  }

  if (response_note?.trim()) {
    updates.escalation_status = advanceStatus(
      (updates.escalation_status as EscalationStatus) ?? item.escalation_status as EscalationStatus,
      "responded",
    );
    activityDetail = `Response: ${response_note.trim().slice(0, 500)}`;
  }

  if (!Object.keys(updates).length) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("remediation_items")
    .update(updates)
    .eq("id", item.id)
    .select("escalation_status")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const activityRows: Array<{
    remediation_id: string;
    user_id:        string;
    action:         string;
    detail:         string;
  }> = [{
    remediation_id: item.id,
    user_id:        actorId,
    action:         "escalation_update",
    detail:         activityDetail,
  }];

  if (response_note?.trim()) {
    const fromEmail = item.escalation_email?.trim() || actorId;
    activityRows.push({
      remediation_id: item.id,
      user_id:        fromEmail,
      action:         ESCALATION_EMAIL_REPLY_ACTION,
      detail:         JSON.stringify({
        source:     "escalation_form",
        from_email: fromEmail,
        from_name:  item.escalation_recipient_name ?? null,
        subject:    null,
        body:       response_note.trim(),
      }),
    });
  }

  await supabase.from("remediation_activity").insert(activityRows);

  if (response_note?.trim()) {
    const threadItem = await loadEscalationById(supabase, item.id);
    if (threadItem) {
      try {
        await notifyAssigneesOfRecipientReply(threadItem, {
          fromName:  item.escalation_recipient_name ?? null,
          fromEmail: item.escalation_email?.trim() || actorId,
          body:      response_note.trim(),
          source:    "form",
        });
      } catch (err) {
        console.warn("[escalation] assignee notification failed", err);
      }
    }
  }

  return Response.json({ escalation_status: data.escalation_status });
}
