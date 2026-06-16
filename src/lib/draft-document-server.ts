import { createClient } from "@supabase/supabase-js";
import { buildFullDraftText, draftExportFilename, type DraftOutput } from "@/lib/draft";
import { buildDocxBuffer, buildPdfBuffer } from "@/lib/redline-export";
import { syncDocumentProjectLink } from "@/lib/documents";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type DraftExportFormat = "docx" | "pdf" | "txt";

export function draftDisplayTitle(draft: DraftOutput, fallbackType?: string): string {
  return draft.document_name || draft.title || draft.agreement_type || fallbackType || "Agreement Draft";
}

export async function buildDraftExportBuffer(
  draft: DraftOutput,
  format: DraftExportFormat,
  fallbackType?: string,
): Promise<{ buffer: Buffer; contentType: string; filename: string; body: string }> {
  const title    = draftDisplayTitle(draft, fallbackType);
  const body     = buildFullDraftText(draft);
  const filename = draftExportFilename(draft, format);

  if (format === "txt") {
    return {
      buffer:      Buffer.from(body, "utf-8"),
      contentType: "text/plain; charset=utf-8",
      filename,
      body,
    };
  }

  if (format === "pdf") {
    const buffer = await buildPdfBuffer(title, body);
    return {
      buffer,
      contentType: "application/pdf",
      filename,
      body,
    };
  }

  const buffer = await buildDocxBuffer(title, body);
  return {
    buffer,
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    filename,
    body,
  };
}

export async function saveDraftToProject(
  userId: string,
  draftId: string,
  folderId: string | null,
  format: DraftExportFormat = "docx",
) {
  const { data: row, error } = await supabase
    .from("drafted_agreements")
    .select("id, agreement_type, result, document_id")
    .eq("id", draftId)
    .eq("user_id", userId)
    .single();

  if (error || !row) throw new Error("Draft not found");

  const draft = row.result as DraftOutput;
  const { buffer, contentType, filename } = await buildDraftExportBuffer(
    draft,
    format,
    row.agreement_type ?? undefined,
  );

  const ext      = format === "pdf" ? "pdf" : format === "docx" ? "docx" : "txt";
  const docName  = filename.endsWith(`.${ext}`) ? filename : `${filename}`;
  const fileType = ext;

  let documentId = row.document_id as string | null;

  if (documentId) {
    const { data: existing } = await supabase
      .from("documents")
      .select("id, file_path")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    if (existing?.file_path) {
      const { error: uploadErr } = await supabase.storage
        .from("documents")
        .upload(existing.file_path, buffer, { contentType, upsert: true });

      if (uploadErr) throw new Error(uploadErr.message);

      await supabase.from("documents").update({
        name:      docName,
        file_type: fileType,
        file_size: buffer.length,
        status:    "active",
      }).eq("id", documentId);

      if (folderId !== undefined) {
        await syncDocumentProjectLink(userId, documentId, folderId);
      }

      await supabase.from("drafted_agreements").update({
        folder_id: folderId,
      }).eq("id", draftId).eq("user_id", userId);

      return { document_id: documentId, filename: docName, folder_id: folderId };
    }
  }

  const { data: doc, error: insertErr } = await supabase
    .from("documents")
    .insert({
      user_id:     userId,
      name:        docName,
      description: `Drafted agreement — ${draftDisplayTitle(draft, row.agreement_type ?? undefined)}`,
      file_type:   fileType,
      file_size:   buffer.length,
      folder_id:   folderId,
      tags:        ["draft", "petra"],
      file_path:   "",
      status:      "active",
    })
    .select("id")
    .single();

  if (insertErr || !doc) throw new Error(insertErr?.message || "Could not create document");

  documentId = doc.id;
  const filePath = `${userId}/${documentId}/${docName}`;

  const { error: uploadErr } = await supabase.storage
    .from("documents")
    .upload(filePath, buffer, { contentType, upsert: true });

  if (uploadErr) throw new Error(uploadErr.message);

  await supabase.from("documents").update({ file_path: filePath }).eq("id", documentId);

  if (folderId) {
    await supabase.from("folder_items").upsert({
      folder_id: folderId,
      item_type: "document",
      item_id:   documentId,
    });
  }

  await supabase.from("drafted_agreements").update({
    document_id: documentId,
    folder_id:   folderId,
  }).eq("id", draftId).eq("user_id", userId);

  return { document_id: documentId, filename: docName, folder_id: folderId };
}
