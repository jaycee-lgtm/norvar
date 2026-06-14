import { escalationReplyToAddress, escalationViewUrl } from "@/lib/escalation";

type EscalationEmailPayload = {
  token:           string;
  recipientEmail:  string;
  recipientName?:  string | null;
  gapTitle:        string;
  gapSeverity:     string;
  gapDomain:       string;
  gapDetail?:      string | null;
  projectTitle?:   string | null;
  question?:       string | null;
  note?:           string | null;
  assigneeNames:   string[];
  assigneeRoles:   string[];
  escalatedByName: string;
};

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEscalationText(payload: EscalationEmailPayload) {
  const link = escalationViewUrl(payload.token);
  const question = payload.question || payload.note;
  const assigneeLines = payload.assigneeNames.map((name, i) => {
    const role = payload.assigneeRoles[i];
    return role ? `${name} (${role})` : name;
  }).join(", ");

  const lines = [
    `Hi${payload.recipientName ? ` ${payload.recipientName}` : ""},`,
    "",
    `${payload.escalatedByName} escalated a compliance gap to you on Norvar.`,
    "",
    `Gap: ${payload.gapTitle}`,
    `Severity: ${payload.gapSeverity} · Domain: ${payload.gapDomain}`,
    payload.projectTitle ? `Project: ${payload.projectTitle}` : "",
    payload.gapDetail ? payload.gapDetail : "",
    question ? `\nQuestion / context:\n${question}` : "",
    assigneeLines ? `\nCurrently assigned: ${assigneeLines}` : "",
    "",
    `View gap, chats & assessment: ${link}`,
    "",
    "Reply directly to this email to send your response back to the team in Norvar.",
  ];

  return lines.filter(Boolean).join("\n");
}

function buildEscalationHtml(payload: EscalationEmailPayload) {
  const link = escalationViewUrl(payload.token);
  const question = payload.question || payload.note;
  const assigneeLines = payload.assigneeNames.map((name, i) => {
    const role = payload.assigneeRoles[i];
    return role ? `${name} (${role})` : name;
  }).join(", ");

  return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.5; max-width: 560px;">
  <p style="font-size: 14px;">Hi${payload.recipientName ? ` ${escapeHtml(payload.recipientName)}` : ""},</p>
  <p style="font-size: 14px;">
    ${escapeHtml(payload.escalatedByName)} escalated a compliance gap to you on Norvar.
  </p>
  <div style="background: #f5f5f4; border-radius: 8px; padding: 16px; margin: 16px 0;">
    <p style="margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #737373;">Gap</p>
    <p style="margin: 0 0 6px; font-size: 15px; font-weight: 600;">${escapeHtml(payload.gapTitle)}</p>
    <p style="margin: 0; font-size: 13px; color: #525252;">
      Severity: ${escapeHtml(payload.gapSeverity)} · Domain: ${escapeHtml(payload.gapDomain)}
      ${payload.projectTitle ? `<br>Project: ${escapeHtml(payload.projectTitle)}` : ""}
    </p>
    ${payload.gapDetail ? `<p style="margin: 12px 0 0; font-size: 13px;">${escapeHtml(payload.gapDetail)}</p>` : ""}
  </div>
  ${question ? `
  <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #737373; margin-bottom: 6px;">Question / context</p>
  <p style="font-size: 14px; margin-top: 0;">${escapeHtml(question)}</p>
  ` : ""}
  ${assigneeLines ? `
  <p style="font-size: 13px; color: #525252;">Currently assigned: ${escapeHtml(assigneeLines)}</p>
  ` : ""}
  <p style="margin: 24px 0;">
    <a href="${link}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; font-weight: 500;">
      View gap, chats &amp; assessment
    </a>
  </p>
  <p style="font-size: 12px; color: #737373;">
    This link gives you the full escalation view: gap details, remediation chat history, and the parent assessment.
  </p>
  <p style="font-size: 13px; color: #525252; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e5e5;">
    <strong>Reply to this email</strong> to send your response. Your reply will appear in Norvar for the team who escalated this gap.
  </p>
</body>
</html>`;
}

export async function sendEscalationEmail(payload: EscalationEmailPayload): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — escalation saved but email not sent");
    return { ok: false, error: "Email not configured" };
  }

  const subject = `[ref:${payload.token}] Escalation: ${payload.gapTitle}${payload.projectTitle ? ` · ${payload.projectTitle}` : ""}`;
  const html    = buildEscalationHtml(payload);
  const text    = buildEscalationText(payload);
  const replyTo = escalationReplyToAddress(payload.token);
  const from    = process.env.ESCALATION_FROM?.trim() || `Norvar Escalations <${replyTo}>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to:       [payload.recipientEmail],
        reply_to: replyTo,
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { ok: false, error: data.message ?? `Resend error ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}
