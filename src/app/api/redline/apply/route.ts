import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  applyAndSaveRedline,
  loadRedlineRow,
} from "@/lib/redline-document-server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { redline_id, include_rewrites = false, decisions } = await req.json();
  if (!redline_id) return Response.json({ error: "redline_id required" }, { status: 400 });

  const row = await loadRedlineRow(redline_id, userId);
  if (!row) return Response.json({ error: "Review not found" }, { status: 404 });

  try {
    const { text, meta } = await applyAndSaveRedline(row, userId, !!include_rewrites, decisions);
    return Response.json({ ok: true, applied_text: text, applied_meta: meta });
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Could not apply changes" },
      { status: 400 },
    );
  }
}
