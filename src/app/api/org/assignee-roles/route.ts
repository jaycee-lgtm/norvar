import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getActiveOrganizationId } from "@/lib/clerk-org";
import { mergeOrgAssigneeRoles } from "@/lib/org-assignee-roles";
import {
  getOrgAssigneeRoles,
  updateOrgAssigneeRoles,
} from "@/lib/org-assignee-roles-server";

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const activeOrgId = await getActiveOrganizationId(userId, orgId);
  if (!activeOrgId) {
    return NextResponse.json({ roles: {}, organization: null });
  }

  try {
    const roles = await getOrgAssigneeRoles(activeOrgId);
    return NextResponse.json({ roles, organization: { id: activeOrgId } });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load gap owner roles";
    const status = message.includes("org_assignee_roles") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const activeOrgId = await getActiveOrganizationId(userId, orgId);
  if (!activeOrgId) {
    return NextResponse.json({ error: "Select an organization first" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const roles = mergeOrgAssigneeRoles(
    (body && typeof body === "object" && "roles" in body) ? (body as { roles: unknown }).roles : body,
  );

  try {
    const saved = await updateOrgAssigneeRoles(activeOrgId, roles);
    return NextResponse.json({ roles: saved });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to save gap owner roles";
    const status = message.includes("org_assignee_roles") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
