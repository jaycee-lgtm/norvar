import { getUserAiSettings } from "@/lib/user-ai-settings-server";
import { buildFrameworkScopePrompt } from "@/lib/regulatory-catalog";

export type UserFrameworkScope = {
  selectedFrameworkAbbrs: string[] | null;
  scopePrompt:            string;
};

/** Load persisted framework selection for RAG filtering and prompt scoping. */
export async function getUserFrameworkScope(userId: string): Promise<UserFrameworkScope> {
  const settings = await getUserAiSettings(userId);
  const abbrs = settings.selectedFrameworkAbbrs;
  const active = abbrs.length > 0 ? abbrs : null;
  return {
    selectedFrameworkAbbrs: active,
    scopePrompt:            buildFrameworkScopePrompt(active),
  };
}
