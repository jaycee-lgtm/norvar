import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ESCALATION_EMAIL_REPLY_ACTION,
  collectRecipientAddresses,
  extractEscalationTokenFromAddresses,
  extractEscalationTokenFromSubject,
  type EscalationStatus,
} from "@/lib/escalation";

type ReceivedEmail = {
  id:      string;
  from:    string;
  to:      string[];
  cc?:     string[];
  bcc?:    string[];
  subject: string | null;
  text:    string | null;
  html:    string | null;
  headers?: Record<string, string | string[]>;
};

export type InboundWebhookEvent = {
  type: string;
  data?: {
    email_id?: string;
    from?:    string;
    to?:      string[];
    cc?:      string[];
    bcc?:     string[];
    subject?: string;
  };
};

export function stripEmailQuote(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^on .+ wrote:$/i.test(trimmed)) break;
    if (/^-{2,}\s*original message\s*-{2,}/i.test(trimmed)) break;
    if (/^from:\s/i.test(trimmed) && result.length > 2) break;
    if (/^_{3,}$/.test(trimmed)) break;
    if (trimmed.startsWith(">")) continue;
    result.push(line);
  }

  const stripped = result.join("\n").trim();
  if (stripped) return stripped;

  const withoutQuotes = text
    .split("\n")
    .filter(line => !line.trim().startsWith(">"))
    .join("\n")
    .trim();
  return withoutQuotes;
}

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .trim();
}

function decodeDataUriHtml(html: string): string {
  if (!html.startsWith("data:")) return html;
  const match = html.match(/^data:[^;]*;base64,(.+)$/i);
  if (!match) return html;
  try {
    return Buffer.from(match[1], "base64").toString("utf8");
  } catch {
    return html;
  }
}

function extractEmailBody(email: ReceivedEmail): string {
  if (email.text?.trim()) return email.text.trim();
  if (email.html) {
    const decoded = decodeDataUriHtml(email.html);
    return htmlToText(decoded);
  }
  return "";
}

function parseSender(from: string): { email: string; name: string | null } {
  const match = from.match(/^(.*)<([^>]+)>$/);
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, "") || null;
    return { name, email: match[2].trim().toLowerCase() };
  }
  return { name: null, email: from.trim().toLowerCase() };
}

function advanceToResponded(current: EscalationStatus | null): EscalationStatus {
  if (!current || current === "sent" || current === "viewed" || current === "in_review") {
    return "responded";
  }
  return current;
}

export function verifyResendWebhook(
  payload: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  secret: string,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const signedContent = `${id}.${timestamp}.${payload}`;
  const secretKey = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const key = Buffer.from(secretKey, "base64");
  const expected = crypto.createHmac("sha256", key).update(signedContent).digest("base64");

  for (const part of signature.split(" ")) {
    const [version, value] = part.split(",");
    if (version !== "v1" || !value) continue;
    try {
      const a = Buffer.from(value);
      const b = Buffer.from(expected);
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    } catch {
      continue;
    }
  }

  return false;
}

export async function fetchReceivedEmail(emailId: string): Promise<ReceivedEmail | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    console.error("[escalation-inbound] fetch received email failed:", res.status, await res.text().catch(() => ""));
    return null;
  }

  const json = await res.json() as ReceivedEmail & { data?: ReceivedEmail };
  return json.data ?? json;
}

function resolveEscalationToken(
  event: InboundWebhookEvent,
  email: ReceivedEmail,
): string | null {
  const addresses = collectRecipientAddresses(
    event.data?.to,
    event.data?.cc,
    event.data?.bcc,
    email.to,
    email.cc,
    email.bcc,
  );

  const fromAddress = extractEscalationTokenFromAddresses([email.from ?? ""]);
  if (fromAddress) return fromAddress;

  const fromRecipients = extractEscalationTokenFromAddresses(addresses);
  if (fromRecipients) return fromRecipients;

  return extractEscalationTokenFromSubject(email.subject ?? event.data?.subject);
}

export async function recordEscalationEmailReply(
  supabase: SupabaseClient,
  input: {
    token:           string;
    inboundEmailId:  string;
    from:            string;
    subject?:        string | null;
    bodyText?:       string | null;
    bodyHtml?:       string | null;
  },
): Promise<{ ok: boolean; error?: string; duplicate?: boolean }> {
  const { data: item, error } = await supabase
    .from("remediation_items")
    .select("id, escalation_status, escalation_email")
    .eq("escalation_token", input.token)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!item) return { ok: false, error: "Escalation not found" };

  const { data: existing } = await supabase
    .from("remediation_activity")
    .select("id")
    .eq("remediation_id", item.id)
    .eq("action", ESCALATION_EMAIL_REPLY_ACTION)
    .ilike("detail", `%${input.inboundEmailId}%`)
    .limit(1);

  if (existing?.length) return { ok: true, duplicate: true };

  const rawBody = input.bodyText?.trim()
    || (input.bodyHtml ? htmlToText(decodeDataUriHtml(input.bodyHtml)) : "")
    || "";
  const body = stripEmailQuote(rawBody);
  if (!body) return { ok: false, error: "Empty reply body" };

  const sender = parseSender(input.from);
  const detail = JSON.stringify({
    inbound_email_id: input.inboundEmailId,
    from_email:       sender.email,
    from_name:        sender.name,
    subject:          input.subject ?? null,
    body,
  });

  const updates: Record<string, unknown> = {};
  if (item.escalation_status !== "closed") {
    updates.escalation_status = advanceToResponded(item.escalation_status as EscalationStatus);
  }

  if (Object.keys(updates).length) {
    await supabase.from("remediation_items").update(updates).eq("id", item.id);
  }

  const { error: insertError } = await supabase.from("remediation_activity").insert({
    remediation_id: item.id,
    user_id:        sender.email,
    action:         ESCALATION_EMAIL_REPLY_ACTION,
    detail,
  });

  if (insertError) return { ok: false, error: insertError.message };

  return { ok: true };
}

export async function processInboundEscalationEmail(
  supabase: SupabaseClient,
  event: InboundWebhookEvent,
): Promise<{ ok: boolean; error?: string; retriable?: boolean }> {
  if (event.type !== "email.received") return { ok: true };

  const emailId = event.data?.email_id;
  if (!emailId) return { ok: false, error: "Missing email_id", retriable: false };

  const email = await fetchReceivedEmail(emailId);
  if (!email) return { ok: false, error: "Could not fetch received email", retriable: true };

  const token = resolveEscalationToken(event, email);
  if (!token) return { ok: false, error: "No escalation token in recipient address", retriable: false };

  const bodyText = extractEmailBody(email);
  const result = await recordEscalationEmailReply(supabase, {
    token,
    inboundEmailId: emailId,
    from:           email.from ?? event.data?.from ?? "unknown",
    subject:        email.subject ?? event.data?.subject ?? null,
    bodyText,
    bodyHtml:       email.html,
  });

  if (!result.ok && !result.duplicate) {
    return { ok: false, error: result.error ?? "Failed to record reply", retriable: false };
  }

  return { ok: true };
}
