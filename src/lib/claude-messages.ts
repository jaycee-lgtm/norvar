type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  id?: string;
  feedback?: "up" | "down" | null;
};

export function toClaudeMessages(messages: StoredMessage[]) {
  return messages.map(({ role, content }) => ({ role, content }));
}

export function userFacingClaudeError(raw: string): string {
  const jsonStart = raw.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(raw.slice(jsonStart)) as {
        error?: { message?: string };
      };
      if (parsed.error?.message) return parsed.error.message;
    } catch {
      // fall through
    }
  }
  if (/^\d{3}\s/.test(raw)) return "Chat failed. Please try again.";
  return raw;
}
