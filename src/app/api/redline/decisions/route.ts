import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import type { ChangeDecisions } from "@/lib/redline-inline";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorised" }, { status: 401 });

  const { redline_id, decisions } = await req.json() as {
    redline_id?: string;
    decisions?: ChangeDecisions;
  };

  if (!redline_id || !decisions) {
    return Response.json({ error: "redline_id and decisions required" }, { status: 400 });
  }

  let { error } = await supabase
    .from("redlines")
    .update({ change_decisions: decisions })
    .eq("id", redline_id)
    .eq("user_id", userId);

  if (error?.message.includes("change_decisions")) {
    return Response.json({
      error: "Database migration required: add change_decisions jsonb column to redlines.",
    }, { status: 400 });
  }
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, decisions });
}
