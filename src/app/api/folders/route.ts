import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { enrichRemediationGapIds } from "@/lib/gap-id";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function loadProjectDetail(folderId: string, userId: string) {
  const { data: folder, error } = await supabase
    .from("project_folders")
    .select("*")
    .eq("id", folderId)
    .eq("user_id", userId)
    .single();

  if (error || !folder) return null;

  const { data: linkedItems } = await supabase
    .from("folder_items")
    .select("item_type, item_id")
    .eq("folder_id", folderId);

  const linkedAssessmentIds = (linkedItems ?? [])
    .filter(i => i.item_type === "assessment")
    .map(i => i.item_id);
  const linkedChatIds = (linkedItems ?? [])
    .filter(i => i.item_type === "chat")
    .map(i => i.item_id);

  const { data: assessmentsByFolder } = await supabase
    .from("assessments")
    .select("id, title, description, assessment_number, risk_tier, risk_score, created_at, domains, folder_id")
    .eq("user_id", userId)
    .eq("folder_id", folderId)
    .order("created_at", { ascending: false });

  let assessmentsExtra: typeof assessmentsByFolder = [];
  if (linkedAssessmentIds.length) {
    const { data } = await supabase
      .from("assessments")
      .select("id, title, description, assessment_number, risk_tier, risk_score, created_at, domains, folder_id")
      .eq("user_id", userId)
      .in("id", linkedAssessmentIds);
    assessmentsExtra = data ?? [];
  }

  const assessmentMap = new Map<string, NonNullable<typeof assessmentsByFolder>[number]>();
  for (const a of [...(assessmentsByFolder ?? []), ...assessmentsExtra]) {
    assessmentMap.set(a.id, a);
  }
  const assessments = [...assessmentMap.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const linkedDocIds = (linkedItems ?? [])
    .filter(i => i.item_type === "document")
    .map(i => i.item_id);

  const { data: documentsByFolder } = await supabase
    .from("documents")
    .select("id, name, description, file_type, file_size, status, created_at, folder_id")
    .eq("user_id", userId)
    .eq("folder_id", folderId)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  let documentsExtra: typeof documentsByFolder = [];
  if (linkedDocIds.length) {
    const { data } = await supabase
      .from("documents")
      .select("id, name, description, file_type, file_size, status, created_at, folder_id")
      .eq("user_id", userId)
      .eq("status", "active")
      .in("id", linkedDocIds);
    documentsExtra = data ?? [];
  }

  const documentMap = new Map<string, NonNullable<typeof documentsByFolder>[number]>();
  for (const d of [...(documentsByFolder ?? []), ...documentsExtra]) {
    documentMap.set(d.id, d);
  }
  const documents = [...documentMap.values()].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const assessmentIds = assessments.map(a => a.id);
  let gaps: Record<string, unknown>[] = [];
  if (assessmentIds.length) {
    const { data } = await supabase
      .from("remediation_items")
      .select("id, gap_title, gap_severity, gap_domain, gap_key, gap_number, status, assessment_id, assessment_number, project_title, created_at")
      .in("assessment_id", assessmentIds)
      .order("created_at", { ascending: false });
    gaps = enrichRemediationGapIds((data ?? []) as Parameters<typeof enrichRemediationGapIds>[0]);
  }

  let chats: Record<string, unknown>[] = [];
  if (linkedChatIds.length) {
    const { data } = await supabase
      .from("conversations")
      .select("id, title, updated_at, created_at")
      .eq("user_id", userId)
      .in("id", linkedChatIds)
      .order("updated_at", { ascending: false });
    chats = data ?? [];
  }

  return {
    folder,
    assessments,
    documents: documents ?? [],
    gaps,
    chats,
    counts: {
      assessments: assessments.length,
      documents:   (documents ?? []).length,
      gaps:        gaps.length,
      open_gaps:   gaps.filter(g => g.status !== "resolved" && g.status !== "wont_fix").length,
      chats:       chats.length,
    },
  };
}

async function syncItemFolder(
  userId: string,
  itemType: "assessment" | "document" | "chat",
  itemId: string,
  folderId: string | null,
) {
  if (itemType === "assessment") {
    await supabase.from("assessments")
      .update({ folder_id: folderId })
      .eq("id", itemId)
      .eq("user_id", userId);
  }
  if (itemType === "document") {
    await supabase.from("documents")
      .update({ folder_id: folderId })
      .eq("id", itemId)
      .eq("user_id", userId);
  }
}

// GET — list projects or load one with assessments, documents, gaps, chats
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const detail = await loadProjectDetail(id, userId);
    if (!detail) return Response.json({ error: "Project not found" }, { status: 404 });
    return Response.json(detail);
  }

  const { data: folders, error } = await supabase
    .from("project_folders")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const enriched = await Promise.all(
    (folders ?? []).map(async f => {
      const detail = await loadProjectDetail(f.id, userId);
      return {
        ...f,
        counts: detail?.counts ?? {
          assessments: 0, documents: 0, gaps: 0, open_gaps: 0, chats: 0,
        },
      };
    }),
  );

  return Response.json({ folders: enriched });
}

// POST — create project
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { name, description, color } = await req.json();
  if (!name?.trim()) return Response.json({ error: "Name required" }, { status: 400 });

  const { data, error } = await supabase
    .from("project_folders")
    .insert({
      user_id:     userId,
      name:        name.trim(),
      description: description?.trim() || null,
      color:       color ?? "#8b1a1a",
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ folder: data });
}

// PATCH — update project or add/remove linked items
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { id, name, description, color, add_item, remove_item } = await req.json();
  if (!id) return Response.json({ error: "Project ID required" }, { status: 400 });

  const { data: folder } = await supabase
    .from("project_folders")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (!folder) return Response.json({ error: "Not found" }, { status: 404 });

  if (name || description !== undefined || color) {
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name?.trim())        updates.name        = name.trim();
    if (description !== undefined) updates.description = description?.trim() || null;
    if (color)               updates.color       = color;
    await supabase.from("project_folders").update(updates).eq("id", id);
  }

  if (add_item?.type && add_item?.id) {
    const type = add_item.type as "assessment" | "document" | "chat";
    if (type === "document") {
      await supabase.from("folder_items")
        .delete()
        .eq("item_type", "document")
        .eq("item_id", add_item.id);
    }
    await supabase.from("folder_items").upsert({
      folder_id: id,
      item_type: type,
      item_id:   add_item.id,
    });
    await syncItemFolder(userId, type, add_item.id, id);
  }

  if (remove_item?.type && remove_item?.id) {
    await supabase.from("folder_items")
      .delete()
      .eq("folder_id", id)
      .eq("item_type", remove_item.type)
      .eq("item_id",   remove_item.id);
    if (remove_item.type === "assessment" || remove_item.type === "document") {
      await syncItemFolder(userId, remove_item.type, remove_item.id, null);
    }
  }

  const detail = await loadProjectDetail(id, userId);
  return Response.json({ ok: true, ...detail });
}

// DELETE — delete project (assessments/documents keep but unlink)
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return Response.json({ error: "Project ID required" }, { status: 400 });

  const { data: folder } = await supabase
    .from("project_folders")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (!folder) return Response.json({ error: "Not found" }, { status: 404 });

  const { data: assessments } = await supabase
    .from("assessments")
    .select("id")
    .eq("folder_id", id)
    .eq("user_id", userId);
  for (const a of assessments ?? []) {
    await syncItemFolder(userId, "assessment", a.id, null);
  }

  const { data: documents } = await supabase
    .from("documents")
    .select("id")
    .eq("folder_id", id)
    .eq("user_id", userId);
  for (const d of documents ?? []) {
    await syncItemFolder(userId, "document", d.id, null);
  }

  await supabase.from("project_folders").delete().eq("id", id).eq("user_id", userId);
  return Response.json({ ok: true });
}
