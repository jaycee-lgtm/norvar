import { auth } from "@clerk/nextjs/server";
import { getActiveOrganizationId } from "@/lib/clerk-org";

type OrgContext = { userId: string; orgId: string };
type OrgContextError = { error: Response };

export async function requireOrgContext(
  requireAdmin = false,
): Promise<OrgContext | OrgContextError> {
  const { userId, orgId, orgRole } = await auth();
  if (!userId) {
    return { error: Response.json({ error: "Unauthorised" }, { status: 401 }) };
  }

  const activeOrgId = await getActiveOrganizationId(userId, orgId);
  if (!activeOrgId) {
    return { error: Response.json({ error: "Select an organization first" }, { status: 400 }) };
  }

  if (requireAdmin && orgRole && orgRole !== "org:admin" && orgRole !== "admin") {
    return { error: Response.json({ error: "Org admin access required" }, { status: 403 }) };
  }

  return { userId, orgId: activeOrgId };
}

export function isOrgContextError(
  ctx: OrgContext | OrgContextError,
): ctx is OrgContextError {
  return "error" in ctx;
}
