import { createClient } from "@supabase/supabase-js";
import {
  extractDocumentText,
  formatDocumentBlock,
  validateExtractedText,
} from "@/lib/document-text";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export type UserDocument = {
  id:          string;
  name:        string;
  file_type:   string | null;
  file_size:   number | null;
  folder_id:   string | null;
  status:      string;
  created_at?: string;
};

export async function fetchDocumentText(docId: string, userId: string): Promise<string> {
  const { data: doc } = await supabase
    .from("documents")
    .select("file_path, name, file_type")
    .eq("id", docId)
    .eq("user_id", userId)
    .single();

  if (!doc?.file_path) return "";

  const { data: fileData } = await supabase.storage
    .from("documents")
    .download(doc.file_path);

  if (!fileData) return "";

  try {
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const text = await extractDocumentText(buffer, doc.file_type, doc.name);
    const readable = validateExtractedText(text, doc.name);
    return formatDocumentBlock(doc.name, readable);
  } catch {
    return `[Document: ${doc.name} — text could not be extracted. Re-upload as a text PDF or paste content directly.]`;
  }
}

export async function buildDocumentContextBlock(
  documentIds: string[],
  userId: string,
): Promise<string> {
  const unique = [...new Set(documentIds.filter(Boolean))];
  if (!unique.length) return "";

  const parts = await Promise.all(unique.map(id => fetchDocumentText(id, userId)));
  const texts = parts.filter(Boolean);
  if (!texts.length) return "";

  return `\n\nREFERENCED DOCUMENTS:\n${texts.join("\n\n")}`;
}

export async function syncDocumentProjectLink(
  userId: string,
  documentId: string,
  folderId: string | null,
) {
  await supabase
    .from("folder_items")
    .delete()
    .eq("item_type", "document")
    .eq("item_id", documentId);

  if (folderId) {
    await supabase.from("folder_items").upsert({
      folder_id: folderId,
      item_type: "document",
      item_id:   documentId,
    });
  }

  await supabase
    .from("documents")
    .update({ folder_id: folderId })
    .eq("id", documentId)
    .eq("user_id", userId);
}
