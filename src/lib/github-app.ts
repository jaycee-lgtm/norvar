import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type GithubInstallationToken = {
  token:      string;
  expires_at: string;
};

export type GithubInstallation = {
  id:       number;
  account:  { login: string; type: string };
  html_url: string;
};

type GithubConnectorRow = {
  id:               string;
  org_id:           string;
  installation_id:  string;
  access_token:     string | null;
  token_expires_at: string | null;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function normalizeGithubPrivateKey(raw: string): string {
  let key = raw.trim().replace(/^\uFEFF/, "");
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  key = key.replace(/\r\n/g, "\n");
  if (key.includes("\\n")) {
    key = key.replace(/\\n/g, "\n");
  }
  if (key.includes("\\\\n")) {
    key = key.replace(/\\\\n/g, "\n");
  }
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

export function loadGithubPrivateKey(raw: string): crypto.KeyObject {
  const normalized = normalizeGithubPrivateKey(raw);
  try {
    return crypto.createPrivateKey(normalized);
  } catch (firstErr) {
    // GitHub .pem files are PKCS#1; Node accepts both when formatted correctly.
    const message = firstErr instanceof Error ? firstErr.message : "invalid PEM";
    throw new Error(`GITHUB_APP_PRIVATE_KEY is invalid (${message}). Paste the full .pem from GitHub App settings — either multiline in Vercel or one line with \\n between lines.`);
  }
}

export function createGithubAppJwt(): string {
  const appId      = requireEnv("GITHUB_APP_ID");
  const privateKey = loadGithubPrivateKey(requireEnv("GITHUB_APP_PRIVATE_KEY"));
  const now        = Math.floor(Date.now() / 1000);

  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  })).toString("base64url");

  const data = `${header}.${payload}`;
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(data);
  sign.end();
  return `${data}.${sign.sign(privateKey, "base64url")}`;
}

async function githubAppFetch(path: string, init: RequestInit = {}) {
  const jwt = createGithubAppJwt();
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept:        "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }

  return res.json();
}

export async function fetchGithubInstallation(installationId: number): Promise<GithubInstallation> {
  return githubAppFetch(`/app/installations/${installationId}`) as Promise<GithubInstallation>;
}

export async function createGithubInstallationToken(
  installationId: number,
): Promise<GithubInstallationToken> {
  const data = await githubAppFetch(`/app/installations/${installationId}/access_tokens`, {
    method: "POST",
  }) as { token: string; expires_at: string };

  return { token: data.token, expires_at: data.expires_at };
}

function tokenIsFresh(expiresAt: string | null, skewMs = 5 * 60 * 1000): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() - Date.now() > skewMs;
}

export async function persistGithubInstallationToken(
  connectorId: string,
  token: GithubInstallationToken,
): Promise<void> {
  const { error } = await supabase
    .from("monitoring_connectors")
    .update({
      access_token:     token.token,
      token_expires_at: token.expires_at,
      status:           "active",
      error_message:    null,
      updated_at:       new Date().toISOString(),
    })
    .eq("id", connectorId);

  if (error) throw new Error(error.message);
}

/** Return a valid installation token, refreshing and persisting when expired. */
export async function getGithubInstallationAccessToken(
  connector: GithubConnectorRow,
): Promise<string> {
  if (connector.access_token && tokenIsFresh(connector.token_expires_at)) {
    return connector.access_token;
  }

  const installationId = Number(connector.installation_id);
  if (!Number.isFinite(installationId)) {
    throw new Error("Invalid GitHub installation_id on connector");
  }

  const token = await createGithubInstallationToken(installationId);
  await persistGithubInstallationToken(connector.id, token);
  return token.token;
}

export function githubAppInstallUrl(state: string): string {
  const slug = requireEnv("GITHUB_APP_SLUG");
  const params = new URLSearchParams({ state });
  return `https://github.com/apps/${slug}/installations/new?${params.toString()}`;
}

export function githubWebhookSecret(): string {
  return requireEnv("GITHUB_APP_WEBHOOK_SECRET");
}

/** Prefer app-level secret so webhooks work before a connector row exists. */
export function resolveGithubWebhookSecret(connectorSecret?: string | null): string {
  return (
    process.env.GITHUB_APP_WEBHOOK_SECRET?.trim() ||
    connectorSecret?.trim() ||
    ""
  );
}

/** Store on connector rows; falls back to empty when env is unset. */
export function githubWebhookSecretForStorage(): string {
  return resolveGithubWebhookSecret();
}
