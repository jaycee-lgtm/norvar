// GitHub redirects here after an org admin installs the GitHub App.
// The callback exchanges the installation for an access token and stores the
// connector used by the GitHub webhook receiver.

import crypto from "crypto";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { APP_URL, verifyOAuthState } from "@/lib/monitoring-oauth";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const GITHUB_APP_ID = process.env.GITHUB_APP_ID || "";
const GITHUB_APP_PRIVATE_KEY = (process.env.GITHUB_APP_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const GITHUB_APP_WEBHOOK_SECRET = process.env.GITHUB_APP_WEBHOOK_SECRET || "";

function base64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createAppJWT(): string {
  if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY) {
    throw new Error("GitHub App credentials are not configured");
  }

  const now = Math.floor(Date.now() / 1000);
  const encodedHeader = base64urlJson({ alg: "RS256", typ: "JWT" });
  const encodedPayload = base64urlJson({
    iat: now - 60,
    exp: now + 600,
    iss: GITHUB_APP_ID,
  });
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(signingInput), GITHUB_APP_PRIVATE_KEY)
    .toString("base64url");

  return `${signingInput}.${signature}`;
}

async function getInstallationAccessToken(
  installationId: string,
): Promise<{ token: string; expiresAt: string | null }> {
  const appJwt = createAppJWT();
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${appJwt}`,
      Accept:        "application/vnd.github+json",
    },
  });

  if (!res.ok) throw new Error(`Failed to get installation token: ${res.status}`);

  const data = await res.json() as { token?: string; expires_at?: string };
  if (!data.token) throw new Error("GitHub installation token response did not include a token");
  return { token: data.token, expiresAt: data.expires_at ?? null };
}

async function getInstallationDetails(installationId: string, accessToken: string) {
  const res = await fetch("https://api.github.com/installation/repositories?per_page=100", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept:        "application/vnd.github+json",
    },
  });

  if (!res.ok) return { accountName: `installation-${installationId}`, repos: [] as string[] };

  const data = await res.json() as {
    repositories?: Array<{
      full_name?: string;
      owner?: { login?: string };
    }>;
  };
  const repos = (data.repositories ?? [])
    .map(repo => repo.full_name)
    .filter((repo): repo is string => Boolean(repo));
  const accountName = data.repositories?.[0]?.owner?.login ?? `installation-${installationId}`;

  return { accountName, repos };
}

export async function GET(req: NextRequest) {
  const installationId = req.nextUrl.searchParams.get("installation_id");
  const setupAction = req.nextUrl.searchParams.get("setup_action");
  const stateToken = req.nextUrl.searchParams.get("state");

  if (!installationId || !stateToken) {
    return Response.redirect(`${APP_URL}/settings/monitoring?error=missing_params`);
  }

  const state = verifyOAuthState(stateToken);
  if (!state || state.provider !== "github") {
    return Response.redirect(`${APP_URL}/settings/monitoring?error=invalid_state`);
  }

  if (setupAction === "request") {
    return Response.redirect(`${APP_URL}/settings/monitoring?status=pending_approval`);
  }

  try {
    const { token, expiresAt } = await getInstallationAccessToken(installationId);
    const { accountName } = await getInstallationDetails(installationId, token);

    const { error } = await supabase.from("monitoring_connectors").upsert({
      org_id:           state.orgId,
      provider:         "github",
      installation_id:  installationId,
      account_name:     accountName,
      access_token:     token,
      token_expires_at: expiresAt,
      watched_repos:    [],
      watched_branches: ["main", "master", "production"],
      webhook_secret:   GITHUB_APP_WEBHOOK_SECRET,
      status:           "active",
      error_message:    null,
      connected_by:     state.userId,
      updated_at:       new Date().toISOString(),
    }, { onConflict: "org_id,provider,installation_id" });

    if (error) throw error;

    return Response.redirect(`${APP_URL}/settings/monitoring?connected=github`);
  } catch (err) {
    console.error("GitHub App installation callback error:", err);
    return Response.redirect(`${APP_URL}/settings/monitoring?error=installation_failed`);
  }
}
