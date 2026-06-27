// GitHub webhook receiver — push and pull_request events.
// Verifies signature, extracts diff summary, classifies, notifies, persists.

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import {
  classifySignal,
  resolveNorvarUser,
  saveSignal,
  logWebhook,
  type SignalCandidate,
} from "@/lib/monitoring";
import { notifySignalRecipients } from "@/lib/monitoring-notify";
import {
  createGithubInstallationToken,
  getGithubInstallationAccessToken,
  githubWebhookSecretForStorage,
  resolveGithubWebhookSecret,
} from "@/lib/github-app";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function verifyGithubSignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

const SKIP_FILE_PATTERNS = [
  /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock\.yaml$/,
  /\.snap$/, /\.min\.js$/, /\.map$/,
  /^dist\//, /^build\//, /^node_modules\//,
];

function isLikelyRelevantFile(filename: string): boolean {
  return !SKIP_FILE_PATTERNS.some(p => p.test(filename));
}

async function fetchPRDiffSummary(
  accessToken: string,
  repoFullName: string,
  prNumber: number,
): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${repoFullName}/pulls/${prNumber}/files?per_page=100`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept:        "application/vnd.github+json",
    },
  });

  if (!res.ok) return "";

  const files = await res.json() as Array<{ filename: string; status: string; patch?: string; additions: number; deletions: number }>;
  const relevant = files.filter(f => isLikelyRelevantFile(f.filename));
  if (relevant.length === 0) return "";

  return relevant.slice(0, 20).map(f => {
    const patchPreview = f.patch ? f.patch.slice(0, 800) : "(no patch available — binary or large file)";
    return `--- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions}) ---\n${patchPreview}`;
  }).join("\n\n");
}

async function processSignal(candidate: SignalCandidate) {
  const classification = await classifySignal(candidate);

  if (classification.signal_kind === "none" || classification.severity === "none") {
    return { skipped: true, reason: "classified as non-compliance-relevant", classification };
  }

  const authorResolved = await resolveNorvarUser(candidate.orgId, candidate.provider, candidate.authorExternalId);
  const signalId = await saveSignal(candidate, classification, authorResolved);

  if (signalId) {
    await notifySignalRecipients(signalId, candidate, classification, authorResolved);
  }

  return { skipped: false, signalId, classification };
}

async function handlePullRequest(payload: Record<string, unknown>, orgId: string, connector: Record<string, unknown>) {
  const action = payload.action as string;
  if (!["opened", "synchronize", "ready_for_review", "reopened"].includes(action)) {
    return { skipped: true, reason: `action ${action} not classified` };
  }

  const pr = payload.pull_request as Record<string, unknown>;
  const repository = payload.repository as Record<string, unknown>;
  const repoFull = repository.full_name as string;
  const user = pr.user as Record<string, unknown>;
  const base = pr.base as Record<string, unknown>;
  const branch = base.ref as string;

  const watchedBranches = (connector.watched_branches as string[] | undefined) ?? ["main", "master", "production"];
  if (watchedBranches.length > 0 && !watchedBranches.includes(branch)) {
    return { skipped: true, reason: `branch ${branch} not watched` };
  }

  const diffSummary = await fetchPRDiffSummary(
    connector.access_token as string,
    repoFull,
    pr.number as number,
  );
  if (!diffSummary) {
    return { skipped: true, reason: "no relevant file changes" };
  }

  const candidate: SignalCandidate = {
    orgId:              orgId,
    provider:           "github",
    sourceType:         "pull_request",
    sourceUrl:          pr.html_url as string,
    sourceId:           String(pr.id),
    repoOrProject:      repoFull,
    authorExternalId:   user.login as string,
    authorExternalName: user.login as string,
    authorEmail:        null,
    title:              pr.title as string,
    contentExcerpt:     `PR: ${pr.title}\n${(pr.body as string | undefined) ?? ""}\n\n${diffSummary}`,
  };

  return processSignal(candidate);
}

async function handlePush(payload: Record<string, unknown>, orgId: string, connector: Record<string, unknown>) {
  const repository = payload.repository as Record<string, unknown>;
  const repoFull = repository.full_name as string;
  const branch = (payload.ref as string).replace("refs/heads/", "");

  const watchedBranches = (connector.watched_branches as string[] | undefined) ?? ["main", "master", "production"];
  if (watchedBranches.length > 0 && !watchedBranches.includes(branch)) {
    return { skipped: true, reason: `branch ${branch} not watched` };
  }

  const commits = (payload.commits as Array<Record<string, unknown>> | undefined) ?? [];
  if (commits.length === 0) return { skipped: true, reason: "no commits" };

  const changedFiles = new Set<string>();
  for (const c of commits) {
    [...((c.added as string[] | undefined) ?? []), ...((c.modified as string[] | undefined) ?? [])]
      .forEach(f => changedFiles.add(f));
  }
  const relevantFiles = [...changedFiles].filter(isLikelyRelevantFile);
  if (relevantFiles.length === 0) return { skipped: true, reason: "no relevant file changes" };

  const before = payload.before as string;
  const after = payload.after as string;
  let diffSummary = "";
  try {
    const res = await fetch(`https://api.github.com/repos/${repoFull}/compare/${before}...${after}`, {
      headers: { Authorization: `Bearer ${connector.access_token}`, Accept: "application/vnd.github+json" },
    });
    if (res.ok) {
      const data = await res.json();
      diffSummary = ((data.files ?? []) as Array<{ filename: string; patch?: string }>)
        .filter(f => isLikelyRelevantFile(f.filename))
        .slice(0, 20)
        .map(f => `--- ${f.filename} ---\n${(f.patch ?? "").slice(0, 800)}`)
        .join("\n\n");
    }
  } catch {
    // compare API optional — commit messages still available
  }

  const commitMessages = commits.map(c => `- ${c.message}`).join("\n");
  const pusher = payload.pusher as Record<string, unknown> | undefined;

  const candidate: SignalCandidate = {
    orgId:              orgId,
    provider:           "github",
    sourceType:         "push",
    sourceUrl:          `https://github.com/${repoFull}/compare/${before}...${after}`,
    sourceId:           after,
    repoOrProject:      repoFull,
    authorExternalId:   (pusher?.email as string | undefined) ?? (pusher?.name as string | undefined) ?? "unknown",
    authorExternalName: (pusher?.name as string | undefined) ?? "unknown",
    authorEmail:        (pusher?.email as string | undefined) ?? null,
    title:              `Push to ${branch}: ${commits.length} commit(s)`,
    contentExcerpt:     `Commits:\n${commitMessages}\n\n${diffSummary}`,
  };

  return processSignal(candidate);
}

async function bootstrapGithubInstallation(
  installationId: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const installation = payload.installation as Record<string, unknown>;
  const account = installation.account as Record<string, unknown>;
  const accountLogin = account.login as string;

  const { data: session } = await supabase
    .from("monitoring_oauth_sessions")
    .select("*")
    .eq("provider", "github")
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    return { bootstrapped: false, reason: "no pending OAuth session — reconnect from Norvar Settings" };
  }

  const token = await createGithubInstallationToken(Number(installationId));
  const row = {
    org_id:           session.org_id,
    provider:         "github",
    installation_id:  installationId,
    access_token:     token.token,
    token_expires_at: token.expires_at,
    webhook_secret:   githubWebhookSecretForStorage(),
    account_name:     accountLogin,
    watched_repos:    [],
    watched_projects: [],
    watched_branches: ["main", "master", "production"],
    status:           "active",
    connected_by:     session.user_id,
    error_message:    null,
    updated_at:       new Date().toISOString(),
  };

  const { error } = await supabase
    .from("monitoring_connectors")
    .upsert(row, { onConflict: "org_id,provider,installation_id" });

  if (error) throw new Error(error.message);

  await supabase
    .from("monitoring_oauth_sessions")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", session.id);

  return { bootstrapped: true, orgId: session.org_id, account: accountLogin };
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  const event = req.headers.get("x-github-event");
  const deliveryId = req.headers.get("x-github-delivery");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const repository = payload.repository as Record<string, unknown> | undefined;
  const repoFullName = repository?.full_name as string | undefined;
  const installation = payload.installation as Record<string, unknown> | undefined;
  const installationId = installation?.id ? String(installation.id) : null;

  let { data: connector } = await supabase
    .from("monitoring_connectors")
    .select("*")
    .eq("provider", "github")
    .eq("installation_id", installationId ?? "")
    .maybeSingle();

  const webhookSecret = resolveGithubWebhookSecret(connector?.webhook_secret as string | undefined);

  if (!webhookSecret) {
    await logWebhook("github", connector?.org_id ?? null, event ?? "unknown", payload, false, "Webhook secret not configured");
    return Response.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  if (!verifyGithubSignature(rawBody, signature, webhookSecret)) {
    await logWebhook("github", connector?.org_id ?? null, event ?? "unknown", payload, false, "Signature verification failed");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  if (event === "ping") {
    await logWebhook("github", connector?.org_id ?? null, "ping", { deliveryId, zen: payload.zen }, true);
    return Response.json({ ok: true, ping: true });
  }

  if (!connector && event === "installation" && installationId) {
    const action = payload.action as string;
    if (action === "created" || action === "new_permissions_accepted") {
      try {
        const bootstrap = await bootstrapGithubInstallation(installationId, payload);
        await logWebhook("github", (bootstrap.orgId as string | undefined) ?? null, event ?? "installation", { deliveryId, bootstrap }, true);
        return Response.json({ ok: true, ...bootstrap });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Installation bootstrap failed";
        await logWebhook("github", null, event ?? "installation", payload, false, message);
        return Response.json({ error: message }, { status: 500 });
      }
    }
    await logWebhook("github", null, event ?? "installation", { deliveryId, action }, true);
    return Response.json({ ok: true, skipped: true, reason: `installation action ${action} ignored` });
  }

  if (!connector) {
    await logWebhook("github", null, event ?? "unknown", payload, false, "No matching connector found");
    return Response.json({ error: "Connector not configured" }, { status: 404 });
  }

  try {
    connector.access_token = await getGithubInstallationAccessToken({
      id:               connector.id,
      org_id:           connector.org_id,
      installation_id:  connector.installation_id,
      access_token:     connector.access_token,
      token_expires_at: connector.token_expires_at,
    });
  } catch (tokenErr) {
    const message = tokenErr instanceof Error ? tokenErr.message : "Token refresh failed";
    await logWebhook("github", connector.org_id, event ?? "unknown", payload, false, message);
    return Response.json({ error: message }, { status: 502 });
  }

  const watchedRepos = (connector.watched_repos as string[] | undefined) ?? [];
  if (watchedRepos.length > 0 && repoFullName && !watchedRepos.includes(repoFullName)) {
    return Response.json({ skipped: true, reason: "repo not watched" });
  }

  try {
    let result: Record<string, unknown>;
    if (event === "pull_request") {
      result = await handlePullRequest(payload, connector.org_id, connector);
    } else if (event === "push") {
      result = await handlePush(payload, connector.org_id, connector);
    } else {
      result = { skipped: true, reason: `event type ${event} not handled` };
    }

    await supabase
      .from("monitoring_connectors")
      .update({ last_event_at: new Date().toISOString(), status: "active" })
      .eq("id", connector.id);

    await logWebhook("github", connector.org_id, event ?? "unknown", { deliveryId, result }, true);

    return Response.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logWebhook("github", connector.org_id, event ?? "unknown", payload, false, message);
    console.error("GitHub webhook processing error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, provider: "github", status: "ready" });
}
