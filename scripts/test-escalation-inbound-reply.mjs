/**
 * Test escalation email reply ingestion.
 *
 *   node scripts/test-escalation-inbound-reply.mjs
 *     → sends mail to escalations+{token}@domain via Resend (full inbound + webhook path)
 *
 *   node scripts/test-escalation-inbound-reply.mjs --direct
 *     → writes a test reply row directly (UI only, skips Resend/webhook)
 *
 *   node scripts/test-escalation-inbound-reply.mjs --token=<uuid>
 *     → target a specific escalation token
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { randomUUID } from "crypto";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const content = readFileSync(file, "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq <= 0) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      // ignore missing file
    }
  }
}

function replyDomain() {
  const configured = process.env.ESCALATION_REPLY_DOMAIN?.trim();
  if (configured) return configured;
  const from = process.env.EMAIL_FROM ?? "Norvar <notifications@norvar.io>";
  const match = from.match(/@([a-z0-9.-]+)/i);
  return match?.[1] ?? "norvar.io";
}

function parseArgs(argv) {
  let direct = false;
  let token = null;
  for (const arg of argv) {
    if (arg === "--direct") direct = true;
    else if (arg.startsWith("--token=")) token = arg.slice("--token=".length).trim();
  }
  return { direct, token };
}

async function findEscalatedItem(supabase, token) {
  if (token) {
    const { data, error } = await supabase
      .from("remediation_items")
      .select("id, gap_title, escalation_token, escalation_email, escalation_status")
      .eq("escalation_token", token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from("remediation_items")
    .select("id, gap_title, escalation_token, escalation_email, escalation_status")
    .not("escalation_token", "is", null)
    .order("escalated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function insertDirectReply(supabase, item, body) {
  const inboundEmailId = `test-${randomUUID()}`;
  const from = "Test Responder <test-reply@example.com>";
  const detail = JSON.stringify({
    inbound_email_id: inboundEmailId,
    from_email:       "test-reply@example.com",
    from_name:        "Test Responder",
    subject:          `[ref:${item.escalation_token}] Re: Escalation test`,
    body,
  });

  const updates = {};
  if (item.escalation_status !== "closed") {
    updates.escalation_status = "responded";
  }
  if (Object.keys(updates).length) {
    await supabase.from("remediation_items").update(updates).eq("id", item.id);
  }

  const { error } = await supabase.from("remediation_activity").insert({
    remediation_id: item.id,
    user_id:        "test-reply@example.com",
    action:         "escalation_email_reply",
    detail,
  });

  if (error) throw new Error(error.message);
  return inboundEmailId;
}

async function sendInboundViaResend(item, domain) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const token = item.escalation_token;
  const to = `escalations+${token}@${domain}`;
  const subject = `[ref:${token}] Re: Escalation test — ${item.gap_title}`;
  const text =
    "This is an automated test escalation reply from Norvar.\n\n" +
    "If you see this under Email responses, inbound receiving and the webhook are working.";

  const from =
    process.env.ESCALATION_FROM?.trim() ||
    process.env.EMAIL_FROM?.trim() ||
    `Norvar Test <notifications@${domain}>`;

  const res = await fetch("https://api.resend.com/emails", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message ?? `Resend send failed (${res.status})`);
  }

  return { to, subject, resendId: data.id ?? null };
}

async function main() {
  loadEnv();
  const { direct, token: tokenArg } = parseArgs(process.argv.slice(2));

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const item = await findEscalatedItem(supabase, tokenArg);

  if (!item?.escalation_token) {
    console.error("No escalated gap with escalation_token found. Escalate a gap in the UI first.");
    process.exit(1);
  }

  const domain = replyDomain();
  console.log(`Gap: ${item.gap_title}`);
  console.log(`Token: ${item.escalation_token}`);
  console.log(`Reply address: escalations+${item.escalation_token}@${domain}`);

  if (direct) {
    const id = await insertDirectReply(
      supabase,
      item,
      "Direct test reply — inserted via script (bypasses Resend inbound/webhook).",
    );
    console.log(`Direct reply inserted (inbound_email_id=${id}). Refresh the remediation gap in the UI.`);
    return;
  }

  const result = await sendInboundViaResend(item, domain);
  console.log(`Sent inbound test email to ${result.to}`);
  if (result.resendId) console.log(`Resend outbound id: ${result.resendId}`);
  console.log("");
  console.log("Next: wait ~30s, then refresh the escalated gap → Email responses.");
  console.log("If nothing appears, check Resend → Webhooks for email.received delivery to /api/webhooks/resend.");
  console.log("For UI-only verification, rerun with: node scripts/test-escalation-inbound-reply.mjs --direct");
}

main().catch(err => {
  console.error(err.message ?? err);
  process.exit(1);
});
