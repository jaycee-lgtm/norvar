import { NextRequest } from "next/server";
import { sendContactEmail } from "@/lib/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  const name    = body.name?.trim() ?? "";
  const email   = body.email?.trim() ?? "";
  const message = body.message?.trim() ?? "";

  if (!name || name.length > 120) {
    return Response.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (message.length < 10 || message.length > 5000) {
    return Response.json({ error: "Message must be between 10 and 5000 characters." }, { status: 400 });
  }

  const result = await sendContactEmail({ name, email, message });
  if (!result.ok) {
    return Response.json(
      { error: result.error ?? "Could not send your message. Please email hello@norvar.io directly." },
      { status: 502 },
    );
  }

  return Response.json({ ok: true });
}
