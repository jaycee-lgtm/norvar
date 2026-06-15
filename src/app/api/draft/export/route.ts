import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { buildDraftExportBuffer } from "@/lib/draft-document-server";
import type { DraftOutput } from "@/lib/draft";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { draft_id, format = "docx" } = await req.json();
  if (!draft_id) return Response.json({ error: "draft_id required" }, { status: 400 });
  if (format !== "docx" && format !== "txt" && format !== "pdf") {
    return Response.json({ error: "format must be docx, txt, or pdf" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("drafted_agreements")
    .select("id, agreement_type, result")
    .eq("id", draft_id)
    .eq("user_id", userId)
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Draft not found" }, { status: 404 });

  const draft = data.result as DraftOutput;
  const { buffer, contentType, filename } = await buildDraftExportBuffer(
    draft,
    format,
    data.agreement_type ?? undefined,
  );

  if (format === "txt") {
    return new Response(buffer.toString("utf-8"), {
      headers: {
        "Content-Type":        contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":        contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
