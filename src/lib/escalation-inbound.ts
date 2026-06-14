import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ESCALATION_EMAIL_REPLY_ACTION,
  extractEscalationTokenFromAddresses,
  type EscalationStatus,
} from "@/lib/escalation";

type ReceivedEmail = {
  id:      string;
  from:    string;
  to:      string[];
  subject: string | null;
  text:    string | null;
  html:    string | null;
  headers?: Record<string, string | string[]>;
};

type InboundWebhookEvent = {
  type: string;
  data?: {
    email_id?: string;
    from?:    string;
    to?:      string[];
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

  return result.join("\n").trim();
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

  if (!res.ok) return null;
  return res.json() as Promise<ReceivedEmail>;
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
    .single();

  if (error || !item) return { ok: false, error: "Escalation not found" };

  const { data: existing } = await supabase
    .from("remediation_activity")
    .select("id")
    .eq("remediation_id", item.id)
    .eq("action", ESCALATION_EMAIL_REPLY_ACTION)
    .ilike("detail", `%${input.inboundEmailId}%`)
    .limit(1);

  if (existing?.length) return { ok: true, duplicate: true };

  const rawBody = input.bodyText?.trim()
    || (input.bodyHtml ? htmlToText(input.bodyHtml) : "")
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

  await supabase.from("remediation_activity").insert({
    remediation_id: item.id,
    user_id:        sender.email,
    action:         ESCALATION_EMAIL_REPLY_ACTION,
    detail,
  });

  return { ok: true };
}

export async function processInboundEscalationEmail(
  supabase: SupabaseClient,
  event: InboundWebhookEvent,
): Promise<{ ok: boolean; error?: string }> {
  if (event.type !== "email.received") return { ok: true };

  const emailId = event.data?.email_id;
  if (!emailId) return { ok: false, error: "Missing email_id" };

  const email = await fetchReceivedEmail(emailId);
  if (!email) return { ok: false, error: "Could not fetch received email" };

  const token = extractEscalationTokenFromAddresses([
    ...(event.data?.to ?? []),
    ...(email.to ?? []),
  ]);
  if (!token) return { ok: false, error: "No escalation token in recipient address" };

  const result = await recordEscalationEmailReply(supabase, {
    token,
    inboundEmailId: emailId,
    from:           email.from ?? event.data?.from ?? "unknown",
    subject:        email.subject ?? event.data?.subject ?? null,
    bodyText:       email.text,
    bodyHtml:       email.html,
  });

  if (!result.ok && !result.duplicate) {
    return { ok: false, error: result.error ?? "Failed to record reply" };
  }

  return { ok: true };
}
