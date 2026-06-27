import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import {
  createGithubInstallationToken,
  fetchGithubInstallation,
  githubWebhookSecret,
} from "@/lib/github-app";
import { appBaseUrl, verifyMonitoringOAuthState } from "@/lib/monitoring-oauth-state";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function redirectSettings(base: string, params: Record<string, string>) {
  const url = new URL("/settings", base);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url);
}

export async function GET(req: NextRequest) {
  const base = appBaseUrl(req.nextUrl.host);
  const { searchParams } = req.nextUrl;

  const installationIdRaw = searchParams.get("installation_id");
  const setupAction       = searchParams.get("setup_action");
  const stateToken        = searchParams.get("state");

  if (!installationIdRaw) {
    return redirectSettings(base, { monitor_error: "Missing GitHub installation_id" });
  }

  const installationId = Number(installationIdRaw);
  if (!Number.isFinite(installationId)) {
    return redirectSettings(base, { monitor_error: "Invalid GitHub installation_id" });
  }

  if (!stateToken) {
    return redirectSettings(base, { monitor_error: "Missing OAuth state" });
  }

  const state = verifyMonitoringOAuthState(stateToken);
  if (!state) {
    return redirectSettings(base, { monitor_error: "OAuth state expired or invalid — try connecting again" });
  }

  const { userId } = await auth();
  if (!userId || userId !== state.userId) {
    const signIn = new URL("/sign-in", base);
    signIn.searchParams.set("redirect_url", req.nextUrl.toString());
    return NextResponse.redirect(signIn);
  }

  if (setupAction === "request") {
    return redirectSettings(base, { monitor_info: "Complete the GitHub App installation to finish connecting" });
  }

  try {
    const [installation, token] = await Promise.all([
      fetchGithubInstallation(installationId),
      createGithubInstallationToken(installationId),
    ]);

    await supabase
      .from("monitoring_connectors")
      .delete()
      .eq("org_id", state.orgId)
      .eq("provider", "github")
      .neq("installation_id", String(installationId));

    const row = {
      org_id:           state.orgId,
      provider:         "github",
      installation_id:  String(installationId),
      access_token:     token.token,
      token_expires_at: token.expires_at,
      webhook_secret:   githubWebhookSecret(),
      account_name:     installation.account.login,
      watched_repos:    [],
      watched_projects: [],
      watched_branches: ["main", "master", "production"],
      status:           "active",
      connected_by:     state.userId,
      error_message:    null,
      updated_at:       new Date().toISOString(),
    };

    const { error } = await supabase
      .from("monitoring_connectors")
      .upsert(row, { onConflict: "org_id,provider,installation_id" });

    if (error) throw new Error(error.message);

    return redirectSettings(base, {
      monitor_connected: "github",
      monitor_account:   installation.account.login,
    });
  } catch (err: unknown) {
    console.error("GitHub OAuth callback failed:", err);
    const message = err instanceof Error ? err.message : "Failed to connect GitHub";
    return redirectSettings(base, { monitor_error: message });
  }
}
