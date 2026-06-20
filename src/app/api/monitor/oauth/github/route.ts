// Initiates the GitHub App installation flow.
//
// GitHub monitoring uses a GitHub App rather than plain OAuth because webhooks
// need repo-level push/PR events and installation permissions.

import { auth } from "@clerk/nextjs/server";
import { getActiveOrganizationId } from "@/lib/clerk-org";
import { APP_URL, createOAuthState } from "@/lib/monitoring-oauth";

const GITHUB_APP_SLUG = process.env.GITHUB_APP_SLUG || "norvar-monitoring";

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) {
    return Response.redirect(`${APP_URL}/sign-in?redirect=/settings/monitoring`);
  }

  const activeOrgId = await getActiveOrganizationId(userId, orgId);
  if (!activeOrgId) {
    return Response.redirect(`${APP_URL}/settings/monitoring?error=missing_org`);
  }

  const state = createOAuthState(activeOrgId, userId, "github");
  const installUrl = `https://github.com/apps/${GITHUB_APP_SLUG}/installations/new?state=${encodeURIComponent(state)}`;

  return Response.redirect(installUrl);
}
