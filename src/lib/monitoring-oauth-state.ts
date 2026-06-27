import crypto from "crypto";

export type MonitoringOAuthState = {
  orgId:  string;
  userId: string;
  ts:     number;
};

const MAX_AGE_MS = 15 * 60 * 1000;

function oauthSecret(): string {
  const secret =
    process.env.MONITORING_OAUTH_SECRET ??
    process.env.CLERK_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("MONITORING_OAUTH_SECRET is not configured");
  return secret;
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", oauthSecret()).update(payloadB64).digest("base64url");
}

export function createMonitoringOAuthState(orgId: string, userId: string): string {
  const payload: MonitoringOAuthState = { orgId, userId, ts: Date.now() };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyMonitoringOAuthState(token: string): MonitoringOAuthState | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const payloadB64 = token.slice(0, dot);
  const signature  = token.slice(dot + 1);
  if (!payloadB64 || !signature) return null;

  const expected = sign(payloadB64);
  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as MonitoringOAuthState;
    if (!payload.orgId || !payload.userId || !payload.ts) return null;
    if (Date.now() - payload.ts > MAX_AGE_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

export function appBaseUrl(fallbackHost?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (fallbackHost) return `https://${fallbackHost}`;
  return "https://norvar.io";
}
