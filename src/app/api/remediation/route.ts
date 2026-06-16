import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { findUserByEmail, resolveUserProfiles } from "@/lib/clerk-users";
import { getActiveOrganizationId, isOrgMember } from "@/lib/clerk-org";
import {
  canViewRemediationItem,
  getOrgMemberIds,
  isMineRemediationItem,
  type RemediationAccessRow,
} from "@/lib/remediation-access";
import { gapKeyFromTitle } from "@/lib/gap-chat";
import { sortBySeverity } from "@/lib/remediation";
import { touchAssigneeMeta, type AssigneeMeta, ESCALATION_INBOX_SENT_ACTION, escalationInboxSentDetail } from "@/lib/escalation";
import { buildEscalationEmailText, escalationEmailSubject, sendEscalationEmail, type EscalationEmailPayload } from "@/lib/email";
import { rolesForAssignees } from "@/lib/org-assignee-roles-server";
import { normalizeGapSeverity } from "@/lib/risk-tiers";
import { splitRemediationSteps, buildStepItemsFromTexts, type RemediationStepItem } from "@/lib/remediation-steps";

function buildStepChecklist(text: string): RemediationStepItem[] {
  return buildStepItemsFromTexts(splitRemediationSteps(text), 0, () => randomUUID());
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type ItemRow = {
  id: string;
  assessment_id: string;
  assessment_number: string | null;
  project_title: string | null;
  gap_key: string | null;
  gap_title: string;
  gap_severity: string;
  gap_domain?: string;
  gap_detail?: string | null;
  assigned_to: string[] | null;
  created_by: string;
  created_at: string;
  assignee_meta?: AssigneeMeta | null;
  escalation_token?: string | null;
  escalation_email?: string | null;
  escalation_recipient_name?: string | null;
  escalation_role?: string | null;
  escalation_question?: string | null;
  escalation_note?: string | null;
  remediation_steps?: string | null;
  step_checklist?: RemediationStepItem[] | null;
  assessments?: { title: string; assessment_number: string | null } | null;
};

function canManageItem(item: { created_by: string; assigned_to: string[] | null }, userId: string) {
  return item.created_by === userId || (item.assigned_to ?? []).includes(userId);
}

async function canAccessRemediationItem(
  item: RemediationAccessRow,
  userId: string,
  orgId: string | null,
): Promise<boolean> {
  const orgMemberIds = await getOrgMemberIds(orgId);
  return canViewRemediationItem(item, userId, orgMemberIds);
}

async function loadRemediationItem(id: string) {
  const { data, error } = await supabase
    .from("remediation_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return { item: null as Record<string, unknown> | null, error: error.message };
  if (!data) return { item: null, error: "Remediation item not found" };
  return { item: data, error: null };
}

async function assertCanAssign(userId: string, orgId: string | null, targetUserId: string) {
  if (!orgId) return null;
  const ok = await isOrgMember(orgId, targetUserId);
  if (!ok) return "That user is not in your organization";
  return null;
}

async function buildEscalationEmailPayload(
  item: {
    gap_title: string;
    gap_severity: string;
    gap_domain: string;
    gap_detail?: string | null;
    project_title?: string | null;
    assessment_number?: string | null;
    assigned_to?: string[] | null;
    assignee_meta?: AssigneeMeta | null;
    escalation_token: string;
    escalation_email: string;
    escalation_recipient_name?: string | null;
    escalation_question?: string | null;
    escalation_note?: string | null;
  },
  escalatedByName: string,
): Promise<EscalationEmailPayload> {
  const assigneeIds = item.assigned_to ?? [];
  const profiles    = await resolveUserProfiles(assigneeIds);
  const meta        = item.assignee_meta ?? {};

  return {
    token:             item.escalation_token,
    assessmentNumber:  item.assessment_number,
    recipientEmail:    item.escalation_email,
    recipientName:   item.escalation_recipient_name,
    gapTitle:        item.gap_title,
    gapSeverity:     item.gap_severity,
    gapDomain:       item.gap_domain,
    gapDetail:       item.gap_detail,
    projectTitle:    item.project_title,
    question:        item.escalation_question,
    note:            item.escalation_note,
    assigneeNames:   assigneeIds.map(id => profiles[id]?.name ?? "Assignee"),
    assigneeRoles:   assigneeIds.map(id => meta[id]?.role ?? ""),
    escalatedByName,
  };
}

async function recordEscalationInboxSent(
  remediationId: string,
  userId: string,
  senderEmail: string,
  senderName: string,
  payload: EscalationEmailPayload,
) {
  await supabase.from("remediation_activity").insert({
    remediation_id: remediationId,
    user_id:        userId,
    action:         ESCALATION_INBOX_SENT_ACTION,
    detail:         escalationInboxSentDetail({
      from_email: senderEmail,
      from_name:  senderName,
      to_email:   payload.recipientEmail,
      subject:    escalationEmailSubject(payload),
      body:       buildEscalationEmailText(payload),
    }),
  });
}

function enrichItem(row: ItemRow) {
  const title = row.project_title ?? row.assessments?.title ?? null;
  const number = row.assessment_number ?? row.assessments?.assessment_number ?? null;
  const { assessments: _a, ...rest } = row;
  return {
    ...rest,
    project_title:     title,
    assessment_number: number,
    gap_key:           rest.gap_key ?? gapKeyFromTitle(rest.gap_title, rest.gap_severity),
  } as ItemRow & { project_title: string | null; assessment_number: string | null; gap_key: string };
}

// GET — list remediation items
export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const activeOrgId    = await getActiveOrganizationId(userId, orgId);
  const orgMemberIds   = await getOrgMemberIds(activeOrgId);
  const { searchParams } = new URL(req.url);
  const assessment_id  = searchParams.get("assessment_id");
  const project_number = searchParams.get("project_number");
  const status         = searchParams.get("status");
  const mine           = searchParams.get("mine") === "true";

  let query = supabase
    .from("remediation_items")
    .select("*, remediation_activity(*), assessments(title, assessment_number)")
    .order("created_at", { ascending: false });

  if (assessment_id)  query = query.eq("assessment_id", assessment_id);
  if (project_number) query = query.eq("assessment_number", project_number);
  if (status)         query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const visible = (data ?? []).filter(row => {
    const item = row as RemediationAccessRow;
    if (mine && !isMineRemediationItem(item, userId)) return false;
    return canViewRemediationItem(item, userId, orgMemberIds);
  });

  const items = sortBySeverity(visible.map(r => {
    const row = enrichItem(r as ItemRow) as ItemRow & {
      remediation_activity?: Array<{ created_at: string }>;
    };
    if (Array.isArray(row.remediation_activity)) {
      row.remediation_activity = [...row.remediation_activity].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
    }
    return row;
  }));
  const userIds = items.flatMap(i => [...(i.assigned_to ?? []), i.created_by]);
  const users   = await resolveUserProfiles(userIds);

  const projectMap = new Map<string, { id: string; title: string; number: string | null }>();
  for (const item of items) {
    if (!projectMap.has(item.assessment_id)) {
      projectMap.set(item.assessment_id, {
        id:     item.assessment_id,
        title:  item.project_title ?? "Untitled project",
        number: item.assessment_number,
      });
    }
  }
  const projects = [...projectMap.values()].sort((a, b) => a.title.localeCompare(b.title));

  return Response.json({ items, users, projects });
}

// POST — add gap(s) to remediation queue
export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const activeOrgId = await getActiveOrganizationId(userId, orgId);

  const { assessment_id, assessment_number, project_title, gaps, assigned_to, due_date } = await req.json();
  if (!assessment_id || !gaps?.length) {
    return Response.json({ error: "assessment_id and gaps required" }, { status: 400 });
  }

  const { data: assessment } = await supabase
    .from("assessments")
    .select("title, assessment_number, gap_chats")
    .eq("id", assessment_id)
    .single();

  const gapChats = (assessment?.gap_chats && typeof assessment.gap_chats === "object")
    ? assessment.gap_chats as Record<string, unknown[]>
    : {};

  const resolvedTitle  = project_title ?? assessment?.title ?? null;
  const resolvedNumber = assessment_number ?? assessment?.assessment_number ?? null;

  const assigneeIds = assigned_to?.length
    ? Array.from(new Set([userId, ...assigned_to]))
    : [userId];
  const defaultRoles = await rolesForAssignees(activeOrgId, assigneeIds);

  const items = gaps.map((gap: Record<string, unknown>) => {
    const gapKey = (gap.gap_key as string)
      ?? gapKeyFromTitle(String(gap.title), String(gap.severity));
    const priorMessages = Array.isArray(gapChats[gapKey]) ? gapChats[gapKey] : [];

    return {
      assessment_id,
      assessment_number: resolvedNumber,
      project_title:     resolvedTitle,
      gap_key:           gapKey,
      gap_title:         gap.title,
      gap_severity:      normalizeGapSeverity(String(gap.severity ?? "")),
      gap_domain:        gap.domain,
      gap_detail:        gap.detail,
      gap_frameworks:    gap.frameworks ?? [],
      remediation_steps: gap.remediation,
      messages:          priorMessages,
      assigned_to:       assigneeIds,
      assignee_meta:     touchAssigneeMeta({}, assigneeIds, defaultRoles),
      created_by:        userId,
      due_date:          due_date ?? null,
      status:            "open",
    };
  });

  const { data, error } = await supabase
    .from("remediation_items")
    .insert(items)
    .select();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  await supabase.from("remediation_activity").insert(
    data.map((item: { id: string }) => ({
      remediation_id: item.id,
      user_id:        userId,
      action:         "opened",
      detail:         "Added to remediation queue",
    }))
  );

  return Response.json({ items: data });
}

// PATCH — update status, assignees (single gap or entire project), escalate, resolve
export async function PATCH(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const {
    id, assessment_id, scope,
    status, assigned_to, add_assignee, remove_assignee,
    add_assignee_email, reassign_email, reassign_to,
    escalation_email, escalation_role, escalation_question, escalation_note,
    escalation_status, assignee_role, assignee_id, renotify,
    resolution_note, due_date,
    init_step_checklist, step_id, step_completed,
    add_checklist_steps, delete_step_id,
  } = await req.json();

  const activeOrgId = await getActiveOrganizationId(userId, orgId);
  const projectScope = scope === "project" && assessment_id;

  // ── Project-wide assignee changes ─────────────────────────────────────────
  if (projectScope && (reassign_to || reassign_email || add_assignee || add_assignee_email)) {
    const { data: projectItems } = await supabase
      .from("remediation_items")
      .select("id, created_by, assigned_to, assignee_meta")
      .eq("assessment_id", assessment_id);

    if (!projectItems?.length) {
      return Response.json({ error: "No gaps found for this project" }, { status: 404 });
    }

    const canManage = projectItems.some(i => canManageItem(i, userId));
    if (!canManage) return Response.json({ error: "Forbidden" }, { status: 403 });

    let targetId: string | null = null;
    let targetName = "assignee";

    if (reassign_to) {
      const denied = await assertCanAssign(userId, activeOrgId, reassign_to);
      if (denied) return Response.json({ error: denied }, { status: 403 });
      targetId = reassign_to;
      const profiles = await resolveUserProfiles([reassign_to]);
      targetName = profiles[reassign_to]?.name ?? targetName;
    } else if (reassign_email) {
      const profile = await findUserByEmail(reassign_email);
      if (!profile) return Response.json({ error: "No Norvar user found with that email" }, { status: 404 });
      const denied = await assertCanAssign(userId, activeOrgId, profile.id);
      if (denied) return Response.json({ error: denied }, { status: 403 });
      targetId = profile.id;
      targetName = profile.name;
    } else if (add_assignee) {
      const denied = await assertCanAssign(userId, activeOrgId, add_assignee);
      if (denied) return Response.json({ error: denied }, { status: 403 });
      targetId = add_assignee;
      const profiles = await resolveUserProfiles([add_assignee]);
      targetName = profiles[add_assignee]?.name ?? targetName;
    } else if (add_assignee_email) {
      const profile = await findUserByEmail(add_assignee_email);
      if (!profile) return Response.json({ error: "No Norvar user found with that email" }, { status: 404 });
      const denied = await assertCanAssign(userId, activeOrgId, profile.id);
      if (denied) return Response.json({ error: denied }, { status: 403 });
      targetId = profile.id;
      targetName = profile.name;
    }

    if (!targetId) return Response.json({ error: "Invalid assignee" }, { status: 400 });

    const projectDefaultRoles = await rolesForAssignees(activeOrgId, [targetId]);

    for (const item of projectItems) {
      let newAssignees = [...(item.assigned_to ?? [])];
      if (reassign_to || reassign_email) {
        newAssignees = [targetId];
      } else {
        newAssignees = Array.from(new Set([...newAssignees, targetId]));
      }
      const assignee_meta = touchAssigneeMeta(
        (item.assignee_meta as AssigneeMeta) ?? {},
        newAssignees,
        projectDefaultRoles,
      );
      await supabase.from("remediation_items").update({ assigned_to: newAssignees, assignee_meta }).eq("id", item.id);
      await supabase.from("remediation_activity").insert({
        remediation_id: item.id,
        user_id:        userId,
        action:         "assigned",
        detail:         reassign_to || reassign_email
          ? `Project reassigned to ${targetName}`
          : `Added ${targetName} to project`,
      });
    }

    return Response.json({ ok: true, updated: projectItems.length });
  }

  if (!id) return Response.json({ error: "ID required" }, { status: 400 });

  const { item: loaded, error: loadError } = await loadRemediationItem(id);
  if (loadError || !loaded) {
    return Response.json({ error: loadError ?? "Remediation item not found" }, { status: loadError === "Remediation item not found" ? 404 : 500 });
  }
  const current = loaded as {
    assigned_to: string[] | null;
    status: string;
    created_by: string;
    assignee_meta: AssigneeMeta | null;
    gap_title: string;
    gap_severity: string;
    gap_domain: string;
    gap_detail: string | null;
    project_title: string | null;
    assessment_number: string | null;
    escalation_token: string | null;
    escalation_email: string | null;
    escalation_recipient_name: string | null;
    escalation_role: string | null;
    escalation_question: string | null;
    escalation_note: string | null;
    remediation_steps: string | null;
    step_checklist: RemediationStepItem[] | null;
  };

  const canManage = async () => canAccessRemediationItem(current, userId, activeOrgId);

  // ── Renotify escalation recipient ─────────────────────────────────────────
  if (renotify) {
    if (!(await canManage())) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (!current.escalation_email || !current.escalation_token) {
      return Response.json({ error: "This gap has not been escalated" }, { status: 400 });
    }

    const profiles = await resolveUserProfiles([userId]);
    const escalatedByName = profiles[userId]?.name ?? "A colleague";
    const emailPayload = await buildEscalationEmailPayload(
      {
        gap_title:        current.gap_title,
        gap_severity:     current.gap_severity,
        gap_domain:       current.gap_domain,
        gap_detail:       current.gap_detail,
        project_title:    current.project_title,
        assessment_number: current.assessment_number,
        assigned_to:      current.assigned_to,
        assignee_meta:    current.assignee_meta as AssigneeMeta,
        escalation_token: current.escalation_token,
        escalation_email: current.escalation_email,
        escalation_recipient_name: current.escalation_recipient_name,
        escalation_question: current.escalation_question,
        escalation_note:  current.escalation_note,
      },
      escalatedByName,
    );
    const emailResult = await sendEscalationEmail(emailPayload);

    await supabase
      .from("remediation_items")
      .update({ last_notified_at: new Date().toISOString() })
      .eq("id", id);

    await supabase.from("remediation_activity").insert({
      remediation_id: id,
      user_id:        userId,
      action:         "escalation_renotify",
      detail:         emailResult.ok
        ? `Reminder sent to ${current.escalation_email}`
        : `Renotify attempted — ${emailResult.error ?? "email failed"}`,
    });

    await recordEscalationInboxSent(
      id,
      userId,
      profiles[userId]?.email ?? userId,
      escalatedByName,
      emailPayload,
    );

    return Response.json({ ok: true, email_sent: emailResult.ok, email_error: emailResult.error });
  }

  const assigneeChange = assigned_to || add_assignee || remove_assignee
    || add_assignee_email || reassign_email || reassign_to;
  if (assigneeChange && !(await canManage())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (escalation_email && !(await canManage())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (escalation_status && !(await canManage())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if (status && !(await canManage())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  if ((init_step_checklist || step_id || add_checklist_steps || delete_step_id) && !(await canManage())) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  let activityAction = "note_added";
  let activityDetail = "";
  let escalationInboxSent: {
    payload:     EscalationEmailPayload;
    senderEmail: string;
    senderName:  string;
  } | null = null;

  if (init_step_checklist) {
    const existing = Array.isArray(current.step_checklist) ? current.step_checklist : [];
    if (existing.length > 0) {
      return Response.json({ error: "Checklist already exists for this gap" }, { status: 400 });
    }
    if (!current.remediation_steps?.trim()) {
      return Response.json({ error: "No remediation steps to add" }, { status: 400 });
    }
    const checklist = buildStepChecklist(current.remediation_steps);
    if (!checklist.length) {
      return Response.json({ error: "Could not parse remediation steps" }, { status: 400 });
    }
    updates.step_checklist = checklist;
    activityAction = "steps_queued";
    activityDetail = `Added ${checklist.length} remediation step${checklist.length === 1 ? "" : "s"} to checklist`;
    if (current.status === "open") updates.status = "in_progress";
  } else if (add_checklist_steps) {
    const texts = (Array.isArray(add_checklist_steps) ? add_checklist_steps : [])
      .map((t: unknown) => String(t).trim())
      .filter(Boolean);
    if (!texts.length) {
      return Response.json({ error: "No steps to add" }, { status: 400 });
    }
    const existing = Array.isArray(current.step_checklist) ? [...current.step_checklist] : [];
    const existingTexts = new Set(existing.map(s => s.text.toLowerCase()));
    const newItems = buildStepItemsFromTexts(
      texts.filter(t => !existingTexts.has(t.toLowerCase())),
      existing.length,
      () => randomUUID(),
    );
    if (!newItems.length) {
      return Response.json({ error: "These steps are already on the checklist" }, { status: 400 });
    }
    updates.step_checklist = [...existing, ...newItems];
    activityAction = "steps_queued";
    activityDetail = `Added ${newItems.length} step${newItems.length === 1 ? "" : "s"} from remediation advice`;
    if (current.status === "open") updates.status = "in_progress";
  } else if (delete_step_id) {
    const checklist = Array.isArray(current.step_checklist)
      ? current.step_checklist.filter(s => s.id !== delete_step_id)
      : [];
    if (checklist.length === (current.step_checklist?.length ?? 0)) {
      return Response.json({ error: "Step not found" }, { status: 404 });
    }
    const removed = (current.step_checklist as RemediationStepItem[]).find(s => s.id === delete_step_id);
    updates.step_checklist = checklist.map((s, i) => ({ ...s, order: i }));
    activityAction = "step_removed";
    activityDetail = removed
      ? `Removed step: ${removed.text.slice(0, 120)}${removed.text.length > 120 ? "…" : ""}`
      : "Removed remediation step";
  } else if (step_id) {
    const checklist = Array.isArray(current.step_checklist) ? [...current.step_checklist] : [];
    const idx = checklist.findIndex(s => s.id === step_id);
    if (idx < 0) return Response.json({ error: "Step not found" }, { status: 404 });

    const step = checklist[idx];
    if (step_completed) {
      checklist[idx] = {
        ...step,
        completed_at: new Date().toISOString(),
        completed_by: userId,
      };
      activityAction = "step_completed";
      activityDetail = `Completed: ${step.text.slice(0, 120)}${step.text.length > 120 ? "…" : ""}`;
      if (current.status === "open") updates.status = "in_progress";
    } else {
      checklist[idx] = {
        ...step,
        completed_at: null,
        completed_by: null,
      };
      activityAction = "step_reopened";
      activityDetail = `Reopened: ${step.text.slice(0, 120)}${step.text.length > 120 ? "…" : ""}`;
    }
    updates.step_checklist = checklist;
  }

  if (status) {
    if (status === "wont_fix") {
      return Response.json({ error: "Won't fix is not a supported status" }, { status: 400 });
    }
    updates.status = status;
    activityAction = "status_changed";
    activityDetail = `Status changed to ${status.replace("_", " ")}`;
    if (status === "resolved") updates.resolved_at = new Date().toISOString();
    if (resolution_note) updates.resolution_note = resolution_note;
  }

  if (escalation_email) {
    const email = String(escalation_email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: "Valid email required" }, { status: 400 });
    }

    const recipient   = await findUserByEmail(email);
    const token       = current.escalation_token ?? randomUUID();
    const profiles    = await resolveUserProfiles([userId]);
    const now         = new Date().toISOString();

    updates.status                    = "escalated";
    updates.escalation_email          = email;
    updates.escalation_recipient_name = recipient?.name ?? null;
    updates.escalation_recipient_user_id = recipient?.id ?? null;
    updates.escalation_role           = escalation_role?.trim() || null;
    updates.escalation_question       = escalation_question?.trim() || null;
    updates.escalation_note           = escalation_note?.trim() || null;
    updates.escalated_at              = now;
    updates.escalation_status         = "sent";
    updates.escalation_token          = token;
    updates.last_notified_at          = now;
    updates.escalated_to              = escalation_role?.trim() || email;

    activityAction = "escalated";
    activityDetail = `Escalated to ${recipient?.name ?? email}${escalation_role ? ` (${escalation_role})` : ""}`;

    const escalatedByName = profiles[userId]?.name ?? "A colleague";
    const emailPayload = await buildEscalationEmailPayload(
      {
        gap_title:        current.gap_title,
        gap_severity:     current.gap_severity,
        gap_domain:       current.gap_domain,
        gap_detail:       current.gap_detail,
        project_title:    current.project_title,
        assessment_number: current.assessment_number,
        assigned_to:      current.assigned_to,
        assignee_meta:    current.assignee_meta as AssigneeMeta,
        escalation_token: token,
        escalation_email: email,
        escalation_recipient_name: recipient?.name,
        escalation_question: escalation_question?.trim(),
        escalation_note:  escalation_note?.trim(),
      },
      escalatedByName,
    );
    const emailResult = await sendEscalationEmail(emailPayload);

    escalationInboxSent = {
      payload:     emailPayload,
      senderEmail: profiles[userId]?.email ?? userId,
      senderName:  escalatedByName,
    };

    if (!emailResult.ok) {
      activityDetail += emailResult.error ? ` — email: ${emailResult.error}` : "";
    }
  }

  if (escalation_status) {
    updates.escalation_status = escalation_status;
    activityAction            = "escalation_update";
    activityDetail            = `Escalation status set to ${escalation_status}`;
    if (escalation_status === "closed") updates.status = "in_progress";
  }

  if (assignee_role || assignee_id) {
    return Response.json(
      { error: "Gap owner roles can only be changed in Settings" },
      { status: 400 },
    );
  }

  if (due_date !== undefined) updates.due_date = due_date;

  let newAssignees = [...(current.assigned_to ?? [])];
  let assigneeDefaultRoles: Record<string, string> = {};

  const applyAssigneeMeta = (userIds: string[]) =>
    touchAssigneeMeta(
      (current.assignee_meta as AssigneeMeta) ?? {},
      userIds,
      assigneeDefaultRoles,
    );

  if (reassign_to) {
    const denied = await assertCanAssign(userId, activeOrgId, reassign_to);
    if (denied) return Response.json({ error: denied }, { status: 403 });
    const profiles = await resolveUserProfiles([reassign_to]);
    newAssignees        = [reassign_to];
    activityAction      = "assigned";
    activityDetail      = `Reassigned to ${profiles[reassign_to]?.name ?? "assignee"}`;
    assigneeDefaultRoles = await rolesForAssignees(activeOrgId, newAssignees);
    updates.assigned_to = newAssignees;
    updates.assignee_meta = applyAssigneeMeta(newAssignees);
  } else if (reassign_email) {
    const profile = await findUserByEmail(reassign_email);
    if (!profile) return Response.json({ error: "No Norvar user found with that email" }, { status: 404 });
    const denied = await assertCanAssign(userId, activeOrgId, profile.id);
    if (denied) return Response.json({ error: denied }, { status: 403 });
    newAssignees        = [profile.id];
    activityAction      = "assigned";
    activityDetail      = `Reassigned to ${profile.name}`;
    assigneeDefaultRoles = await rolesForAssignees(activeOrgId, newAssignees);
    updates.assigned_to = newAssignees;
    updates.assignee_meta = applyAssigneeMeta(newAssignees);
  } else {
    if (assigned_to) newAssignees = assigned_to;

    if (add_assignee) {
      if (newAssignees.includes(add_assignee)) {
        return Response.json({ error: "That person is already assigned" }, { status: 400 });
      }
      const denied = await assertCanAssign(userId, activeOrgId, add_assignee);
      if (denied) return Response.json({ error: denied }, { status: 403 });
      newAssignees = Array.from(new Set([...newAssignees, add_assignee]));
      const profiles = await resolveUserProfiles([add_assignee]);
      activityAction = "assigned";
      activityDetail = `Added ${profiles[add_assignee]?.name ?? "assignee"}`;
    }

    if (add_assignee_email) {
      const profile = await findUserByEmail(add_assignee_email);
      if (!profile) return Response.json({ error: "No Norvar user found with that email" }, { status: 404 });
      if (newAssignees.includes(profile.id)) {
        return Response.json({ error: `${profile.name} is already assigned` }, { status: 400 });
      }
      const denied = await assertCanAssign(userId, activeOrgId, profile.id);
      if (denied) return Response.json({ error: denied }, { status: 403 });
      newAssignees   = Array.from(new Set([...newAssignees, profile.id]));
      activityAction = "assigned";
      activityDetail = `Added ${profile.name}`;
    }

    if (remove_assignee) {
      if (newAssignees.length <= 1) {
        return Response.json({ error: "At least one assignee is required" }, { status: 400 });
      }
      const profiles = await resolveUserProfiles([remove_assignee]);
      newAssignees   = newAssignees.filter(a => a !== remove_assignee);
      activityAction = "assigned";
      activityDetail = `Removed ${profiles[remove_assignee]?.name ?? "assignee"}`;
    }

    if (assigned_to || add_assignee || add_assignee_email || remove_assignee) {
      assigneeDefaultRoles = await rolesForAssignees(activeOrgId, newAssignees);
      updates.assigned_to = newAssignees;
      updates.assignee_meta = applyAssigneeMeta(newAssignees);
      if (!activityDetail) {
        activityAction = "assigned";
        activityDetail = "Assignees updated";
      }
    }
  }

  if (updates.assigned_to && !updates.assignee_meta) {
    const userIds = updates.assigned_to as string[];
    const defaultRoles = await rolesForAssignees(activeOrgId, userIds);
    updates.assignee_meta = touchAssigneeMeta(
      (current.assignee_meta as AssigneeMeta) ?? {},
      userIds,
      defaultRoles,
    );
  }

  if (!Object.keys(updates).length) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("remediation_items")
    .update(updates)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Remediation item not found" }, { status: 404 });

  if (activityDetail) {
    await supabase.from("remediation_activity").insert({
      remediation_id: id,
      user_id:        userId,
      action:         activityAction,
      detail:         activityDetail,
    });
  }

  if (escalationInboxSent) {
    await recordEscalationInboxSent(
      id,
      userId,
      escalationInboxSent.senderEmail,
      escalationInboxSent.senderName,
      escalationInboxSent.payload,
    );
  }

  return Response.json({ item: data });
}

// DELETE — remove a remediation item
export async function DELETE(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return Response.json({ error: "ID required" }, { status: 400 });

  const { item: loaded, error: loadError } = await loadRemediationItem(id);
  if (loadError || !loaded) {
    return Response.json({ error: loadError ?? "Remediation item not found" }, { status: loadError === "Remediation item not found" ? 404 : 500 });
  }
  const item = loaded as { created_by: string; assigned_to: string[] | null };
  const activeOrgId = await getActiveOrganizationId(userId, orgId);

  if (!(await canAccessRemediationItem(item, userId, activeOrgId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await supabase.from("remediation_items").delete().eq("id", id);
  return Response.json({ ok: true });
}
