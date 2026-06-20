function eventData(block) {
  const lines = block.split("\n");
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  return dataLines.join("\n").trim();
}

async function* readSseMessages(stream) {
  if (!stream?.getReader) {
    throw new Error("Response body is not readable");
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const drain = function* () {
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      sep = buffer.indexOf("\n\n");

      const data = eventData(block);
      if (!data || data === "[DONE]") continue;

      try {
        yield { raw: data, parsed: JSON.parse(data) };
      } catch {
        yield { raw: data, parsed: null };
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    yield* drain();
  }

  buffer += decoder.decode().replace(/\r\n/g, "\n");
  if (buffer.trim()) {
    const data = eventData(buffer);
    if (data && data !== "[DONE]") {
      try {
        yield { raw: data, parsed: JSON.parse(data) };
      } catch {
        yield { raw: data, parsed: null };
      }
    }
  }
}

function throwIfError(parsed) {
  if (parsed?.type === "error") {
    throw new Error(parsed.text || parsed.error || "Stream returned an error");
  }
}

export async function collectChatTextFromStream(stream) {
  let text = "";

  for await (const { raw, parsed } of readSseMessages(stream)) {
    throwIfError(parsed);

    if (!parsed) {
      text += raw;
    } else if (parsed.type === "token") {
      text += parsed.text ?? "";
    } else if (parsed.type === "done" && typeof parsed.text === "string") {
      text = parsed.text;
    }
  }

  return text;
}

async function collectDonePayload(stream, key) {
  let payload = null;

  for await (const { parsed } of readSseMessages(stream)) {
    throwIfError(parsed);
    if (parsed?.type === "done" && parsed[key]) {
      payload = parsed[key];
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
