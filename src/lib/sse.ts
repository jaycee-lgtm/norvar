export type SSEEvent = {
  type: string;
  text?: string;
  conversation_id?: string | null;
  message_id?: string;
  messages?: { role: "user" | "assistant"; content: string; id?: string; feedback?: "up" | "down" | null }[];
  assessment?: unknown;
  draft?: unknown;
};

function dispatchSSEPart(part: string, onEvent: (event: SSEEvent) => void) {
  const line = part.trim();
  if (!line.startsWith("data: ")) return;
  let event: SSEEvent;
  try {
    event = JSON.parse(line.slice(6)) as SSEEvent;
  } catch {
    return;
  }
  onEvent(event);
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
