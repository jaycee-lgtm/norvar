// Exchanges the Atlassian authorization code for tokens, resolves the Jira
// Cloud site, and registers a dynamic webhook for issue and comment events.

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { APP_URL, generateWebhookSecret, verifyOAuthState } from "@/lib/monitoring-oauth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const JIRA_CLIENT_ID = process.env.JIRA_CLIENT_ID || "";
const JIRA_CLIENT_SECRET = process.env.JIRA_CLIENT_SECRET || "";

type JiraTokens = {
  access_token:  string;
  refresh_token?: string;
  expires_in?:   number;
};

type JiraSite = {
  id:   string;
  name: string;
  url:  string;
};

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<JiraTokens> {
  const res = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type:    "authorization_code",
      client_id:     JIRA_CLIENT_ID,
      client_secret: JIRA_CLIENT_SECRET,
      code,
      redirect_uri:  redirectUri,
    }),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json() as Promise<JiraTokens>;
}

async function fetchAccessibleResources(accessToken: string): Promise<JiraSite[]> {
  const res = await fetch("https://api.atlassian.com/oauth/token/accessible-resources", {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  if (!res.ok) return [];
  return res.json() as Promise<JiraSite[]>;
}

async function fetchProjectKeys(accessToken: string, cloudId: string): Promise<string[]> {
  const res = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/search`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  if (!res.ok) return [];

  const data = await res.json() as { values?: Array<{ key?: string }> };
  return (data.values ?? [])
    .map(project => project.key)
    .filter((key): key is string => Boolean(key));
}

async function registerJiraWebhook(accessToken: string, cloudId: string): Promise<boolean> {
  const webhookUrl = `${APP_URL}/api/monitor/jira?cloudId=${encodeURIComponent(cloudId)}`;
  const res = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/webhook`, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept:         "application/json",
    },
    body: JSON.stringify({
      url: webhookUrl,
      webhooks: [
        { events: ["jira:issue_created", "jira:issue_updated"], jqlFilter: "project is not EMPTY" },
        { events: ["comment_created"], jqlFilter: "project is not EMPTY" },
      ],
    }),
  });

  return res.ok;
}

function accountNameForSite(site: JiraSite): string {
  try {
    return new URL(site.url).hostname.replace(/\.atlassian\.net$/, "");
  } catch {
    return site.name;
  }
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const stateToken = req.nextUrl.searchParams.get("state");
  const errorParam = req.nextUrl.searchParams.get("error");

  if (errorParam) {
    return Response.redirect(`${APP_URL}/settings/monitoring?error=${encodeURIComponent(errorParam)}`);
  }
  if (!code || !stateToken) {
    return Response.redirect(`${APP_URL}/settings/monitoring?error=missing_params`);
  }

  const state = verifyOAuthState(stateToken);
  if (!state || state.provider !== "jira") {
    return Response.redirect(`${APP_URL}/settings/monitoring?error=invalid_state`);
  }

  try {
    const redirectUri = `${APP_URL}/api/monitor/oauth/jira/callback`;
    const tokens = await exchangeCodeForToken(code, redirectUri);
    const resources = await fetchAccessibleResources(tokens.access_token);

    if (resources.length === 0) {
      return Response.redirect(`${APP_URL}/settings/monitoring?error=no_jira_sites`);
    }

    const site = resources[0];
    const projectKeys = await fetchProjectKeys(tokens.access_token, site.id);
    const webhookRegistered = await registerJiraWebhook(tokens.access_token, site.id);
    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const { error } = await supabase.from("monitoring_connectors").upsert({
      org_id:           state.orgId,
      provider:         "jira",
      installation_id:  site.id,
      account_name:     accountNameForSite(site),
      access_token:     tokens.access_token,
      refresh_token:    tokens.refresh_token ?? null,
      token_expires_at: tokenExpiresAt,
      watched_projects: [],
      webhook_secret:   generateWebhookSecret(),
      status:           webhookRegistered ? "active" : "error",
      error_message:    webhookRegistered ? null : "Webhook registration failed - check app permissions",
      connected_by:     state.userId,
      updated_at:       new Date().toISOString(),
    }, { onConflict: "org_id,provider,installation_id" });

    if (error) throw error;

    return Response.redirect(`${APP_URL}/settings/monitoring?connected=jira&projects=${projectKeys.length}`);
  } catch (err) {
    console.error("Jira OAuth callback error:", err);
    return Response.redirect(`${APP_URL}/settings/monitoring?error=oauth_failed`);
  }
}
