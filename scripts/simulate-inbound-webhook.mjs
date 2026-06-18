import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      for (const line of readFileSync(file, "utf8").split("\n")) {
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
      // ignore
    }
  }
}

loadEnv();

const emailId = process.argv[2];
if (!emailId) {
  console.error("Usage: node scripts/simulate-inbound-webhook.mjs <received-email-id>");
  process.exit(1);
}

const { processInboundEscalationEmail } = await import("../src/lib/escalation-inbound.ts");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const event = {
  type: "email.received",
  data: { email_id: emailId },
};

const result = await processInboundEscalationEmail(sb, event);
console.log(JSON.stringify(result, null, 2));
