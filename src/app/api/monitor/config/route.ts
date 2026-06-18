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
    .from("org_monitoring_config")
    .select("*")
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  return NextResponse.json({
    config: data ?? {
      admin_email: "",
      privacy_contact_email: "",
      ai_governance_contact_email: "",
      cybersecurity_contact_email: "",
    },
  });
}

export async function PUT(req: NextRequest) {
  const ctx = await requireOrgContext(true);
  if (isOrgContextError(ctx)) return ctx.error;

  const body = await req.json();
  const {
    admin_email = "",
    privacy_contact_email = "",
    ai_governance_contact_email = "",
    cybersecurity_contact_email = "",
  } = body;

  const { error } = await supabase
    .from("org_monitoring_config")
    .upsert({
      org_id:                      ctx.orgId,
      admin_user_id:               ctx.userId,
      admin_email,
      privacy_contact_email,
      ai_governance_contact_email,
      cybersecurity_contact_email,
      updated_at:                  new Date().toISOString(),
    }, { onConflict: "org_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
