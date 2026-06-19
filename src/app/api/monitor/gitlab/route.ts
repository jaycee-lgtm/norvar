// GitLab webhook receiver — push and merge_request events.
// GitLab uses a static "Secret Token" header rather than HMAC signature.

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  classifySignal,
  resolveNorvarUser,
  saveSignal,
  logWebhook,
  type SignalCandidate,
} from "@/lib/monitoring";
import { notifySignalRecipients } from "@/lib/monitoring-notify";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SKIP_FILE_PATTERNS = [
  /package-lock\.json$/, /yarn\.lock$/, /pnpm-lock\.yaml$/,
  /\.snap$/, /\.min\.js$/, /\.map$/,
  /^dist\//, /^build\//, /^node_modules\//,
];

function hasWebhookSecret(secret: unknown): secret is string {
  return typeof secret === "string" && secret.trim().length > 0;
}

function isLikelyRelevantFile(filename: string): boolean {
  return !SKIP_FILE_PATTERNS.some(p => p.test(filename));
}

async function fetchMRDiffSummary(
  accessToken: string,
  projectId: number,
  mrIid: number,
): Promise<string> {
  const res = await fetch(
    `https://gitlab.com/api/v4/projects/${projectId}/merge_requests/${mrIid}/diffs?per_page=100`,
    { headers: { "PRIVATE-TOKEN": accessToken } },
  );
  if (!res.ok) return "";

  const diffs = await res.json() as Array<{ old_path: string; new_path: string; diff: string }>;
  const relevant = diffs.filter(d => isLikelyRelevantFile(d.new_path));
  if (relevant.length === 0) return "";

  return relevant.slice(0, 20).map(d =>
    `--- ${d.new_path} ---\n${(d.diff ?? "").slice(0, 800)}`,
  ).join("\n\n");
}

async function fetchCompareDiffSummary(
  accessToken: string,
  projectId: number,
  before: string,
  after: string,
): Promise<string> {
  const res = await fetch(
    `https://gitlab.com/api/v4/projects/${projectId}/repository/compare?from=${before}&to=${after}`,
    { headers: { "PRIVATE-TOKEN": accessToken } },
  );
  if (!res.ok) return "";

  const data = await res.json();
  const diffs = (data.diffs ?? []) as Array<{ old_path: string; new_path: string; diff: string }>;
  const relevant = diffs.filter(d => isLikelyRelevantFile(d.new_path));
  if (relevant.length === 0) return "";

  return relevant.slice(0, 20).map(d =>
    `--- ${d.new_path} ---\n${(d.diff ?? "").slice(0, 800)}`,
  ).join("\n\n");
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

async function handleMergeRequest(payload: Record<string, unknown>, orgId: string, connector: Record<string, unknown>) {
  const attrs = payload.object_attributes as Record<string, unknown>;
  const action = attrs.action as string;

  if (!["open", "update", "reopen"].includes(action)) {
    return { skipped: true, reason: `action ${action} not classified` };
  }

  const branch = attrs.target_branch as string;
  const watchedBranches = (connector.watched_branches as string[] | undefined) ?? ["main", "master", "production"];
  if (watchedBranches.length > 0 && !watchedBranches.includes(branch)) {
    return { skipped: true, reason: `branch ${branch} not watched` };
  }

  const project = payload.project as Record<string, unknown>;
  const user = payload.user as Record<string, unknown>;
  const diffSummary = await fetchMRDiffSummary(
    connector.access_token as string,
    project.id as number,
    attrs.iid as number,
  );
  if (!diffSummary) return { skipped: true, reason: "no relevant file changes" };

  const candidate: SignalCandidate = {
    orgId:              orgId,
    provider:           "gitlab",
    sourceType:         "merge_request",
    sourceUrl:          attrs.url as string,
    sourceId:           String(attrs.id),
    repoOrProject:      project.path_with_namespace as string,
    authorExternalId:   String(user.id),
    authorExternalName: (user.name as string | undefined) ?? (user.username as string),
    authorEmail:        (user.email as string | undefined) ?? null,
    title:              attrs.title as string,
    contentExcerpt:     `MR: ${attrs.title}\n${(attrs.description as string | undefined) ?? ""}\n\n${diffSummary}`,
  };

  return processSignal(candidate);
}

async function handlePush(payload: Record<string, unknown>, orgId: string, connector: Record<string, unknown>) {
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

  const project = payload.project as Record<string, unknown>;
  const diffSummary = await fetchCompareDiffSummary(
    connector.access_token as string,
    payload.project_id as number,
    payload.before as string,
    payload.after as string,
  );

  const commitMessages = commits.map(c => `- ${c.message}`).join("\n");

  const candidate: SignalCandidate = {
    orgId:              orgId,
    provider:           "gitlab",
    sourceType:         "push",
    sourceUrl:          `${project.web_url}/-/compare/${payload.before}...${payload.after}`,
    sourceId:           payload.after as string,
    repoOrProject:      project.path_with_namespace as string,
    authorExternalId:   String(payload.user_id),
    authorExternalName: payload.user_name as string,
    authorEmail:        (payload.user_email as string | undefined) ?? null,
    title:              `Push to ${branch}: ${commits.length} commit(s)`,
    contentExcerpt:     `Commits:\n${commitMessages}\n\n${diffSummary}`,
  };

  return processSignal(candidate);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const token = req.headers.get("x-gitlab-token");
  const event = req.headers.get("x-gitlab-event");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const project = payload.project as Record<string, unknown> | undefined;
  const projectPath = project?.path_with_namespace as string | undefined;

  if (!hasWebhookSecret(token)) {
    await logWebhook("gitlab", null, event ?? "unknown", payload, false, "Missing webhook token");
    return Response.json({ error: "Invalid token or connector not configured" }, { status: 401 });
  }

  const { data: connectors } = await supabase
    .from("monitoring_connectors")
    .select("*")
    .eq("provider", "gitlab")
    .eq("status", "active");

  const connector = (connectors ?? []).find(c =>
    hasWebhookSecret(c.webhook_secret) && c.webhook_secret === token,
  );

  if (!connector) {
    await logWebhook("gitlab", null, event ?? "unknown", payload, false, "No matching connector / invalid token");
    return Response.json({ error: "Invalid token or connector not configured" }, { status: 401 });
  }

  const watchedRepos = (connector.watched_repos as string[] | undefined) ?? [];
  if (watchedRepos.length > 0 && projectPath && !watchedRepos.includes(projectPath)) {
    return Response.json({ skipped: true, reason: "project not watched" });
  }

  try {
    let result: Record<string, unknown>;
    if (event === "Merge Request Hook") {
      result = await handleMergeRequest(payload, connector.org_id, connector);
    } else if (event === "Push Hook") {
      result = await handlePush(payload, connector.org_id, connector);
    } else {
      result = { skipped: true, reason: `event type ${event} not handled` };
    }

    await supabase
      .from("monitoring_connectors")
      .update({ last_event_at: new Date().toISOString(), status: "active" })
      .eq("id", connector.id);

    await logWebhook("gitlab", connector.org_id, event ?? "unknown", { result }, true);

    return Response.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logWebhook("gitlab", connector.org_id, event ?? "unknown", payload, false, message);
    console.error("GitLab webhook processing error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, provider: "gitlab", status: "ready" });
}
