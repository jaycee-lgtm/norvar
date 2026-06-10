import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

  // Filter to items the user created or is assigned to
  if (mine) query = query.or(`created_by.eq.${userId},assigned_to.cs.{${userId}}`);
  if (assessment_id) query = query.eq("assessment_id", assessment_id);
  if (status)        query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ items: data });
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
    // Auto-assign to the user who queued it; extend with any additional assignees
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

  // Log activity for each item
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
    escalated_to, escalation_note, resolution_note, due_date,
  } = await req.json();

  if (!id) return Response.json({ error: "ID required" }, { status: 400 });

  // Fetch current item
  const { data: current } = await supabase
    .from("remediation_items")
    .select("assigned_to, status")
    .eq("id", id)
    .single();
  if (!current) return Response.json({ error: "Not found" }, { status: 404 });

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

  // Multi-assignee management
  let newAssignees = [...(current.assigned_to ?? [])];
  if (assigned_to)     newAssignees = assigned_to;
  if (add_assignee)    newAssignees = Array.from(new Set([...newAssignees, add_assignee]));
  if (remove_assignee) newAssignees = newAssignees.filter((a: string) => a !== remove_assignee);
  if (assigned_to || add_assignee || remove_assignee) {
    updates.assigned_to = newAssignees;
    if (!activityDetail) { activityAction = "assigned"; activityDetail = "Assignees updated"; }
  }

  const { data, error } = await supabase
    .from("remediation_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Log activity
  await supabase.from("remediation_activity").insert({
    remediation_id: id,
    user_id:        userId,
    action:         activityAction,
    detail:         activityDetail,
  });

  return Response.json({ item: data });
}

// DELETE — remove a remediation item (and its activity log via cascade)
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return Response.json({ error: "ID required" }, { status: 400 });

  // Only creator or assignee can delete
  const { data: item } = await supabase
    .from("remediation_items")
    .select("created_by, assigned_to")
    .eq("id", id)
    .single();

  if (!item) return Response.json({ error: "Not found" }, { status: 404 });

  const canDelete = item.created_by === userId || (item.assigned_to ?? []).includes(userId);
  if (!canDelete) return Response.json({ error: "Forbidden" }, { status: 403 });

  await supabase.from("remediation_items").delete().eq("id", id);
  return Response.json({ ok: true });
}
