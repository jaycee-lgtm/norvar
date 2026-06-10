import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// GET — list user's folders with item counts
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const { data: folder, error } = await supabase
      .from("project_folders")
      .select("*, folder_items(*)")
      .eq("id", id)
      .eq("user_id", userId)
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ folder });
  }

  const { data, error } = await supabase
    .from("project_folders")
    .select("*, folder_items(count)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ folders: data });
}

// POST — create folder
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { name, description, color } = await req.json();
  if (!name) return Response.json({ error: "Name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("project_folders")
    .insert({ user_id: userId, name, description, color: color ?? "#8b1a1a" })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ folder: data });
}

// PATCH — rename, update colour, or add/remove items
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { id, name, description, color, add_item, remove_item } = await req.json();
  if (!id) return Response.json({ error: "Folder ID required" }, { status: 400 });

  const { data: folder } = await supabase
    .from("project_folders")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (!folder) return Response.json({ error: "Not found" }, { status: 404 });

  if (name || description || color) {
    const updates: Record<string, unknown> = {};
    if (name)        updates.name        = name;
    if (description) updates.description = description;
    if (color)       updates.color       = color;
    await supabase.from("project_folders").update(updates).eq("id", id);
  }

  if (add_item) {
    await supabase.from("folder_items").upsert({
      folder_id: id,
      item_type: add_item.type,
      item_id:   add_item.id,
    });
  }

  if (remove_item) {
    await supabase.from("folder_items")
      .delete()
      .eq("folder_id", id)
      .eq("item_type", remove_item.type)
      .eq("item_id",   remove_item.id);
  }

  return Response.json({ ok: true });
}

// DELETE — delete folder (items are unlinked, not deleted)
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return Response.json({ error: "Folder ID required" }, { status: 400 });

  await supabase.from("project_folders").delete().eq("id", id).eq("user_id", userId);
  return Response.json({ ok: true });
}
