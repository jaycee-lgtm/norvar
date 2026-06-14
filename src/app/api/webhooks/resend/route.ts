import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  processInboundEscalationEmail,
  verifyResendWebhook,
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

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(payload);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await processInboundEscalationEmail(supabase, event);
  if (!result.ok) {
    console.warn("[webhooks/resend]", result.error);
    // Acknowledge so Resend does not retry non-escalation mail indefinitely.
    return Response.json({ ok: false, error: result.error });
  }

  return Response.json({ ok: true });
}
