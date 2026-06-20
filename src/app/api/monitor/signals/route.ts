import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isOrgContextError, requireOrgContext } from "@/lib/monitoring-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SIGNAL_COLUMNS = [
  "id", "provider", "source_type", "source_url", "repo_or_project",
  "author_external_name", "title", "domains", "severity", "signal_kind",
  "summary", "gaps_identified", "frameworks_cited",
  "notified_admin", "notified_author", "notified_compliance",
  "user_dismissed", "user_marked_false_positive", "assessment_id",
  "assessment_triggered", "created_at",
].join(", ");

export async function GET(req: NextRequest) {
  const ctx = await requireOrgContext();
  if (isOrgContextError(ctx)) return ctx.error;

  const signalId = req.nextUrl.searchParams.get("signal");
  const severity = req.nextUrl.searchParams.get("severity");
  const domain = req.nextUrl.searchParams.get("domain");
  const requestedLimit = Number.parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 500)
    : 100;

  if (signalId) {
    const { data, error } = await supabase
      .from("monitoring_signals")
      .select(SIGNAL_COLUMNS)
      .eq("id", signalId)
      .eq("org_id", ctx.orgId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    return NextResponse.json({ signal: data });
  }

  let query = supabase
    .from("monitoring_signals")
    .select(SIGNAL_COLUMNS)
    .eq("org_id", ctx.orgId)
    .neq("severity", "none")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (severity) query = query.eq("severity", severity);
  if (domain) query = query.contains("domains", [domain]);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ signals: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireOrgContext();
  if (isOrgContextError(ctx)) return ctx.error;

  const body = await req.json();
  const { id, user_dismissed, user_marked_false_positive, assessment_id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (user_dismissed !== undefined)             updates.user_dismissed = user_dismissed;
  if (user_marked_false_positive !== undefined) updates.user_marked_false_positive = user_marked_false_positive;
  if (assessment_id !== undefined) {
    updates.assessment_id = assessment_id;
    updates.assessment_triggered = true;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const { error } = await supabase
    .from("monitoring_signals")
    .update(updates)
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
