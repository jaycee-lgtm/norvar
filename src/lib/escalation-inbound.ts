import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ESCALATION_EMAIL_REPLY_ACTION,
  collectRecipientAddresses,
  assessmentNumberFromSlug,
  extractEscalationRefFromAddresses,
  extractEscalationRefFromSubject,
  isEscalationUuid,
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

function headerAddresses(
  headers: Record<string, string | string[]> | undefined,
  ...keys: string[]
): string[] {
  if (!headers) return [];
  const out: string[] = [];
  for (const key of keys) {
    const value = headers[key] ?? headers[key.toLowerCase()];
    if (!value) continue;
    if (Array.isArray(value)) out.push(...value.map(String));
    else out.push(String(value));
  }
  return out;
}

function collectInboundRecipientAddresses(
  event: InboundWebhookEvent,
  email?: ReceivedEmail | null,
): string[] {
  return collectRecipientAddresses(
    event.data?.to,
    event.data?.cc,
    event.data?.bcc,
    email?.to,
    email?.cc,
    email?.bcc,
    headerAddresses(email?.headers, "to", "delivered-to", "x-original-to", "envelope-to"),
  );
}

async function resolveEscalationTokenBySender(
  supabase: SupabaseClient,
  senderEmail: string,
  subject?: string | null,
): Promise<string | null> {
  const sender = senderEmail.trim().toLowerCase();
  if (!sender) return null;

  const { data, error } = await supabase
    .from("remediation_items")
    .select("escalation_token, gap_title, escalated_at, escalation_status")
    .ilike("escalation_email", sender)
    .not("escalation_token", "is", null)
    .neq("escalation_status", "closed")
    .order("escalated_at", { ascending: false });

  if (error || !data?.length) return null;
  if (data.length === 1) return data[0].escalation_token ?? null;

  if (subject) {
    const match = data.find(row => row.gap_title && subject.includes(row.gap_title.slice(0, 48)));
    if (match?.escalation_token) return match.escalation_token;
  }

  return data[0]?.escalation_token ?? null;
}

export async function resolveEscalationToken(
  supabase: SupabaseClient,
  ref: string,
  senderEmail?: string | null,
): Promise<string | null> {
  if (isEscalationUuid(ref)) {
    const { data } = await supabase
      .from("remediation_items")
      .select("escalation_token")
      .eq("escalation_token", ref)
      .maybeSingle();
    return data?.escalation_token ?? ref;
  }

  const assessmentNumber = assessmentNumberFromSlug(ref);
  const sender = senderEmail?.trim().toLowerCase();

  const { data, error } = await supabase
    .from("remediation_items")
    .select("escalation_token, escalation_email, escalated_at")
    .ilike("assessment_number", assessmentNumber)
    .not("escalation_token", "is", null)
    .not("escalation_email", "is", null)
    .order("escalated_at", { ascending: false });

  if (error || !data?.length) return null;

  if (sender) {
    const match = data.find(row => row.escalation_email?.toLowerCase() === sender);
    if (match?.escalation_token) return match.escalation_token;
  }

  return data[0]?.escalation_token ?? null;
}

async function resolveEscalationTokenFromInbound(
  supabase: SupabaseClient,
  event: InboundWebhookEvent,
  email?: ReceivedEmail | null,
): Promise<string | null> {
  const addresses = collectInboundRecipientAddresses(event, email);
  const sender = parseSender(email?.from ?? event.data?.from ?? "");
  const subject = email?.subject ?? event.data?.subject ?? null;

  for (const ref of [
    extractEscalationRefFromAddresses(addresses),
    extractEscalationRefFromSubject(subject),
  ]) {
    if (!ref) continue;
    const token = await resolveEscalationToken(supabase, ref, sender.email);
    if (token) return token;
  }

  return resolveEscalationTokenBySender(supabase, sender.email, subject);
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

export async function fetchReceivedEmail(
  emailId: string,
  attempts = 4,
): Promise<ReceivedEmail | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[escalation-inbound] RESEND_API_KEY not set — cannot fetch received email");
    return null;
  }

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (res.ok) {
      const json = await res.json() as ReceivedEmail & { data?: ReceivedEmail };
      return json.data ?? json;
    }

    const errText = await res.text().catch(() => "");
    const retriable = res.status === 404 || res.status === 429 || res.status >= 500;
    console.error(
      `[escalation-inbound] fetch received email failed (attempt ${attempt}/${attempts}):`,
      res.status,
      errText,
    );

    if (!retriable || attempt === attempts) return null;
    await new Promise(r => setTimeout(r, attempt * 500));
  }

  return null;
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
  const stripped = stripEmailQuote(rawBody);
  const body = stripped || rawBody.trim();
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

  let token = await resolveEscalationTokenFromInbound(supabase, event, null);

  const email = await fetchReceivedEmail(emailId);
  if (!email) {
    return { ok: false, error: "Could not fetch received email", retriable: true };
  }

  if (!token) {
    token = await resolveEscalationTokenFromInbound(supabase, event, email);
  }
  if (!token) {
    console.warn("[escalation-inbound] could not resolve escalation", {
      email_id: emailId,
      from:     email.from ?? event.data?.from,
      to:       collectInboundRecipientAddresses(event, email),
      subject:  email.subject ?? event.data?.subject,
    });
    return { ok: false, error: "No escalation reference in recipient address", retriable: false };
  }

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
    console.warn("[escalation-inbound] failed to record reply", {
      email_id: emailId,
      token,
      error:    result.error,
    });
    return { ok: false, error: result.error ?? "Failed to record reply", retriable: false };
  }

  return { ok: true };
}
