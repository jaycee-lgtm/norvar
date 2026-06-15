import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { buildFullDraftText, draftExportFilename, type DraftOutput } from "@/lib/draft";
import { buildDocxBuffer } from "@/lib/redline-export";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { draft_id, format = "docx" } = await req.json();
  if (!draft_id) return Response.json({ error: "draft_id required" }, { status: 400 });
  if (format !== "docx" && format !== "txt") {
    return Response.json({ error: "format must be docx or txt" }, { status: 400 });
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
  const title = draft.title || draft.agreement_type || data.agreement_type || "Agreement Draft";
  const body  = buildFullDraftText(draft);
  const filename = draftExportFilename(draft, format);

  if (format === "txt") {
    return new Response(body, {
      headers: {
        "Content-Type":        "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const buffer = await buildDocxBuffer(title, body);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
