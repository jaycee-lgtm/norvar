import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isOrgContextError, requireOrgContext } from "@/lib/monitoring-auth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET() {
  const ctx = await requireOrgContext(true);
  if (isOrgContextError(ctx)) return ctx.error;

  const { data } = await supabase
    .from("monitoring_connectors")
    .select("id, provider, account_name, watched_repos, watched_projects, watched_branches, status, last_event_at")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ connectors: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const ctx = await requireOrgContext(true);
  if (isOrgContextError(ctx)) return ctx.error;

  const { id, watched_repos, watched_projects, watched_branches } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (watched_repos !== undefined)    updates.watched_repos = watched_repos;
  if (watched_projects !== undefined) updates.watched_projects = watched_projects;
  if (watched_branches !== undefined) updates.watched_branches = watched_branches;

  const { error } = await supabase
    .from("monitoring_connectors")
    .update(updates)
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireOrgContext(true);
  if (isOrgContextError(ctx)) return ctx.error;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("monitoring_connectors")
    .update({ status: "disconnected", access_token: null, refresh_token: null })
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
