import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const BASE_SELECT =
  "id, agent, agreement_type, governing_law, overall_status, result, document_id, created_at";
const FULL_SELECT = `${BASE_SELECT}, followups, applied_meta`;

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const agent  = searchParams.get("agent");
  const limit  = parseInt(searchParams.get("limit") ?? "50", 10);

  const runQuery = (select: string) => {
    let query = supabase
      .from("redlines")
      .select(select)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status) query = query.eq("overall_status", status);
    if (agent) query = query.eq("agent", agent);
    return query;
  };

  let { data, error } = await runQuery(FULL_SELECT);
  if (error?.message.includes("followups")) {
    ({ data, error } = await runQuery(BASE_SELECT));
  } else if (error?.message.includes("applied_meta")) {
    ({ data, error } = await runQuery(`${BASE_SELECT}, followups`));
  }

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ redlines: data });
}

export async function DELETE(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { id } = await req.json();
  if (!id) return Response.json({ error: "ID required" }, { status: 400 });

  const { error } = await supabase
    .from("redlines")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
