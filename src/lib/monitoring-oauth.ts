import crypto from "crypto";

const STATE_SECRET =
  process.env.MONITORING_OAUTH_STATE_SECRET
  || process.env.NEXTAUTH_SECRET
  || "norvar-oauth-state";
const STATE_TTL_MS = 10 * 60 * 1000;

export type OAuthProvider = "github" | "gitlab" | "jira";

export type OAuthState = {
  orgId:    string;
  userId:   string;
  provider: OAuthProvider;
  issuedAt: number;
};

function isOAuthState(value: unknown): value is OAuthState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<OAuthState>;
  return (
    typeof state.orgId === "string"
    && state.orgId.length > 0
    && typeof state.userId === "string"
    && state.userId.length > 0
    && (state.provider === "github" || state.provider === "gitlab" || state.provider === "jira")
    && typeof state.issuedAt === "number"
    && Number.isFinite(state.issuedAt)
  );
}

export function createOAuthState(
  orgId: string,
  userId: string,
  provider: OAuthProvider,
): string {
  const state: OAuthState = { orgId, userId, provider, issuedAt: Date.now() };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  const sig = crypto.createHmac("sha256", STATE_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyOAuthState(token: string): OAuthState | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, sig] = parts;
  if (!payload || !sig) return null;

  const expectedSig = crypto.createHmac("sha256", STATE_SECRET).update(payload).digest("base64url");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
  } catch {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString()) as unknown;
    if (!isOAuthState(decoded)) return null;
    if (Date.now() - decoded.issuedAt > STATE_TTL_MS) return null;
    if (decoded.issuedAt > Date.now() + 60_000) return null;
    return decoded;
  } catch {
    return null;
  }
}

export function generateWebhookSecret(): string {
  return crypto.randomBytes(32).toString("hex");
}

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://norvar.io";
