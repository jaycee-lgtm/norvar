export type SSEEvent = {
  type: string;
  text?: string;
  conversation_id?: string | null;
  messages?: { role: "user" | "assistant"; content: string }[];
};

export async function readSSEStream(response: Response, onEvent: (event: SSEEvent) => void) {
  const reader  = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as SSEEvent);
      } catch {
        // ignore malformed chunks
      }
    }
  }
}
