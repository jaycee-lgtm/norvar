export type SSEEvent = {
  type: string;
  text?: string;
  conversation_id?: string | null;
  messages?: { role: "user" | "assistant"; content: string }[];
  assessment?: unknown;
};

function dispatchSSEPart(part: string, onEvent: (event: SSEEvent) => void) {
  const line = part.trim();
  if (!line.startsWith("data: ")) return;
  try {
    onEvent(JSON.parse(line.slice(6)) as SSEEvent);
  } catch {
    // ignore malformed chunks
  }
}

export async function readSSEStream(response: Response, onEvent: (event: SSEEvent) => void) {
  const reader  = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: !done });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) dispatchSSEPart(part, onEvent);

    if (done) {
      if (buffer.trim()) dispatchSSEPart(buffer, onEvent);
      break;
    }
  }
}
