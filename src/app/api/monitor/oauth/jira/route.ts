// Atlassian OAuth 2.0 (3LO) authorization code flow.

import { auth } from "@clerk/nextjs/server";
import { getActiveOrganizationId } from "@/lib/clerk-org";
import { APP_URL, createOAuthState } from "@/lib/monitoring-oauth";

const JIRA_CLIENT_ID = process.env.JIRA_CLIENT_ID || "";

export async function GET() {
  const { userId, orgId } = await auth();
  if (!userId) {
    return Response.redirect(`${APP_URL}/sign-in?redirect=/settings/monitoring`);
  }

  const activeOrgId = await getActiveOrganizationId(userId, orgId);
  if (!activeOrgId) {
    return Response.redirect(`${APP_URL}/settings/monitoring?error=missing_org`);
  }

  const state = createOAuthState(activeOrgId, userId, "jira");
  const redirectUri = `${APP_URL}/api/monitor/oauth/jira/callback`;

  const authUrl = new URL("https://auth.atlassian.com/authorize");
  authUrl.searchParams.set("audience", "api.atlassian.com");
  authUrl.searchParams.set("client_id", JIRA_CLIENT_ID);
  authUrl.searchParams.set("scope", "read:jira-work manage:jira-webhook offline_access");
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("prompt", "consent");

  return Response.redirect(authUrl.toString());
}
