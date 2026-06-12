import { createClient } from "@supabase/supabase-js";

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

  if (["txt", "md", "csv"].includes(doc.file_type ?? "")) {
    return `[Document: ${doc.name}]\n${await fileData.text()}`;
  }

  return `[Document attached: ${doc.name} (${(doc.file_type ?? "file").toUpperCase()})]`;
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
