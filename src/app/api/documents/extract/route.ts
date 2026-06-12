import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import {
  extractDocumentText,
  fileExtension,
  formatDocumentBlock,
  validateExtractedText,
} from "@/lib/document-text";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = new Set(["txt", "md", "csv", "pdf", "docx", "doc"]);

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (max 15 MB)" }, { status: 413 });
  }

  const ext = fileExtension(null, file.name);
  if (!ALLOWED.has(ext)) {
    return NextResponse.json(
      { error: "Unsupported file type. Use PDF, DOCX, or TXT." },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const raw = await extractDocumentText(buffer, ext, file.name);
    const text = validateExtractedText(raw, file.name);
    return NextResponse.json({
      text,
      block: formatDocumentBlock(file.name, text),
      name:  file.name,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Could not read file";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
