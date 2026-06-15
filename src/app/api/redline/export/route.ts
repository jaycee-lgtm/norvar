import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { buildExportFilename } from "@/lib/redline-apply";
import { buildDocxBuffer, buildPdfBuffer } from "@/lib/redline-export";
import {
  applyAndSaveRedline,
  getAppliedOrFreshText,
  loadRedlineRow,
} from "@/lib/redline-document-server";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const {
    redline_id,
    format = "docx",
    include_rewrites = false,
    apply_first = true,
    decisions,
  } = await req.json();

  if (!redline_id) return Response.json({ error: "redline_id required" }, { status: 400 });
  if (format !== "docx" && format !== "pdf") {
    return Response.json({ error: "format must be docx or pdf" }, { status: 400 });
  }

  const row = await loadRedlineRow(redline_id, userId);
  if (!row) return Response.json({ error: "Review not found" }, { status: 404 });

  try {
    const activeDecisions = decisions ?? row.change_decisions ?? undefined;
    const { text, meta } = apply_first
      ? await applyAndSaveRedline(row, userId, !!include_rewrites, activeDecisions ?? undefined)
      : await getAppliedOrFreshText(row, userId, !!include_rewrites, activeDecisions ?? undefined);

    const title = `${row.result.agreement_type || row.agreement_type || "Agreement"} — Redlined`;
    const filename = buildExportFilename(row.result.agreement_type || row.agreement_type || "contract", format);

    const buffer = format === "docx"
      ? await buildDocxBuffer(title, text)
      : await buildPdfBuffer(title, text);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Applied-Clauses": String(meta.clauses_applied),
        "X-Skipped-Clauses": String(meta.clauses_skipped),
      },
    });
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Export failed" },
      { status: 400 },
    );
  }
}
