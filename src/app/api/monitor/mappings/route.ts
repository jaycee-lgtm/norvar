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
    .from("monitoring_user_mapping")
    .select("id, provider, external_id, external_name, norvar_email")
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false });

  return NextResponse.json({ mappings: data ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await requireOrgContext(true);
  if (isOrgContextError(ctx)) return ctx.error;

  const { provider, external_id, external_name, norvar_email } = await req.json();
  if (!provider || !external_id || !norvar_email) {
    return NextResponse.json({ error: "provider, external_id, and norvar_email are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("monitoring_user_mapping")
    .upsert({
      org_id:        ctx.orgId,
      provider,
      external_id,
      external_name,
      norvar_email,
      mapped_by:     ctx.userId,
    }, { onConflict: "org_id,provider,external_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireOrgContext(true);
  if (isOrgContextError(ctx)) return ctx.error;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error } = await supabase
    .from("monitoring_user_mapping")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
