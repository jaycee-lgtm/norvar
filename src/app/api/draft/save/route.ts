import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { saveDraftToProject } from "@/lib/draft-document-server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { draft_id, folder_id = null, format = "docx" } = await req.json();
  if (!draft_id) return Response.json({ error: "draft_id required" }, { status: 400 });
  if (format !== "docx" && format !== "pdf" && format !== "txt") {
    return Response.json({ error: "format must be docx, pdf, or txt" }, { status: 400 });
  }

  try {
    const result = await saveDraftToProject(userId, draft_id, folder_id, format);
    return Response.json({ ok: true, ...result });
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 },
    );
  }
}
