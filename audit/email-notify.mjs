import { writeFileSync } from "fs";
import { join } from "path";

async function sendViaResend({ to, subject, body, from }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text: body }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? `Resend error ${res.status}`);
  }

  return true;
}

async function sendViaApi({ to, subject, body, baseUrl, secret }) {
  const res = await fetch(`${baseUrl}/api/audit-notify`, {
    method:  "POST",
    headers: {
      "Content-Type":   "application/json",
      "x-audit-secret": secret,
    },
    body: JSON.stringify({ to, subject, body }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `API error ${res.status}`);
  }

  return true;
}

export async function sendAuditEmail({ to, subject, body, baseUrl, secret, reportDir, timestamp }) {
  if (!to) {
    console.log("  No email configured — skipping");
    return { ok: false, reason: "no_recipient" };
  }

  const from = process.env.AUDIT_FROM?.trim()
    || process.env.EMAIL_FROM?.trim()
    || process.env.ESCALATION_FROM?.trim()
    || "Norvar Audits <onboarding@resend.dev>";

  try {
    if (process.env.RESEND_API_KEY) {
      await sendViaResend({ to, subject, body, from });
      console.log(`  Email sent to ${to} (Resend)`);
      return { ok: true, channel: "resend" };
    }

    if (baseUrl && secret) {
      await sendViaApi({ to, subject, body, baseUrl, secret });
      console.log(`  Email sent to ${to} (API)`);
      return { ok: true, channel: "api" };
    }
  } catch (err) {
    console.log(`  Email failed: ${err.message}`);
  }

  const emailPath = join(reportDir, `audit-email-${timestamp}.txt`);
  writeFileSync(emailPath, `TO: ${to}\nSUBJECT: ${subject}\n\n${body}`);
  console.log(`  Email saved to ${emailPath}`);
  return { ok: false, reason: "saved_to_file", path: emailPath };
}
