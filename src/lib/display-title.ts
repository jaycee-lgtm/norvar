const GENERIC_CHAT_TITLES = new Set([
  "new chat",
  "untitled",
  "untitled chat",
  "untitled conversation",
]);

export function stripMarkdownInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateDisplayTitle(text: string, maxLen = 72): string {
  const t = text.trim();
  if (!t) return "";
  return t.length > maxLen ? `${t.slice(0, maxLen - 3).trim()}...` : t;
}

export function resolveConversationTitle(
  title: string | null | undefined,
  messages?: unknown,
): string {
  const cleaned = stripMarkdownInline(title ?? "");
  if (cleaned && !GENERIC_CHAT_TITLES.has(cleaned.toLowerCase())) {
    return truncateDisplayTitle(cleaned) || "Untitled chat";
  }

  if (Array.isArray(messages)) {
    for (const m of messages) {
      if (!m || typeof m !== "object" || !("role" in m) || !("content" in m)) continue;
      if ((m as { role: string }).role !== "user") continue;
      const content = stripMarkdownInline(String((m as { content: string }).content));
      if (content.length > 2) {
        return truncateDisplayTitle(content) || "Untitled chat";
      }
    }
  }

  return "Untitled chat";
}

export function resolveAssessmentDisplayTitle(title: string, description?: string | null): string {
  const cleaned = stripMarkdownInline(title || description || "");
  return truncateDisplayTitle(cleaned, 80) || "Assessment";
}

export function firstUserMessageTitle(messages?: unknown, maxLen = 60): string {
  if (!Array.isArray(messages)) return "";
  for (const m of messages) {
    if (!m || typeof m !== "object" || !("role" in m) || !("content" in m)) continue;
    if ((m as { role: string }).role !== "user") continue;
    const content = stripMarkdownInline(String((m as { content: string }).content));
    if (content.length > 2) return truncateDisplayTitle(content, maxLen);
  }
  return "";
}
