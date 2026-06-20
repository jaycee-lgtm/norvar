// Exchanges the GitLab authorization code for tokens, then registers a webhook
// on accessible projects where the user is a maintainer or owner.

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { APP_URL, generateWebhookSecret, verifyOAuthState } from "@/lib/monitoring-oauth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const GITLAB_CLIENT_ID = process.env.GITLAB_CLIENT_ID || "";
const GITLAB_CLIENT_SECRET = process.env.GITLAB_CLIENT_SECRET || "";

type GitLabTokens = {
  access_token:  string;
  refresh_token?: string;
  expires_in?:   number;
};

type GitLabProject = {
  id:                  number;
  path_with_namespace: string;
};

async function exchangeCodeForToken(code: string, redirectUri: string): Promise<GitLabTokens> {
  const res = await fetch("https://gitlab.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id:     GITLAB_CLIENT_ID,
      client_secret: GITLAB_CLIENT_SECRET,
      code,
      grant_type:    "authorization_code",
      redirect_uri:  redirectUri,
    }),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json() as Promise<GitLabTokens>;
}

async function fetchAccessibleProjects(accessToken: string): Promise<GitLabProject[]> {
  const res = await fetch(
    "https://gitlab.com/api/v4/projects?membership=true&min_access_level=40&per_page=100",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!res.ok) return [];
  return res.json() as Promise<GitLabProject[]>;
}

async function registerProjectWebhook(
  accessToken: string,
  projectId: number,
  webhookSecret: string,
): Promise<boolean> {
  const webhookUrl = `${APP_URL}/api/monitor/gitlab`;
  const res = await fetch(`https://gitlab.com/api/v4/projects/${projectId}/hooks`, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url:                     webhookUrl,
      token:                   webhookSecret,
      push_events:             true,
      merge_requests_events:   true,
      enable_ssl_verification: true,
    }),
  });

  if (!res.ok) {
    console.error(`Failed to register GitLab webhook on project ${projectId}: ${res.status}`);
    return false;
  }

  return true;
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
  if (!state || state.provider !== "gitlab") {
    return Response.redirect(`${APP_URL}/settings/monitoring?error=invalid_state`);
  }

  try {
    const redirectUri = `${APP_URL}/api/monitor/oauth/gitlab/callback`;
    const tokens = await exchangeCodeForToken(code, redirectUri);
    const webhookSecret = generateWebhookSecret();
    const projects = await fetchAccessibleProjects(tokens.access_token);

    let registered = 0;
    for (const project of projects.slice(0, 50)) {
      const ok = await registerProjectWebhook(tokens.access_token, project.id, webhookSecret);
      if (ok) registered++;
    }

    const tokenExpiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const { error } = await supabase.from("monitoring_connectors").upsert({
      org_id:           state.orgId,
      provider:         "gitlab",
      installation_id:  `gitlab-${state.orgId}`,
      account_name:     projects[0]?.path_with_namespace?.split("/")[0] ?? "unknown",
      access_token:     tokens.access_token,
      refresh_token:    tokens.refresh_token ?? null,
      token_expires_at: tokenExpiresAt,
      watched_repos:    [],
      watched_branches: ["main", "master", "production"],
      webhook_secret:   webhookSecret,
      status:           registered > 0 ? "active" : "error",
      error_message:    registered === 0 ? "No webhooks could be registered - check project permissions" : null,
      connected_by:     state.userId,
      updated_at:       new Date().toISOString(),
    }, { onConflict: "org_id,provider,installation_id" });

    if (error) throw error;

    return Response.redirect(`${APP_URL}/settings/monitoring?connected=gitlab&projects=${registered}`);
  } catch (err) {
    console.error("GitLab OAuth callback error:", err);
    return Response.redirect(`${APP_URL}/settings/monitoring?error=oauth_failed`);
  }
}
