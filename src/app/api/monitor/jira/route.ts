// Jira webhook receiver — issue created/updated events.

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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

function verifyJiraSignature(payload: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

function adfToText(node: unknown): string {
  if (!node) return "";
  if (typeof node === "string") return node;
  const n = node as Record<string, unknown>;
  if (n.type === "text") return (n.text as string | undefined) ?? "";

  const childText = ((n.content as unknown[] | undefined) ?? []).map(adfToText).join("");

  if (n.type === "paragraph" || n.type === "heading") return childText + "\n";
  if (n.type === "bulletList" || n.type === "orderedList") return childText;
  if (n.type === "listItem") return "- " + childText + "\n";

  return childText;
}

const REGULATED_KEYWORDS = [
  "personal data", "pii", "gdpr", "ccpa", "privacy policy", "consent", "cookie",
  "data subject", "data retention", "data deletion", "biometric", "facial recognition",
  "location data", "health data", "children", "minors", "tracking", "analytics pixel",
  "third-party data", "data sharing", "data export", "cross-border", "data residency",
  "ai model", "machine learning", "automated decision", "chatbot", "llm", "openai",
  "anthropic", "claude api", "gpt", "recommendation engine", "scoring algorithm",
  "ai act", "bias", "training data",
  "encryption", "authentication", "access control", "api key", "credentials",
  "vulnerability", "penetration test", "security audit", "incident response",
  "data breach", "audit log", "mfa", "sso integration",
];

function passesKeywordFilter(text: string): boolean {
  const lower = text.toLowerCase();
  return REGULATED_KEYWORDS.some(kw => lower.includes(kw));
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

async function handleIssueEvent(payload: Record<string, unknown>, orgId: string, connector: Record<string, unknown>) {
  const issue = payload.issue as Record<string, unknown>;
  const eventType = payload.webhookEvent as string;
  const fields = issue.fields as Record<string, unknown>;
  const project = fields.project as Record<string, unknown>;
  const projectKey = project.key as string;

  const watchedProjects = (connector.watched_projects as string[] | undefined) ?? [];
  if (watchedProjects.length > 0 && !watchedProjects.includes(projectKey)) {
    return { skipped: true, reason: `project ${projectKey} not watched` };
  }

  const title = (fields.summary as string | undefined) ?? "";
  const description = adfToText(fields.description);

  let commentText = "";
  if (eventType === "comment_created" && payload.comment) {
    commentText = adfToText((payload.comment as Record<string, unknown>).body);
  }

  const fullContent = [title, description, commentText].filter(Boolean).join("\n\n");

  if (!passesKeywordFilter(fullContent)) {
    return { skipped: true, reason: "no regulated keywords detected" };
  }

  const author = (fields.reporter as Record<string, unknown> | undefined) ?? (payload.user as Record<string, unknown> | undefined) ?? {};
  const accountName = connector.account_name as string | undefined;
  const browseUrl = accountName
    ? `https://${accountName}.atlassian.net/browse/${issue.key}`
    : "";

  const candidate: SignalCandidate = {
    orgId:              orgId,
    provider:           "jira",
    sourceType:         "jira_ticket",
    sourceUrl:          browseUrl,
    sourceId:           issue.id as string,
    repoOrProject:      projectKey,
    authorExternalId:   (author.accountId as string | undefined) ?? (author.emailAddress as string | undefined) ?? "unknown",
    authorExternalName: (author.displayName as string | undefined) ?? (author.emailAddress as string | undefined) ?? "unknown",
    authorEmail:        (author.emailAddress as string | undefined) ?? null,
    title,
    contentExcerpt:     fullContent,
  };

  return processSignal(candidate);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-norvar-jira-signature");

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const issue = payload.issue as Record<string, unknown> | undefined;
  const fields = issue?.fields as Record<string, unknown> | undefined;
  const project = fields?.project as Record<string, unknown> | undefined;
  const projectKey = project?.key as string | undefined;

  const { data: connectors } = await supabase
    .from("monitoring_connectors")
    .select("*")
    .eq("provider", "jira")
    .eq("status", "active");

  const connector = (connectors ?? []).find(c => {
    const watchedProjects = (c.watched_projects as string[] | undefined) ?? [];
    const watchesProject = watchedProjects.length === 0 || watchedProjects.includes(projectKey ?? "");
    const secret = c.webhook_secret;
    return watchesProject
      && typeof secret === "string"
      && secret.length > 0
      && verifyJiraSignature(rawBody, signature, secret);
  });

  if (!connector) {
    await logWebhook("jira", null, (payload.webhookEvent as string | undefined) ?? "unknown", payload, false, "No matching connector / invalid signature");
    return Response.json({ error: "Invalid signature or connector not configured" }, { status: 401 });
  }

  const eventType = payload.webhookEvent as string;
  if (!["jira:issue_created", "jira:issue_updated", "comment_created"].includes(eventType)) {
    return Response.json({ skipped: true, reason: `event ${eventType} not handled` });
  }

  try {
    const result = await handleIssueEvent(payload, connector.org_id, connector);

    await supabase
      .from("monitoring_connectors")
      .update({ last_event_at: new Date().toISOString(), status: "active" })
      .eq("id", connector.id);

    await logWebhook("jira", connector.org_id, eventType, { result }, true);

    return Response.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await logWebhook("jira", connector.org_id, eventType, payload, false, message);
    console.error("Jira webhook processing error:", err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ ok: true, provider: "jira", status: "ready" });
}
