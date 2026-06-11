import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { findUserByEmail, resolveUserProfiles } from "@/lib/clerk-users";
import { sortBySeverity } from "@/lib/remediation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function canManageItem(item: { created_by: string; assigned_to: string[] | null }, userId: string) {
  return item.created_by === userId || (item.assigned_to ?? []).includes(userId);
}

// GET — list remediation items (filter by status, assessment, assigned_to)
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assessment_id = searchParams.get("assessment_id");
  const status        = searchParams.get("status");
  const mine          = searchParams.get("mine") === "true";

  let query = supabase
    .from("remediation_items")
    .select("*, remediation_activity(*)")
    .order("created_at", { ascending: false });

  if (mine) query = query.or(`created_by.eq.${userId},assigned_to.cs.{${userId}}`);
  if (assessment_id) query = query.eq("assessment_id", assessment_id);
  if (status)        query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const items = sortBySeverity(data ?? []);
  const userIds = items.flatMap(i => [...(i.assigned_to ?? []), i.created_by]);
  const users   = await resolveUserProfiles(userIds);

  return Response.json({ items, users });
}

// POST — add gap(s) to remediation queue
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { assessment_id, assessment_number, gaps, assigned_to, due_date } = await req.json();
  if (!assessment_id || !gaps?.length) {
    return Response.json({ error: "assessment_id and gaps required" }, { status: 400 });
  }

  const items = gaps.map((gap: Record<string, unknown>) => ({
    assessment_id,
    assessment_number: assessment_number ?? null,
    gap_title:         gap.title,
    gap_severity:      gap.severity,
    gap_domain:        gap.domain,
    gap_detail:        gap.detail,
    gap_frameworks:    gap.frameworks ?? [],
    remediation_steps: gap.remediation,
    assigned_to:       assigned_to?.length
                         ? Array.from(new Set([userId, ...assigned_to]))
                         : [userId],
    created_by:        userId,
    due_date:          due_date ?? null,
    status:            "open",
  }));

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

// PATCH — update status, assignees, escalate, resolve
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const {
    id, status, assigned_to, add_assignee, remove_assignee,
    add_assignee_email, reassign_email,
    escalated_to, escalation_note, resolution_note, due_date,
  } = await req.json();

  if (!id) return Response.json({ error: "ID required" }, { status: 400 });

  const { data: current } = await supabase
    .from("remediation_items")
    .select("assigned_to, status, created_by")
    .eq("id", id)
    .single();
  if (!current) return Response.json({ error: "Not found" }, { status: 404 });

  const assigneeChange = assigned_to || add_assignee || remove_assignee
    || add_assignee_email || reassign_email;
  if (assigneeChange && !canManageItem(current, userId)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  let activityAction = "note_added";
  let activityDetail = "";

  if (status) {
    updates.status      = status;
    activityAction      = "status_changed";
    activityDetail      = `Status changed to ${status}`;
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

  if (reassign_email) {
    const profile = await findUserByEmail(reassign_email);
    if (!profile) return Response.json({ error: "No Norvar user found with that email" }, { status: 404 });
    newAssignees     = [profile.id];
    activityAction   = "assigned";
    activityDetail   = `Reassigned to ${profile.name}`;
    updates.assigned_to = newAssignees;
  } else {
    if (assigned_to) newAssignees = assigned_to;

    if (add_assignee) {
      newAssignees = Array.from(new Set([...newAssignees, add_assignee]));
      if (!activityDetail) {
        const profiles = await resolveUserProfiles([add_assignee]);
        activityAction = "assigned";
        activityDetail = `Added ${profiles[add_assignee]?.name ?? "assignee"}`;
      }
    }

    if (add_assignee_email) {
      const profile = await findUserByEmail(add_assignee_email);
      if (!profile) return Response.json({ error: "No Norvar user found with that email" }, { status: 404 });
      if (newAssignees.includes(profile.id)) {
        return Response.json({ error: `${profile.name} is already assigned` }, { status: 400 });
      }
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

// DELETE — remove a remediation item (and its activity log via cascade)
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
