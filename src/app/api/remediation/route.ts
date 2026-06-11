import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { findUserByEmail, resolveUserProfiles } from "@/lib/clerk-users";
import { getActiveOrganizationId, isOrgMember } from "@/lib/clerk-org";
import { gapKeyFromTitle } from "@/lib/gap-chat";
import { sortBySeverity } from "@/lib/remediation";

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
  assigned_to: string[] | null;
  created_by: string;
  created_at: string;
  assessments?: { title: string; assessment_number: string | null } | null;
};

function canManageItem(item: { created_by: string; assigned_to: string[] | null }, userId: string) {
  return item.created_by === userId || (item.assigned_to ?? []).includes(userId);
}

async function assertCanAssign(userId: string, orgId: string | null, targetUserId: string) {
  if (!orgId) return null;
  const ok = await isOrgMember(orgId, targetUserId);
  if (!ok) return "That user is not in your organization";
  return null;
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
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assessment_id  = searchParams.get("assessment_id");
  const project_number = searchParams.get("project_number");
  const status         = searchParams.get("status");
  const mine           = searchParams.get("mine") === "true";

  let query = supabase
    .from("remediation_items")
    .select("*, remediation_activity(*), assessments(title, assessment_number)")
    .order("created_at", { ascending: false });

  if (mine) query = query.or(`created_by.eq.${userId},assigned_to.cs.{${userId}}`);
  if (assessment_id)  query = query.eq("assessment_id", assessment_id);
  if (project_number) query = query.eq("assessment_number", project_number);
  if (status)         query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const items = sortBySeverity((data ?? []).map(r => enrichItem(r as ItemRow)));
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
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

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
      gap_severity:      gap.severity,
      gap_domain:        gap.domain,
      gap_detail:        gap.detail,
      gap_frameworks:    gap.frameworks ?? [],
      remediation_steps: gap.remediation,
      messages:          priorMessages,
      assigned_to:       assigned_to?.length
                           ? Array.from(new Set([userId, ...assigned_to]))
                           : [userId],
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
    escalated_to, escalation_note, resolution_note, due_date,
  } = await req.json();

  const activeOrgId = await getActiveOrganizationId(userId, orgId);
  const projectScope = scope === "project" && assessment_id;

  // ── Project-wide assignee changes ─────────────────────────────────────────
  if (projectScope && (reassign_to || reassign_email || add_assignee || add_assignee_email)) {
    const { data: projectItems } = await supabase
      .from("remediation_items")
      .select("id, created_by, assigned_to")
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

    for (const item of projectItems) {
      let newAssignees = [...(item.assigned_to ?? [])];
      if (reassign_to || reassign_email) {
        newAssignees = [targetId];
      } else {
        newAssignees = Array.from(new Set([...newAssignees, targetId]));
      }
      await supabase.from("remediation_items").update({ assigned_to: newAssignees }).eq("id", item.id);
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

  const { data: current } = await supabase
    .from("remediation_items")
    .select("assigned_to, status, created_by")
    .eq("id", id)
    .single();
  if (!current) return Response.json({ error: "Not found" }, { status: 404 });

  const assigneeChange = assigned_to || add_assignee || remove_assignee
    || add_assignee_email || reassign_email || reassign_to;
  if (assigneeChange && !canManageItem(current, userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  let activityAction = "note_added";
  let activityDetail = "";

  if (status) {
    updates.status = status;
    activityAction = "status_changed";
    activityDetail = `Status changed to ${status.replace("_", " ")}`;
    if (status === "resolved") updates.resolved_at = new Date().toISOString();
    if (resolution_note) updates.resolution_note = resolution_note;
  }

  if (escalated_to) {
    updates.escalated_to    = escalated_to;
    updates.status          = "escalated";
    updates.escalation_note = escalation_note ?? null;
    activityAction          = "escalated";
    activityDetail          = `Escalated to ${escalated_to}`;
  }

  if (due_date !== undefined) updates.due_date = due_date;

  let newAssignees = [...(current.assigned_to ?? [])];

  if (reassign_to) {
    const denied = await assertCanAssign(userId, activeOrgId, reassign_to);
    if (denied) return Response.json({ error: denied }, { status: 403 });
    const profiles = await resolveUserProfiles([reassign_to]);
    newAssignees        = [reassign_to];
    activityAction      = "assigned";
    activityDetail      = `Reassigned to ${profiles[reassign_to]?.name ?? "assignee"}`;
    updates.assigned_to = newAssignees;
  } else if (reassign_email) {
    const profile = await findUserByEmail(reassign_email);
    if (!profile) return Response.json({ error: "No Norvar user found with that email" }, { status: 404 });
    const denied = await assertCanAssign(userId, activeOrgId, profile.id);
    if (denied) return Response.json({ error: denied }, { status: 403 });
    newAssignees        = [profile.id];
    activityAction      = "assigned";
    activityDetail      = `Reassigned to ${profile.name}`;
    updates.assigned_to = newAssignees;
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
      updates.assigned_to = newAssignees;
      if (!activityDetail) {
        activityAction = "assigned";
        activityDetail = "Assignees updated";
      }
    }
  }

  const { data, error } = await supabase
    .from("remediation_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (activityDetail) {
    await supabase.from("remediation_activity").insert({
      remediation_id: id,
      user_id:        userId,
      action:         activityAction,
      detail:         activityDetail,
    });
  }

  return Response.json({ item: data });
}

// DELETE — remove a remediation item
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return Response.json({ error: "ID required" }, { status: 400 });

  const { data: item } = await supabase
    .from("remediation_items")
    .select("created_by, assigned_to")
    .eq("id", id)
    .single();

  if (!item) return Response.json({ error: "Not found" }, { status: 404 });

  if (!canManageItem(item, userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await supabase.from("remediation_items").delete().eq("id", id);
  return Response.json({ ok: true });
}
