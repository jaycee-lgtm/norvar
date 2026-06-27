import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isOrgContextError, requireOrgContext } from "@/lib/monitoring-auth";
import { appBaseUrl, createMonitoringOAuthState } from "@/lib/monitoring-oauth-state";
import { githubAppInstallUrl } from "@/lib/github-app";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: NextRequest) {
  const ctx = await requireOrgContext(true);
  if (isOrgContextError(ctx)) return ctx.error;

  try {
    const state = createMonitoringOAuthState(ctx.orgId, ctx.userId);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    const { error: sessionErr } = await supabase.from("monitoring_oauth_sessions").insert({
      org_id:      ctx.orgId,
      user_id:     ctx.userId,
      provider:    "github",
      state_token: state,
      expires_at:  expiresAt,
    });
    if (sessionErr) {
      console.warn("monitoring_oauth_sessions insert skipped:", sessionErr.message);
    }

    const installUrl = githubAppInstallUrl(state);
    return NextResponse.redirect(installUrl);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "GitHub App is not configured";
    const base    = appBaseUrl(req.nextUrl.host);
    const url     = new URL("/settings", base);
    url.searchParams.set("monitor_error", message);
    return NextResponse.redirect(url);
  }
}
