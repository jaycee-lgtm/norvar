import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_USER_AI_SETTINGS,
  mergeUserAiSettings,
  type UserAiSettings,
} from "@/lib/user-ai-settings";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function getUserAiSettings(userId: string): Promise<UserAiSettings> {
  const { data, error } = await supabase
    .from("user_ai_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return DEFAULT_USER_AI_SETTINGS;
  return mergeUserAiSettings(data.settings);
}

export async function updateUserAiSettings(
  userId: string,
  patch: Partial<UserAiSettings>,
): Promise<UserAiSettings> {
  const current = await getUserAiSettings(userId);
  const next = mergeUserAiSettings({ ...current, ...patch });

  const { error } = await supabase
    .from("user_ai_settings")
    .upsert(
      { user_id: userId, settings: next, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  if (error) throw new Error(error.message);
  return next;
}
