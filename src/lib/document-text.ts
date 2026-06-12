import mammoth from "mammoth";
import { isReadableChunkText } from "@/lib/rag";

export function fileExtension(fileType: string | null | undefined, fileName?: string): string {
  if (fileType?.trim()) return fileType.trim().toLowerCase();
  const ext = fileName?.split(".").pop()?.toLowerCase();
  return ext ?? "";
}

export async function extractDocumentText(
  buffer: Buffer,
  fileType: string | null | undefined,
  fileName?: string,
): Promise<string> {
  const ext = fileExtension(fileType, fileName);

  if (["txt", "md", "csv"].includes(ext)) {
    return buffer.toString("utf-8");
  }

  if (ext === "docx" || ext === "doc") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value.replace(/\r\n/g, "\n").trim();
  }

  if (ext === "pdf") {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return (result.text ?? "").replace(/\r\n/g, "\n").trim();
    } finally {
      await parser.destroy();
    }
  }

  return "";
}

export function validateExtractedText(text: string, fileName: string): string {
  if (isReadableChunkText(text)) return text;
  throw new Error(
    `Could not extract readable text from "${fileName}". `
    + "Try a text-based PDF, paste the contract text directly, or upload a .txt file.",
  );
}

export const MAX_DOCUMENT_TEXT_CHARS = 12_000;

export function formatDocumentBlock(fileName: string, text: string): string {
  const trimmed = text.trim().slice(0, MAX_DOCUMENT_TEXT_CHARS);
  return `[Document: ${fileName}]\n${trimmed}`;
}
