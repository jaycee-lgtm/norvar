import { NextRequest, NextResponse } from "next/server";
import { isOrgContextError, requireOrgContext } from "@/lib/monitoring-auth";
import { appBaseUrl, createMonitoringOAuthState } from "@/lib/monitoring-oauth-state";
import { githubAppInstallUrl } from "@/lib/github-app";

export async function GET(req: NextRequest) {
  const ctx = await requireOrgContext(true);
  if (isOrgContextError(ctx)) return ctx.error;

  try {
    const state = createMonitoringOAuthState(ctx.orgId, ctx.userId);
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
