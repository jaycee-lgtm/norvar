import { escalationReplyToAddress, escalationReplyDomain, escalationViewUrl, formatEscalationRef } from "@/lib/escalation";

function escalationFromAddress(): string {
  const configured = process.env.ESCALATION_FROM?.trim() || process.env.EMAIL_FROM?.trim();
  if (configured) return configured;
  return `Norvar Escalations <notifications@${escalationReplyDomain()}>`;
}

export type EscalationEmailPayload = {
  token:             string;
  assessmentNumber?: string | null;
  gapId?:            string | null;
  recipientEmail:    string;
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

export function escalationEmailSubject(payload: EscalationEmailPayload): string {
  const ref = formatEscalationRef(payload.assessmentNumber, payload.token);
  return `[ref:${ref}] Escalation: ${payload.gapTitle}`;
}

function trimField(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function formatAssigneeLines(names: string[], roles: string[]): string {
  return names.map((name, i) => {
    const role = roles[i];
    return role ? `${name} (${role})` : name;
  }).join(", ");
}

function escalationReference(payload: EscalationEmailPayload): string | null {
  return formatEscalationRef(payload.assessmentNumber, payload.token) || trimField(payload.gapId);
}

function appendTextSection(lines: string[], label: string, body: string | null) {
  if (!body) return;
  lines.push("", label, body);
}

export function buildEscalationEmailText(payload: EscalationEmailPayload) {
  const link = escalationViewUrl(payload.token);
  const question = trimField(payload.question);
  const note = trimField(payload.note);
  const gapDetail = trimField(payload.gapDetail);
  const assigneeLines = formatAssigneeLines(payload.assigneeNames, payload.assigneeRoles);
  const reference = escalationReference(payload);

  const lines = [
    `Hi${payload.recipientName ? ` ${payload.recipientName}` : ""},`,
    "",
    `${payload.escalatedByName} escalated a compliance gap to you on Norvar.`,
  ];

  appendTextSection(lines, "Reference", reference);
  if (payload.projectTitle || payload.assessmentNumber) {
    lines.push("", "Assessment");
    if (payload.projectTitle) lines.push(payload.projectTitle);
    if (payload.assessmentNumber) lines.push(payload.assessmentNumber);
  }

  lines.push("", "Gap", payload.gapTitle);
  if (payload.gapId) lines.push(`ID: ${payload.gapId}`);
  lines.push(`Severity: ${payload.gapSeverity} · Domain: ${payload.gapDomain}`);
  appendTextSection(lines, "Finding", gapDetail);
  appendTextSection(lines, "Question", question);
  appendTextSection(lines, "Context", note);
  appendTextSection(lines, "Assigned to", assigneeLines || null);

  lines.push(
    "",
    `View gap, chats & assessment: ${link}`,
    "",
    "Reply directly to this email to send your response back to the team in Norvar.",
  );

  return lines.join("\n");
}

function emailHtmlSection(label: string, body: string, options?: { monospace?: boolean; title?: boolean }) {
  const bodyStyle = options?.title
    ? "margin: 0; font-size: 15px; font-weight: 600; color: #1a1a1a;"
    : options?.monospace
    ? "margin: 0; font-size: 12px; white-space: pre-wrap; color: #525252; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;"
    : "margin: 0; font-size: 14px; white-space: pre-wrap; color: #1a1a1a;";

  return `
  <div style="margin-bottom: 16px;">
    <p style="margin: 0 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #737373;">${escapeHtml(label)}</p>
    <p style="${bodyStyle}">${escapeHtml(body)}</p>
  </div>`;
}

function buildEscalationHtml(payload: EscalationEmailPayload) {
  const link = escalationViewUrl(payload.token);
  const question = trimField(payload.question);
  const note = trimField(payload.note);
  const gapDetail = trimField(payload.gapDetail);
  const assigneeLines = formatAssigneeLines(payload.assigneeNames, payload.assigneeRoles);
  const reference = escalationReference(payload);

  const assessmentLines = [
    payload.projectTitle,
    payload.assessmentNumber,
  ].filter(Boolean) as string[];

  const gapMeta = [
    payload.gapId ? `ID: ${payload.gapId}` : null,
    `${payload.gapSeverity} · ${payload.gapDomain}`,
  ].filter(Boolean).join(" · ");

  const sections = [
    reference ? emailHtmlSection("Reference", reference, { monospace: true }) : "",
    assessmentLines.length
      ? emailHtmlSection("Assessment", assessmentLines.join("\n"))
      : "",
    emailHtmlSection("Gap", payload.gapTitle, { title: true })
    + emailHtmlSection("Details", gapMeta, { monospace: true })
    + (gapDetail ? emailHtmlSection("Finding", gapDetail) : ""),
    question ? emailHtmlSection("Question", question) : "",
    note ? emailHtmlSection("Context", note) : "",
    assigneeLines ? emailHtmlSection("Assigned to", assigneeLines) : "",
  ].join("");

  return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.55; max-width: 560px; margin: 0; padding: 24px 16px;">
  <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #737373; margin: 0 0 12px;">Norvar escalation</p>
  <p style="font-size: 14px; margin: 0 0 8px;">Hi${payload.recipientName ? ` ${escapeHtml(payload.recipientName)}` : ""},</p>
  <p style="font-size: 14px; margin: 0 0 20px;">
    ${escapeHtml(payload.escalatedByName)} escalated a compliance gap to you on Norvar.
  </p>
  <div style="background: #f5f5f4; border-radius: 10px; padding: 18px 18px 4px; margin: 0 0 24px;">
    ${sections}
  </div>
  <p style="margin: 0 0 10px;">
    <a href="${link}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; font-weight: 500;">
      View gap, chats &amp; assessment
    </a>
  </p>
  <p style="font-size: 12px; color: #737373; margin: 0 0 20px;">
    Open the full escalation view for gap details, remediation chat history, and the parent assessment.
  </p>
  <p style="font-size: 13px; color: #525252; margin: 0; padding-top: 16px; border-top: 1px solid #e5e5e5;">
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

  const subject = escalationEmailSubject(payload);
  const html    = buildEscalationHtml(payload);
  const text    = buildEscalationEmailText(payload);
  const replyTo = escalationReplyToAddress(payload.token, payload.assessmentNumber);
  const from    = escalationFromAddress();

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

type EscalationInboxReplyPayload = {
  token:             string;
  assessmentNumber?: string | null;
  recipientEmail:    string;
  recipientName?: string | null;
  gapTitle:       string;
  projectTitle?:  string | null;
  body:           string;
  senderName:     string;
};

export async function sendEscalationInboxReply(
  payload: EscalationInboxReplyPayload,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — inbox reply saved but email not sent");
    return { ok: false, error: "Email not configured" };
  }

  const ref     = formatEscalationRef(payload.assessmentNumber, payload.token);
  const subject = `Re: [ref:${ref}] Escalation: ${payload.gapTitle}${payload.projectTitle ? ` · ${payload.projectTitle}` : ""}`;
  const replyTo = escalationReplyToAddress(payload.token, payload.assessmentNumber);
  const from    = escalationFromAddress();
  const greeting  = payload.recipientName ? `Hi ${payload.recipientName},\n\n` : "";
  const text      = `${greeting}${payload.body.trim()}\n\n— ${payload.senderName} (via Norvar)`;
  const html      = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.5; max-width: 560px;">
  <p style="font-size: 14px;">${payload.recipientName ? `Hi ${escapeHtml(payload.recipientName)},` : "Hi,"}</p>
  <p style="font-size: 14px; white-space: pre-wrap;">${escapeHtml(payload.body.trim())}</p>
  <p style="font-size: 13px; color: #737373; margin-top: 20px;">— ${escapeHtml(payload.senderName)} (via Norvar)</p>
  <p style="font-size: 12px; color: #737373; margin-top: 20px; padding-top: 16px; border-top: 1px solid #e5e5e5;">
    Reply to this email to continue the escalation thread. Your response will appear in Norvar.
  </p>
</body>
</html>`;

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

export type EscalationAssigneeNotifyPayload = {
  toEmails:          string[];
  token:             string;
  assessmentNumber?: string | null;
  gapTitle:          string;
  projectTitle?:     string | null;
  recipientName?:    string | null;
  recipientEmail:    string;
  replyBody:         string;
  replySource:       "email" | "form";
  inboxUrl:          string;
};

export async function sendEscalationAssigneeReplyNotification(
  payload: EscalationAssigneeNotifyPayload,
): Promise<{ ok: boolean; error?: string; sent?: number }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = [...new Set(payload.toEmails.map(e => e.trim().toLowerCase()).filter(Boolean))];

  if (!to.length) {
    console.warn("[email] assignee reply notification skipped — no recipient addresses");
    return { ok: false, error: "No assignee email addresses" };
  }
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — assignee reply notification not sent");
    return { ok: false, error: "Email not configured" };
  }

  const ref     = formatEscalationRef(payload.assessmentNumber, payload.token);
  const replyTo = escalationReplyToAddress(payload.token, payload.assessmentNumber);
  const from    = escalationFromAddress();
  const sender  = payload.recipientName?.trim() || payload.recipientEmail;
  const source  = payload.replySource === "form" ? "the escalation page" : "email";
  const preview = payload.replyBody.trim().slice(0, 1200);
  const subject = `[ref:${ref}] New reply: ${payload.gapTitle}`;

  const text = [
    "A recipient replied to your Norvar escalation.",
    "",
    `Gap: ${payload.gapTitle}`,
    payload.projectTitle ? `Assessment: ${payload.projectTitle}` : "",
    `From: ${sender} (${payload.recipientEmail})`,
    `Via: ${source}`,
    "",
    preview,
    preview.length < payload.replyBody.trim().length ? "\n[Message truncated]" : "",
    "",
    `Open in Norvar: ${payload.inboxUrl}`,
    "",
    "Reply to this email to send your response to the recipient. It will appear in the Norvar thread.",
  ].filter(Boolean).join("\n");

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.55; max-width: 560px;">
  <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #737373; margin: 0 0 8px;">New escalation reply</p>
  <p style="font-size: 14px; margin: 0 0 16px;"><strong>${escapeHtml(sender)}</strong> replied via ${escapeHtml(source)}.</p>
  <div style="background: #f5f5f4; border-radius: 8px; padding: 14px 16px; margin: 0 0 16px;">
    <p style="margin: 0 0 6px; font-size: 13px; font-weight: 600;">${escapeHtml(payload.gapTitle)}</p>
    ${payload.projectTitle ? `<p style="margin: 0; font-size: 12px; color: #525252;">${escapeHtml(payload.projectTitle)}</p>` : ""}
  </div>
  <p style="font-size: 14px; white-space: pre-wrap; margin: 0 0 20px;">${escapeHtml(preview)}</p>
  <p style="margin: 0 0 20px;">
    <a href="${payload.inboxUrl}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 10px 18px; border-radius: 6px; font-size: 14px; font-weight: 500;">
      Open in Norvar
    </a>
  </p>
  <p style="font-size: 12px; color: #737373; margin: 0; padding-top: 16px; border-top: 1px solid #e5e5e5;">
    <strong>Reply to this email</strong> to respond to ${escapeHtml(sender)}. Your message will appear in the Norvar thread and be emailed to them.
  </p>
</body>
</html>`;

  const errors: string[] = [];
  let sent = 0;

  for (const recipient of to) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method:  "POST",
        headers: {
          Authorization:  `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to:       [recipient],
          reply_to: replyTo,
          subject,
          html,
          text,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errors.push(`${recipient}: ${data.message ?? `Resend error ${res.status}`}`);
        continue;
      }

      sent += 1;
    } catch (err) {
      errors.push(`${recipient}: ${err instanceof Error ? err.message : "Send failed"}`);
    }
  }

  if (sent === 0) {
    return { ok: false, error: errors.join("; ") || "No assignee emails sent", sent: 0 };
  }

  if (errors.length) {
    console.warn("[email] assignee reply notification partial failure", errors);
  }

  return { ok: true, sent, error: errors.length ? errors.join("; ") : undefined };
}

export type ContactEmailPayload = {
  name:    string;
  email:   string;
  message: string;
};

export async function sendContactEmail(
  payload: ContactEmailPayload,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — contact form submission not sent");
    return { ok: false, error: "Email not configured" };
  }

  const to   = process.env.CONTACT_TO?.trim() || "hello@norvar.io";
  const from = process.env.CONTACT_FROM?.trim()
    || process.env.ESCALATION_FROM?.trim()
    || "Norvar <onboarding@resend.dev>";
  const subject = `Norvar contact from ${payload.name}`;
  const text = [
    `Name: ${payload.name}`,
    `Email: ${payload.email}`,
    "",
    payload.message.trim(),
  ].join("\n");
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.55; max-width: 560px;">
  <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #737373; margin: 0 0 8px;">New contact message</p>
  <p style="font-size: 14px; margin: 0 0 4px;"><strong>Name:</strong> ${escapeHtml(payload.name)}</p>
  <p style="font-size: 14px; margin: 0 0 16px;"><strong>Email:</strong> ${escapeHtml(payload.email)}</p>
  <p style="font-size: 14px; white-space: pre-wrap; margin: 0;">${escapeHtml(payload.message.trim())}</p>
</body>
</html>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to:       [to],
        reply_to: payload.email.trim(),
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
