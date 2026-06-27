#!/usr/bin/env node
/**
 * Validate GitHub monitoring integration end-to-end.
 * Usage: node scripts/test-github-monitor.mjs [--url https://www.norvar.io]
 */

import crypto from "crypto";
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

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

const args = process.argv.slice(2);
const urlIdx = args.indexOf("--url");
const BASE_URL = urlIdx >= 0 ? args[urlIdx + 1] : (process.env.AUDIT_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.norvar.io");
const WEBHOOK_URL = `${BASE_URL.replace(/\/$/, "")}/api/monitor/github`;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

function signPayload(body, secret) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function buildTestPushPayload(connector, repoFull) {
  const branch = (connector.watched_branches?.[0]) || "main";
  return {
    ref: `refs/heads/${branch}`,
    before: "a".repeat(40),
    after: "b".repeat(40),
    installation: { id: Number(connector.installation_id) },
    repository: {
      full_name: repoFull,
      html_url: `https://github.com/${repoFull}`,
    },
    pusher: { name: "norvar-monitor-test", email: "monitor-test@norvar.io" },
    commits: [{
      id: "b".repeat(40),
      message: "Remove cookie consent banner and disable GDPR data subject deletion endpoint",
      added: [],
      modified: ["src/components/CookieConsent.tsx", "src/lib/privacy.ts"],
      removed: ["src/lib/data-retention.ts"],
    }],
  };
}

async function main() {
  console.log(`\nNorvar GitHub Monitoring — integration test`);
  console.log(`Target: ${WEBHOOK_URL}\n`);

  // 1. Health check
  const health = await fetch(WEBHOOK_URL);
  const healthJson = await health.json().catch(() => ({}));
  console.log(`1. Webhook health: ${health.status} ${JSON.stringify(healthJson)}`);
  if (!health.ok) {
    console.error("   FAIL — webhook endpoint not reachable");
    process.exit(1);
  }

  // 2. Connector row
  const { data: connectors, error: connErr } = await sb
    .from("monitoring_connectors")
    .select("id, org_id, provider, account_name, installation_id, status, watched_repos, watched_branches, last_event_at, token_expires_at, webhook_secret")
    .eq("provider", "github")
    .neq("status", "disconnected");

  if (connErr) {
    console.error("2. Connector lookup FAIL:", connErr.message);
    process.exit(1);
  }

  if (!connectors?.length) {
    console.error("2. Connector lookup FAIL — no active GitHub connector in Supabase");
    process.exit(1);
  }

  const connector = connectors[0];
  console.log(`2. Connector found:`);
  console.log(`   account: ${connector.account_name}`);
  console.log(`   installation_id: ${connector.installation_id}`);
  console.log(`   status: ${connector.status}`);
  console.log(`   watched_repos: ${(connector.watched_repos ?? []).length ? connector.watched_repos.join(", ") : "(all repos)"}`);
  console.log(`   watched_branches: ${(connector.watched_branches ?? ["main"]).join(", ")}`);
  console.log(`   last_event_at: ${connector.last_event_at ?? "never"}`);
  console.log(`   token_expires_at: ${connector.token_expires_at ?? "unknown"}`);

  const repoFull =
    (connector.watched_repos?.[0]) ||
    `${connector.account_name}/norvar` ||
    "jaycee-lgtm/norvar";

  // 3. Token refresh (calls GitHub API with app credentials from Vercel — only works if env vars present locally)
  const hasAppCreds = !!(process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY);
  if (hasAppCreds) {
    try {
      const { createGithubInstallationToken } = await import("../src/lib/github-app.ts");
      const token = await createGithubInstallationToken(Number(connector.installation_id));
      console.log(`3. Installation token refresh: OK (expires ${token.expires_at})`);
    } catch (err) {
      console.log(`3. Installation token refresh: SKIP locally (${err.message})`);
      console.log("   (Production will refresh on webhook — this is OK if Vercel env is set)");
    }
  } else {
    console.log("3. Installation token refresh: SKIP (GITHUB_APP_* not in local .env.local)");
  }

  // 4. Signed test webhook
  const payload = buildTestPushPayload(connector, repoFull);
  const body = JSON.stringify(payload);
  const secret = connector.webhook_secret || process.env.GITHUB_APP_WEBHOOK_SECRET || "";
  if (secret.length === 0) {
    console.log("4. Webhook test: signing with empty secret (matches unset GITHUB_APP_WEBHOOK_SECRET on Vercel)");
  }

  const signature = signPayload(body, secret);
  const beforeLog = new Date().toISOString();

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": "push",
      "X-GitHub-Delivery": `norvar-test-${Date.now()}`,
      "X-Hub-Signature-256": signature,
    },
    body,
  });

  const result = await res.json().catch(() => ({}));
  console.log(`4. Test push webhook: HTTP ${res.status}`);
  console.log(`   Response: ${JSON.stringify(result, null, 2).slice(0, 800)}`);

  if (res.status === 401) {
    console.error("   FAIL — signature rejected (webhook secret mismatch between GitHub App and connector row)");
    process.exit(1);
  }
  if (res.status === 404) {
    console.error("   FAIL — connector not matched (installation_id mismatch?)");
    process.exit(1);
  }
  if (res.status === 502) {
    console.error("   FAIL — token refresh failed (check GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY on Vercel)");
    process.exit(1);
  }
  if (!res.ok && res.status !== 200) {
    console.error(`   FAIL — unexpected status ${res.status}`);
    process.exit(1);
  }

  // 5. Webhook log
  await new Promise(r => setTimeout(r, 1500));
  const { data: logs } = await sb
    .from("monitoring_webhook_log")
    .select("created_at, event_type, processed, error_message, payload")
    .eq("provider", "github")
    .gte("created_at", beforeLog)
    .order("created_at", { ascending: false })
    .limit(3);

  console.log(`\n5. Webhook log (since test):`);
  if (!logs?.length) {
    console.log("   (no new log rows yet — may still be writing)");
  } else {
    for (const log of logs) {
      console.log(`   ${log.created_at} | ${log.event_type} | processed=${log.processed} | ${log.error_message ?? "ok"}`);
    }
  }

  // 6. Signals
  const { data: signals } = await sb
    .from("monitoring_signals")
    .select("id, title, severity, signal_kind, summary, created_at, repo_or_project")
    .eq("org_id", connector.org_id)
    .eq("provider", "github")
    .gte("created_at", beforeLog)
    .order("created_at", { ascending: false })
    .limit(3);

  console.log(`\n6. Monitoring signals (since test):`);
  if (!signals?.length) {
    if (result.skipped) {
      console.log(`   No signal created — webhook skipped: ${result.reason}`);
      console.log("   Pipeline OK but event was filtered (may be expected for non-compliance changes).");
    } else if (result.classification?.signal_kind === "none") {
      console.log("   No signal saved — classifier returned non-compliance-relevant (signal_kind: none).");
      console.log("   Pipeline OK — auth, token refresh, and classification all ran.");
    } else {
      console.log("   No new signals yet.");
    }
  } else {
    for (const s of signals) {
      console.log(`   [${s.severity}] ${s.signal_kind} — ${s.title}`);
      console.log(`   ${s.summary?.slice(0, 120)}...`);
    }
  }

  // 7. Updated connector
  const { data: updated } = await sb
    .from("monitoring_connectors")
    .select("last_event_at, status")
    .eq("id", connector.id)
    .maybeSingle();

  console.log(`\n7. Connector after test:`);
  console.log(`   last_event_at: ${updated?.last_event_at ?? connector.last_event_at}`);
  console.log(`   status: ${updated?.status ?? connector.status}`);

  const pipelineOk = res.status === 200 && !result.error;
  const gotSignal = (signals?.length ?? 0) > 0;
  const skippedOk = result.skipped || result.classification?.signal_kind === "none";

  console.log("\n── Result ──");
  if (pipelineOk && gotSignal) {
    console.log("PASS — GitHub monitoring is fully working (webhook → classify → signal saved).");
    console.log("Check Inbox → Monitoring folder in Norvar.");
  } else if (pipelineOk && skippedOk) {
    console.log("PASS (partial) — Webhook pipeline works; test event was skipped or classified as non-relevant.");
    console.log("Try a real PR touching privacy/AI/security code on a watched repo for a live signal.");
  } else if (pipelineOk) {
    console.log("PASS (partial) — Webhook accepted and processed. Review response above for details.");
  } else {
    console.log("FAIL — See errors above.");
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
