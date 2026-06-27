#!/usr/bin/env node
/**
 * Validate GitHub App env vars locally before deploying.
 * Copy GITHUB_APP_* from Vercel into .env.local, then:
 *   node scripts/verify-github-app-env.mjs
 */

import crypto from "crypto";
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

function normalizeGithubPrivateKey(raw) {
  let key = raw.trim().replace(/^\uFEFF/, "");
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/\r\n/g, "\n");
  if (key.includes("\\n")) key = key.replace(/\\n/g, "\n");
  if (key.includes("\\\\n")) key = key.replace(/\\\\n/g, "\n");
  if (key.includes("-----BEGIN") && !key.includes("\n")) {
    const begin = key.match(/-----BEGIN [^-]+-----/)?.[0];
    const end = key.match(/-----END [^-]+-----/)?.[0];
    if (begin && end) {
      const body = key.slice(begin.length, key.length - end.length).replace(/\s+/g, "");
      const lines = body.match(/.{1,64}/g) ?? [body];
      key = `${begin}\n${lines.join("\n")}\n${end}\n`;
    }
  }
  if (!key.endsWith("\n")) key += "\n";
  return key;
}

const appId = process.env.GITHUB_APP_ID?.trim();
const rawKey = process.env.GITHUB_APP_PRIVATE_KEY ?? "";
const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET?.trim() ?? "";
const slug = process.env.GITHUB_APP_SLUG?.trim();

console.log("\nGitHub App env check\n");
console.log("GITHUB_APP_ID:", appId ? `set (${appId.length} chars)` : "MISSING");
console.log("GITHUB_APP_SLUG:", slug ? `set (${slug})` : "MISSING");
console.log("GITHUB_APP_WEBHOOK_SECRET:", webhookSecret ? `set (${webhookSecret.length} chars)` : "MISSING");
console.log("GITHUB_APP_PRIVATE_KEY:", rawKey ? `set (${rawKey.length} chars)` : "MISSING");

if (!appId || !rawKey) {
  console.error("\nFAIL — copy GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY from Vercel into .env.local");
  process.exit(1);
}

if (!/^\d+$/.test(appId)) {
  console.warn("\nWARN — GITHUB_APP_ID should be numeric (e.g. 4157240)");
}

try {
  const pem = normalizeGithubPrivateKey(rawKey);
  const key = crypto.createPrivateKey(pem);
  console.log("\nPrivate key: OK (" + key.asymmetricKeyType + ")");

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ iat: now - 60, exp: now + 600, iss: appId })).toString("base64url");
  const data = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(data);
  sign.end();
  sign.sign(key, "base64url");
  console.log("JWT sign: OK");
} catch (err) {
  console.error("\nFAIL — private key:", err.message);
  console.error("\nFix: In Vercel, re-paste the .pem downloaded from GitHub → App → Private keys.");
  console.error("Use multiline paste OR one line with literal \\n between PEM lines.");
  process.exit(1);
}

if (!webhookSecret) {
  console.warn("\nWARN — GITHUB_APP_WEBHOOK_SECRET is empty");
} else {
  console.log("Webhook secret: OK");
}

console.log("\nPASS — env vars look valid. Deploy, then rerun: node scripts/test-github-monitor.mjs\n");
