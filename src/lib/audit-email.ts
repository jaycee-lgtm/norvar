function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function auditFromAddress(): string {
  return process.env.AUDIT_FROM?.trim()
    || process.env.EMAIL_FROM?.trim()
    || process.env.ESCALATION_FROM?.trim()
    || "Norvar Audits <onboarding@resend.dev>";
}

export type AuditReportEmailPayload = {
  to:      string;
  subject: string;
  body:    string;
};

export async function sendAuditReportEmail(
  payload: AuditReportEmailPayload,
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to     = payload.to.trim();

  if (!to) {
    return { ok: false, error: "No recipient email" };
  }

  if (!apiKey) {
    console.warn("[audit-email] RESEND_API_KEY not set — audit email not sent");
    return { ok: false, error: "Email not configured" };
  }

  const from = auditFromAddress();
  const text = payload.body.trim();
  const html = `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1a1a1a; line-height: 1.55; max-width: 640px;">
  <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: #737373; margin: 0 0 12px;">Norvar automated audit</p>
  <pre style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; white-space: pre-wrap; margin: 0; background: #f5f5f4; padding: 16px; border-radius: 8px;">${escapeHtml(text)}</pre>
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
        to:      [to],
        subject: payload.subject,
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
