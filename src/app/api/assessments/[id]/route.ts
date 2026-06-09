import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { id } = await params;

    const { data, error } = await supabase
      .from("assessments")
      .select("id, title, description, result, risk_tier, risk_score, created_at")
      .eq("id", id)
      .eq("user_id", userId)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
    }

    const result = (data.result ?? {}) as Record<string, unknown>;

    return NextResponse.json({
      ...result,
      id: data.id,
      title: data.title,
      description: data.description,
      risk_score: result.risk_score ?? {
        composite: data.risk_score,
        tier: data.risk_tier,
      },
    });
  } catch (err: unknown) {
    console.error("Assessment fetch error:", err);
    return NextResponse.json({ error: "Failed to fetch assessment" }, { status: 500 });
  }
}
