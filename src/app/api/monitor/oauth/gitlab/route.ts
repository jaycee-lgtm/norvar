// Standard OAuth2 authorization code flow for GitLab.

import { auth } from "@clerk/nextjs/server";
import { getActiveOrganizationId } from "@/lib/clerk-org";
import { APP_URL, createOAuthState } from "@/lib/monitoring-oauth";

const GITLAB_CLIENT_ID = process.env.GITLAB_CLIENT_ID || "";

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) {
    return Response.redirect(`${APP_URL}/sign-in?redirect=/settings/monitoring`);
  }

  const activeOrgId = await getActiveOrganizationId(userId, orgId);
  if (!activeOrgId) {
    return Response.redirect(`${APP_URL}/settings/monitoring?error=missing_org`);
  }

  const state = createOAuthState(activeOrgId, userId, "gitlab");
  const redirectUri = `${APP_URL}/api/monitor/oauth/gitlab/callback`;

  const authUrl = new URL("https://gitlab.com/oauth/authorize");
  authUrl.searchParams.set("client_id", GITLAB_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "api read_repository");
  authUrl.searchParams.set("state", state);

  return Response.redirect(authUrl.toString());
}
