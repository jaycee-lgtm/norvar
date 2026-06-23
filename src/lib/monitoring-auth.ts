import { auth, clerkClient } from "@clerk/nextjs/server";
import { getActiveOrganizationId } from "@/lib/clerk-org";

type OrgContext = { userId: string; orgId: string };
type OrgContextError = { error: Response };

const ADMIN_ROLES = new Set(["org:admin", "admin"]);

async function getMembershipRole(userId: string, orgId: string): Promise<string | null> {
  const client = await clerkClient();
  const { data } = await client.organizations.getOrganizationMembershipList({
    organizationId: orgId,
    userId:         [userId],
    limit:          1,
  });
  return data[0]?.role ?? null;
}

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

  if (requireAdmin) {
    const activeOrgRole = orgId === activeOrgId && orgRole
      ? orgRole
      : await getMembershipRole(userId, activeOrgId);
    if (!activeOrgRole || !ADMIN_ROLES.has(activeOrgRole)) {
      return { error: Response.json({ error: "Org admin access required" }, { status: 403 }) };
    }
  }

  return { userId, orgId: activeOrgId };
}

export function isOrgContextError(
  ctx: OrgContext | OrgContextError,
): ctx is OrgContextError {
  return "error" in ctx;
}
