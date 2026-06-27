#!/usr/bin/env node
/**
 * Repair a missing GitHub monitoring connector from webhook log data.
 * Usage: node scripts/repair-github-connector.mjs [--org-id org_xxx] [--installation-id 142868632]
 */

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
function arg(name, fallback) {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : fallback;
}

const ORG_ID = arg("--org-id", "org_3F0UlRxvQ5EW12uK5wFoBfFZi4C");
const INSTALLATION_ID = arg("--installation-id", "142868632");
const ACCOUNT_NAME = arg("--account", "jaycee-lgtm");

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function main() {
  const { data: existing } = await sb
    .from("monitoring_connectors")
    .select("id, org_id, installation_id, status")
    .eq("provider", "github")
    .eq("installation_id", INSTALLATION_ID)
    .maybeSingle();

  if (existing) {
    console.log("Connector already exists:", existing);
    return;
  }

  let token = null;
  let tokenExpiresAt = null;

  if (process.env.GITHUB_APP_ID && process.env.GITHUB_APP_PRIVATE_KEY) {
    try {
      const { createGithubInstallationToken } = await import("../src/lib/github-app.ts");
      const refreshed = await createGithubInstallationToken(Number(INSTALLATION_ID));
      token = refreshed.token;
      tokenExpiresAt = refreshed.expires_at;
      console.log("Fetched installation token (expires", tokenExpiresAt, ")");
    } catch (err) {
      console.warn("Could not fetch token locally:", err.message);
      console.warn("Production will refresh on first webhook.");
    }
  }

  const row = {
    org_id:           ORG_ID,
    provider:         "github",
    installation_id:  INSTALLATION_ID,
    access_token:     token,
    token_expires_at: tokenExpiresAt,
    webhook_secret:   process.env.GITHUB_APP_WEBHOOK_SECRET ?? "",
    account_name:     ACCOUNT_NAME,
    watched_repos:    [],
    watched_projects: [],
    watched_branches: ["main", "master", "production"],
    status:           "active",
    connected_by:     null,
    error_message:    null,
    updated_at:       new Date().toISOString(),
  };

  const { data, error } = await sb
    .from("monitoring_connectors")
    .insert(row)
    .select("id, org_id, installation_id, account_name, status")
    .single();

  if (error) {
    console.error("Insert failed:", error.message);
    process.exit(1);
  }

  console.log("Repaired connector:", data);
  console.log("\nNext: node scripts/test-github-monitor.mjs --url https://www.norvar.io");
  console.log("(Requires GITHUB_APP_WEBHOOK_SECRET in .env.local for signed test, or redeploy first.)");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
