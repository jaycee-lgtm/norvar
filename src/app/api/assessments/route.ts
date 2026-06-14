import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { isInternalAssessmentPrompt, sanitizeAssessmentUserMessage } from "@/lib/assessment-questionnaire";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function displayAssessmentTitle(title: string, description?: string | null) {
  if (!isInternalAssessmentPrompt(title)) return title;
  return sanitizeAssessmentUserMessage(title, description ?? undefined);
}

function sanitizeAssessmentRow<T extends { title?: string; description?: string | null; messages?: unknown }>(row: T): T {
  const description = row.description ?? undefined;
  const title = displayAssessmentTitle(row.title ?? "", description);
  const messages = Array.isArray(row.messages)
    ? row.messages.map(m => {
        if (!m || typeof m !== "object" || !("role" in m) || (m as { role: string }).role !== "user") return m;
        const user = m as { role: "user"; content: string; tags?: string[] };
        return { ...user, content: sanitizeAssessmentUserMessage(user.content, description) };
      })
    : row.messages;
  return { ...row, title, description: sanitizeAssessmentUserMessage(description ?? "", title), messages };
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id    = searchParams.get("id");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

    // Single assessment — return full result + full messages array
    if (id) {
      const { data, error } = await supabase
        .from("assessments")
        .select("id, title, description, risk_tier, risk_score, created_at, domains, jurisdictions, result, messages, gap_chats, prior_nora_chat")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 404 });
      return NextResponse.json({ assessment: data ? sanitizeAssessmentRow(data) : data });
    }

    // List — summary rows for sidebar + history page
    const { data, error } = await supabase
      .from("assessments")
      .select("id, title, description, risk_tier, risk_score, created_at, domains, jurisdictions, folder_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ assessments: (data ?? []).map(sanitizeAssessmentRow) });

  } catch (err: unknown) {
    console.error("Assessments error:", err);
    return NextResponse.json({ error: "Failed to fetch assessments" }, { status: 500 });
  }
}

// DELETE — hard delete an assessment (also cascades to remediation_items via FK)
export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const { error } = await supabase
    .from("assessments")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
