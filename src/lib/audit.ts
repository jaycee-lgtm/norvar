import type { NextRequest } from "next/server";

/** Read at runtime — avoids Next.js inlining undefined when AUDIT_SECRET is added after build. */
export function getAuditSecret(): string | undefined {
  return process.env["AUDIT_SECRET"]?.trim() || undefined;
}

export function isAuditRequest(req: NextRequest): boolean {
  const secret = getAuditSecret();
  if (!secret) return false;
  const header = req.headers.get("x-audit-secret")?.trim();
  return header === secret;
}
