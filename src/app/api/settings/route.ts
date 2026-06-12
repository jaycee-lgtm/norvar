import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getElevenLabsApiKey } from "@/lib/elevenlabs-config";
import { mergeUserAiSettings, type UserAiSettings } from "@/lib/user-ai-settings";
import { getUserAiSettings, updateUserAiSettings } from "@/lib/user-ai-settings-server";

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  try {
    const settings = await getUserAiSettings(userId);
    return NextResponse.json({
      settings,
      voiceConfigured: !!getElevenLabsApiKey(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to load settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: Partial<UserAiSettings>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid settings payload" }, { status: 400 });
  }

  try {
    const settings = await updateUserAiSettings(userId, body);
    return NextResponse.json({
      settings,
      voiceConfigured: !!getElevenLabsApiKey(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to save settings";
    const status = message.includes("user_ai_settings") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const settings = await updateUserAiSettings(userId, mergeUserAiSettings(body));
    return NextResponse.json({
      settings,
      voiceConfigured: !!getElevenLabsApiKey(),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Failed to save settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
