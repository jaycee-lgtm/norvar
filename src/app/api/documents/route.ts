import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { syncDocumentProjectLink } from "@/lib/documents";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// GET — list user's documents (optionally filter by folder or status)
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folder_id = searchParams.get("folder_id");
  const status    = searchParams.get("status") ?? "active";

  let query = supabase
    .from("documents")
    .select("*")
    .eq("user_id", userId)
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (folder_id) query = query.eq("folder_id", folder_id);

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ documents: data });
}

// POST — upload document metadata + get signed upload URL
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { name, description, file_type, file_size, folder_id, tags } = await req.json();
  if (!name) return Response.json({ error: "Name required" }, { status: 400 });

  // Create document record
  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      user_id:   userId,
      name,
      description,
      file_type,
      file_size,
      folder_id: folder_id || null,
      tags:      tags ?? [],
      file_path: "", // will be updated after upload
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Generate signed upload URL — path: {userId}/{docId}/{filename}
  const filePath = `${userId}/${doc.id}/${name}`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("documents")
    .createSignedUploadUrl(filePath);

  if (uploadError) return Response.json({ error: uploadError.message }, { status: 500 });

  // Update file_path on the record
  await supabase.from("documents").update({ file_path: filePath }).eq("id", doc.id);

  if (folder_id) {
    await supabase.from("folder_items").upsert({
      folder_id,
      item_type: "document",
      item_id:   doc.id,
    });
  }

  return Response.json({ document: { ...doc, file_path: filePath }, uploadUrl: uploadData.signedUrl });
}

// PATCH — archive, delete, or update metadata
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { id, status, name, description, folder_id, tags } = await req.json();
  if (!id) return Response.json({ error: "Document ID required" }, { status: 400 });

  // Hard delete — remove from Storage and DB entirely
  if (status === "deleted") {
    const { data: doc } = await supabase
      .from("documents")
      .select("file_path")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (doc?.file_path) {
      await supabase.storage.from("documents").remove([doc.file_path]);
    }

    await supabase.from("documents").delete().eq("id", id).eq("user_id", userId);
    return Response.json({ ok: true });
  }

  // Soft update (archive, restore, rename, retag)
  const updates: Record<string, unknown> = {};
  if (status)      updates.status      = status;
  if (name)        updates.name        = name;
  if (description) updates.description = description;
  if (tags)        updates.tags        = tags;

  if (folder_id !== undefined) {
    await syncDocumentProjectLink(userId, id, folder_id || null);
  } else if (Object.keys(updates).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }

  if (Object.keys(updates).length === 0) {
    const { data: doc } = await supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .eq("user_id", userId)
      .single();
    return Response.json({ document: doc });
  }

  const { data, error } = await supabase
    .from("documents")
    .update(updates)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ document: data });
}
