import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  processInboundEscalationEmail,
  verifyResendWebhook,
  type InboundWebhookEvent,
} from "@/lib/escalation-inbound";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const secret  = process.env.RESEND_WEBHOOK_SECRET?.trim();

  if (secret) {
    const valid = verifyResendWebhook(payload, {
      id:        req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    }, secret);

    if (!valid) {
      return Response.json({ error: "Invalid webhook signature" }, { status: 401 });
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!parsed || typeof parsed !== "object" || typeof (parsed as InboundWebhookEvent).type !== "string") {
    return Response.json({ error: "Invalid webhook event" }, { status: 400 });
  }

  const event = parsed as InboundWebhookEvent;

  const result = await processInboundEscalationEmail(supabase, event);
  if (!result.ok) {
    console.warn("[webhooks/resend]", result.error);
    return Response.json(
      { ok: false, error: result.error },
      { status: result.retriable ? 500 : 200 },
    );
  }

  return Response.json({ ok: true });
}
