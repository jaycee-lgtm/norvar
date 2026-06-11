import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  getActiveOrganizationId,
  getOrganizationSummary,
  searchOrgMembers,
} from "@/lib/clerk-org";

export async function GET(req: NextRequest) {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const activeOrgId = await getActiveOrganizationId(userId, orgId);
  if (!activeOrgId) {
    return Response.json({ members: [], organization: null });
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const [members, organization] = await Promise.all([
    searchOrgMembers(activeOrgId, q),
    getOrganizationSummary(activeOrgId),
  ]);

  return Response.json({ members, organization });
}
