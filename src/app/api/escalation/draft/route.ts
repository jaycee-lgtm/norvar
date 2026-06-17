import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { getActiveOrganizationId } from "@/lib/clerk-org";
import {
  canViewRemediationItem,
  getOrgMemberIds,
} from "@/lib/remediation-access";
import { generateEscalationDraft } from "@/lib/escalation-draft";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { remediation_id, recipient_role } = await req.json();
  if (!remediation_id) {
    return Response.json({ error: "remediation_id required" }, { status: 400 });
  }

  const { data: item, error } = await supabase
    .from("remediation_items")
    .select(`
      id, created_by, assigned_to, gap_title, gap_severity, gap_domain, gap_detail,
      gap_frameworks, remediation_steps, project_title
    `)
    .eq("id", remediation_id)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!item) return Response.json({ error: "Remediation item not found" }, { status: 404 });

  const activeOrgId = await getActiveOrganizationId(userId, orgId);
  const orgMemberIds = await getOrgMemberIds(activeOrgId);
  if (!canViewRemediationItem(item, userId, orgMemberIds)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const draft = await generateEscalationDraft({
    gap_title:         item.gap_title,
    gap_severity:      item.gap_severity,
    gap_domain:        item.gap_domain,
    gap_detail:        item.gap_detail,
    gap_frameworks:    item.gap_frameworks ?? [],
    remediation_steps: item.remediation_steps,
    project_title:     item.project_title,
    recipient_role:    typeof recipient_role === "string" ? recipient_role : null,
  });

  return Response.json(draft);
}
