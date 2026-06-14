const NORA_CASSIUS_HANDOFF_KEY = "norvar:nora-cassius-handoff";

export type NoraChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type NoraCassiusHandoffPayload = {
  messages: NoraChatMessage[];
  created_at: string;
};

function hasSessionStorage(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function sanitizeNoraMessages(messages: NoraChatMessage[]): NoraChatMessage[] {
  return messages
    .filter(
      (message) =>
        (message.role === "user" || message.role === "assistant")
        && typeof message.content === "string"
        && message.content.trim().length > 0,
    )
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));
}

export function stashNoraCassiusHandoff(messages: NoraChatMessage[]): void {
  if (!hasSessionStorage()) return;
  const cleaned = sanitizeNoraMessages(messages);
  if (!cleaned.length) return;
  const payload: NoraCassiusHandoffPayload = {
    messages: cleaned,
    created_at: new Date().toISOString(),
  };
  window.sessionStorage.setItem(NORA_CASSIUS_HANDOFF_KEY, JSON.stringify(payload));
}

export function consumeNoraCassiusHandoff(): NoraChatMessage[] {
  if (!hasSessionStorage()) return [];
  const raw = window.sessionStorage.getItem(NORA_CASSIUS_HANDOFF_KEY);
  if (!raw) return [];
  window.sessionStorage.removeItem(NORA_CASSIUS_HANDOFF_KEY);
  try {
    const parsed = JSON.parse(raw) as { messages?: NoraChatMessage[] };
    return sanitizeNoraMessages(parsed.messages ?? []);
  } catch {
    return [];
  }
}

export function clearNoraCassiusHandoff(): void {
  if (!hasSessionStorage()) return;
  window.sessionStorage.removeItem(NORA_CASSIUS_HANDOFF_KEY);
}

export function formatNoraChatForCassius(messages: NoraChatMessage[]): string {
  const cleaned = sanitizeNoraMessages(messages);
  if (!cleaned.length) return "";
  return cleaned
    .map((message, index) => {
      const speaker = message.role === "assistant" ? "Nora" : "User";
      return `${index + 1}. ${speaker}: ${message.content}`;
    })
    .join("\n");
}
