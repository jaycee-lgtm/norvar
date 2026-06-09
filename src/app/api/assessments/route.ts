import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id    = searchParams.get("id");
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);

    // Single assessment by ID — returns full result JSON
    if (id) {
      const { data, error } = await supabase
        .from("assessments")
        .select("id, title, description, risk_tier, risk_score, created_at, domains, jurisdictions, result")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 404 });
      return NextResponse.json({ assessment: data });
    }

    // List — returns summary rows for sidebar and history page
    const { data, error } = await supabase
      .from("assessments")
      .select("id, title, description, risk_tier, risk_score, created_at, domains, jurisdictions")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ assessments: data ?? [] });

  } catch (err: unknown) {
    console.error("Assessments error:", err);
    return NextResponse.json({ error: "Failed to fetch assessments" }, { status: 500 });
  }
}
