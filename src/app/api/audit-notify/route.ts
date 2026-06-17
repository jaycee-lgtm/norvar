import { NextRequest, NextResponse } from "next/server";
import { isAuditRequest } from "@/lib/audit";
import { sendAuditReportEmail } from "@/lib/audit-email";

export async function POST(req: NextRequest) {
  if (!isAuditRequest(req)) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { to, subject, body } = await req.json();

  if (!to || !subject || !body) {
    return NextResponse.json({ error: "Missing to, subject, or body" }, { status: 400 });
  }

  const result = await sendAuditReportEmail({ to: String(to), subject: String(subject), body: String(body) });

  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? "Send failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
