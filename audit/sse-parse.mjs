function assertReadableStream(stream) {
  if (!stream || typeof stream.getReader !== "function") {
    throw new Error("Response body is not a readable stream");
  }
}

function parseSseBlock(block) {
  const data = block
    .split(/\r?\n/)
    .filter(line => line.startsWith("data:"))
    .map(line => line.slice(5).trimStart())
    .join("\n")
    .trim();

  if (!data || data === "[DONE]") return null;

  try {
    return JSON.parse(data);
  } catch {
    return { type: "raw", text: data };
  }
}

async function collectSseEvents(stream) {
  assertReadableStream(stream);

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const events = [];
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() ?? "";

    for (const block of blocks) {
      const event = parseSseBlock(block);
      if (event) events.push(event);
    }
  }

  buffer += decoder.decode();
  const finalEvent = parseSseBlock(buffer);
  if (finalEvent) events.push(finalEvent);

  return events;
}

function throwIfStreamError(event) {
  if (event?.type !== "error") return;
  throw new Error(event.text || event.error || "SSE stream error");
}

export async function collectChatTextFromStream(stream) {
  let tokenText = "";
  let doneText = null;

  for (const event of await collectSseEvents(stream)) {
    throwIfStreamError(event);
    if (event.type === "token") tokenText += event.text ?? "";
    if (event.type === "done" && typeof event.text === "string") {
      doneText = event.text;
    }
    if (event.type === "raw") tokenText += event.text ?? "";
  }

  return doneText ?? tokenText;
}

async function collectDonePayload(stream, fieldName) {
  let payload = null;

  for (const event of await collectSseEvents(stream)) {
    throwIfStreamError(event);
    if (event.type === "done" && event[fieldName]) {
      payload = event[fieldName];
    }
  }

  return payload;
}

export function collectAssessmentFromStream(stream) {
  return collectDonePayload(stream, "assessment");
}

export function collectRedlineFromStream(stream) {
  return collectDonePayload(stream, "redline");
}

export function collectDraftFromStream(stream) {
  return collectDonePayload(stream, "draft");
}
