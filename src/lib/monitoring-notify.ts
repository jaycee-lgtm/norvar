// Builds and sends the monitoring signal notification email.
// Sent to: org admin, repo/ticket owner (if mapped), and the relevant
// domain compliance contact — every signal, no severity gate (Phase 1).

import { createClient } from "@supabase/supabase-js";
import type { ClassificationResult, SignalCandidate, SignalDomain } from "@/lib/monitoring";
import { resolveComplianceContact } from "@/lib/monitoring";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://norvar.io";

// ─── DOMAIN LABELS ────────────────────────────────────────────────────────────

const DOMAIN_LABELS: Record<SignalDomain, string> = {
  privacy:       "Privacy",
  ai_governance: "AI Governance",
  cybersecurity: "Cybersecurity",
};

const DOMAIN_TEAM_LABELS: Record<SignalDomain, string> = {
  privacy:       "privacy compliance team",
  ai_governance: "AI compliance team",
  cybersecurity: "security compliance team",
};

// ─── HTML HELPERS ─────────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function severityColor(severity: string): string {
  return { high: "#A32D2D", medium: "#854F0B", low: "#3B6D11" }[severity] ?? "#6b5e55";
}

// ─── BUILD EMAIL ──────────────────────────────────────────────────────────────

export type MonitoringEmailPayload = {
  signalId:               string;
  orgId:                  string;
  provider:               string;
  sourceType:             string;
  sourceUrl:              string;
  repoOrProject:          string;
  title:                  string;
  authorName:             string;
  classification:         ClassificationResult;
  recipientEmail:         string;
  recipientRole:          "admin" | "author" | "compliance";
  complianceTeamNotified: boolean;
  complianceDomainLabel:  string | null;
};

export function buildMonitoringEmailSubject(payload: MonitoringEmailPayload): string {
  const sev = payload.classification.severity.toUpperCase();
  const kindLabel = {
    new_exposure:    "New exposure",
    regression:      "Regression detected",
    new_integration: "New integration",
    none:            "Signal",
  }[payload.classification.signal_kind];
  return `[Norvar Monitoring · ${sev}] ${kindLabel} — ${payload.repoOrProject}`;
}

export function buildMonitoringEmailBody(payload: MonitoringEmailPayload): { html: string; text: string } {
  const { classification } = payload;
  const sevColor = severityColor(classification.severity);
  const noraUrl = `${APP_URL}/chat?monitor=${encodeURIComponent(payload.signalId)}`;
  const cassiusUrl = `${APP_URL}/assess?monitor=${encodeURIComponent(payload.signalId)}`;
  const signalUrl = `${APP_URL}/inbox?folder=monitoring&signal=${payload.signalId}`;

  const gapsListHtml = classification.gaps_identified.map(g =>
    `<li style="margin-bottom:8px;"><strong>${escapeHtml(g.gap)}</strong><br/><span style="color:#6b5e55;font-size:12px;">${escapeHtml(g.framework)} · ${DOMAIN_LABELS[g.domain] ?? g.domain}</span></li>`
  ).join("");

  const gapsListText = classification.gaps_identified.map(g =>
    `  - ${g.gap} (${g.framework}, ${DOMAIN_LABELS[g.domain] ?? g.domain})`
  ).join("\n");

  const complianceNote = payload.complianceTeamNotified
    ? `<p style="color:#6b5e55;font-size:13px;">This signal has also been raised with the ${escapeHtml(payload.complianceDomainLabel ?? "relevant compliance")} team.</p>`
    : "";

  const complianceNoteText = payload.complianceTeamNotified
    ? `\nThis signal has also been raised with the ${payload.complianceDomainLabel ?? "relevant compliance"} team.`
    : "";

  const html = `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1210;">
  <div style="padding:20px 0;border-bottom:2px solid #1a1210;">
    <span style="font-size:18px;font-weight:700;">Norvar</span>
    <span style="font-size:13px;color:#6b5e55;margin-left:8px;">Monitoring Agent</span>
  </div>

  <div style="padding:20px 0;">
    <span style="display:inline-block;padding:3px 10px;border-radius:4px;background:${sevColor}15;color:${sevColor};font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">
      ${escapeHtml(classification.severity)} severity
    </span>
    <span style="display:inline-block;padding:3px 10px;border-radius:4px;background:#f0ebe4;color:#6b5e55;font-size:11px;font-weight:600;margin-left:6px;">
      ${escapeHtml(classification.signal_kind.replace("_", " "))}
    </span>

    <h2 style="font-size:16px;margin:14px 0 4px;">${escapeHtml(payload.title)}</h2>
    <p style="color:#6b5e55;font-size:13px;margin:0 0 16px;">
      ${escapeHtml(payload.repoOrProject)} · ${escapeHtml(payload.provider)} · by ${escapeHtml(payload.authorName)}
    </p>

    <p style="font-size:14px;line-height:1.6;">${escapeHtml(classification.summary)}</p>

    ${classification.gaps_identified.length > 0 ? `
    <div style="margin:18px 0;padding:14px 16px;background:#FAEEDA;border-radius:8px;">
      <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#854F0B;margin:0 0 10px;">Gaps identified</p>
      <ul style="margin:0;padding-left:18px;font-size:13px;">${gapsListHtml}</ul>
    </div>` : ""}

    <p style="font-size:13px;color:#6b5e55;">
      Review the link below, or ask Nora directly, or run a full assessment with Cassius:
    </p>

    <div style="margin:18px 0;">
      <a href="${signalUrl}" style="display:inline-block;padding:10px 18px;background:#1a1210;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;margin-right:8px;">View signal</a>
      <a href="${noraUrl}" style="display:inline-block;padding:10px 18px;background:#fff;color:#1a1210;border:1px solid #d4c8be;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;margin-right:8px;">Ask Nora</a>
      <a href="${cassiusUrl}" style="display:inline-block;padding:10px 18px;background:#fff;color:#1a1210;border:1px solid #d4c8be;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;">Run assessment with Cassius</a>
    </div>

    ${complianceNote}

    <p style="margin-top:24px;padding-top:14px;border-top:1px solid #e8e0d8;">
      <a href="${escapeHtml(payload.sourceUrl)}" style="color:#8b1a1a;font-size:12px;">View source ${payload.sourceType === "jira_ticket" ? "ticket" : "change"} →</a>
    </p>
  </div>

  <div style="padding:16px 0;border-top:1px solid #e8e0d8;color:#a8998e;font-size:11px;">
    Norvar Monitoring Agent — automated compliance signal detection.
  </div>
</div>`.trim();

  const text = [
    `NORVAR MONITORING AGENT`,
    ``,
    `${classification.severity.toUpperCase()} SEVERITY — ${classification.signal_kind.replace("_", " ")}`,
    payload.title,
    `${payload.repoOrProject} · ${payload.provider} · by ${payload.authorName}`,
    ``,
    classification.summary,
    ``,
    classification.gaps_identified.length > 0 ? `GAPS IDENTIFIED:\n${gapsListText}\n` : "",
    `View signal: ${signalUrl}`,
    `Ask Nora: ${noraUrl}`,
    `Run assessment with Cassius: ${cassiusUrl}`,
    complianceNoteText,
    ``,
    `View source: ${payload.sourceUrl}`,
  ].filter(Boolean).join("\n");

  return { html, text };
}

// ─── SEND TO ALL RECIPIENTS ───────────────────────────────────────────────────

export async function notifySignalRecipients(
  signalId: string,
  candidate: SignalCandidate,
  classification: ClassificationResult,
  authorResolved: { userId: string | null; email: string | null },
): Promise<{ admin: boolean; author: boolean; compliance: boolean; complianceDomain: string | null }> {
  const result = { admin: false, author: false, compliance: false, complianceDomain: null as string | null };

  const { data: orgConfig } = await supabase
    .from("org_monitoring_config")
    .select("*")
    .eq("org_id", candidate.orgId)
    .maybeSingle();

  const recipients: Array<{ email: string; role: "admin" | "author" | "compliance" }> = [];

  if (orgConfig?.admin_email) {
    recipients.push({ email: orgConfig.admin_email, role: "admin" });
  }

  const authorEmail = authorResolved.email ?? candidate.authorEmail;
  if (authorEmail && authorEmail !== orgConfig?.admin_email) {
    recipients.push({ email: authorEmail, role: "author" });
  }

  let complianceDomainLabel: string | null = null;
  const primaryDomain = classification.domains[0];
  if (primaryDomain) {
    const contact = await resolveComplianceContact(candidate.orgId, primaryDomain);
    if (contact.email && contact.email !== orgConfig?.admin_email && contact.email !== authorEmail) {
      recipients.push({ email: contact.email, role: "compliance" });
      complianceDomainLabel = DOMAIN_TEAM_LABELS[primaryDomain];
      result.complianceDomain = complianceDomainLabel;
    } else if (contact.email) {
      complianceDomainLabel = DOMAIN_TEAM_LABELS[primaryDomain];
      result.complianceDomain = complianceDomainLabel;
      result.compliance = true;
    }
  }

  for (const recipient of recipients) {
    const payload: MonitoringEmailPayload = {
      signalId,
      orgId:                  candidate.orgId,
      provider:               candidate.provider,
      sourceType:             candidate.sourceType,
      sourceUrl:              candidate.sourceUrl,
      repoOrProject:          candidate.repoOrProject,
      title:                  candidate.title,
      authorName:             candidate.authorExternalName,
      classification,
      recipientEmail:         recipient.email,
      recipientRole:          recipient.role,
      complianceTeamNotified: !!complianceDomainLabel,
      complianceDomainLabel,
    };

    const subject = buildMonitoringEmailSubject(payload);
    const { html, text } = buildMonitoringEmailBody(payload);

    try {
      await sendEmail({ to: recipient.email, subject, html, text });
      if (recipient.role === "admin")      result.admin = true;
      if (recipient.role === "author")     result.author = true;
      if (recipient.role === "compliance") result.compliance = true;
    } catch (err) {
      console.error(`Failed to send monitoring email to ${recipient.email}:`, err);
    }
  }

  await supabase
    .from("monitoring_signals")
    .update({
      notified_admin:             result.admin,
      notified_author:            result.author,
      notified_compliance:        result.compliance,
      compliance_domain_notified: result.complianceDomain,
      notification_sent_at:       new Date().toISOString(),
    })
    .eq("id", signalId);

  return result;
}

// ─── EMAIL SENDER ─────────────────────────────────────────────────────────────

async function sendEmail({ to, subject, html, text }: { to: string; subject: string; html: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from   = process.env.EMAIL_FROM || "Norvar Monitoring <monitoring@norvar.io>";

  if (!apiKey) {
    console.warn("RESEND_API_KEY not configured — monitoring email not sent:", { to, subject });
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Email send failed: ${res.status} ${err}`);
  }
}
