import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import {
  type MessageFeedbackRating,
  type MessageFeedbackSource,
  persistMessageFeedback,
} from "@/lib/message-feedback";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SOURCES: MessageFeedbackSource[] = ["conversation", "assessment", "gap_chat"];
const RATINGS: MessageFeedbackRating[] = ["up", "down"];

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

    const body = await req.json();
    const source = body.source as MessageFeedbackSource;
    const container_id = typeof body.container_id === "string" ? body.container_id : "";
    const message_id = typeof body.message_id === "string" ? body.message_id : "";
    const message_content = typeof body.message_content === "string" ? body.message_content.trim() : "";
    const user_message = typeof body.user_message === "string" ? body.user_message.trim() : undefined;
    const gap_key = typeof body.gap_key === "string" ? body.gap_key : undefined;
    const agent = typeof body.agent === "string" ? body.agent : "nora";
    const rating = body.rating as MessageFeedbackRating | null;

    if (!SOURCES.includes(source)) {
      return NextResponse.json({ error: "Invalid source" }, { status: 400 });
    }
    if (!container_id || !message_id) {
      return NextResponse.json({ error: "container_id and message_id required" }, { status: 400 });
    }
    if (rating !== null && !RATINGS.includes(rating)) {
      return NextResponse.json({ error: "Invalid rating" }, { status: 400 });
    }
    if (rating !== null && !message_content) {
      return NextResponse.json({ error: "message_content required" }, { status: 400 });
    }

    const result = await persistMessageFeedback(supabase, userId, {
      source,
      container_id,
      message_id,
      rating,
      message_content,
      user_message,
      gap_key,
      agent,
    });

    if (!result.ok) {
      const status = result.error === "Forbidden" ? 403 : 404;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ ok: true, rating });
  } catch (err: unknown) {
    console.error("Message feedback error:", err);
    return NextResponse.json({ error: "Failed to save feedback" }, { status: 500 });
  }
}
