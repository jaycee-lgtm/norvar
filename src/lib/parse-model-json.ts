function findMatchingBrace(s: string, start: number): number {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      esc = c === "\\" && !esc;
      if (!esc && c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if ((c === "}" || c === "]") && stack.length && stack[stack.length - 1] === c) {
      stack.pop();
      if (stack.length === 0) return i;
    }
  }
  return -1;
}

function stripMarkdownFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]?.trim()) return fenced[1].trim();
  return trimmed.replace(/^```json?\s*/im, "").replace(/```\s*$/m, "").trim();
}

function removeTrailingCommas(json: string): string {
  let prev = "";
  let cur = json;
  while (cur !== prev) {
    prev = cur;
    cur = cur.replace(/,\s*([}\]])/g, "$1");
  }
  return cur;
}

function closeOpenJson(json: string): string {
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const c of json) {
    if (inStr) {
      esc = c === "\\" && !esc;
      if (!esc && c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if ((c === "}" || c === "]") && stack.length && stack[stack.length - 1] === c) stack.pop();
  }
  let repaired = json;
  if (inStr) repaired += '"';
  repaired += stack.reverse().join("");
  return repaired;
}

function extractJsonSlice(raw: string, opener: "{" | "["): string {
  const s = stripMarkdownFence(raw);
  const start = s.indexOf(opener);
  if (start < 0) throw new Error(`No JSON ${opener} in model output`);
  let slice = s.slice(start);
  const end = findMatchingBrace(slice, 0);
  if (end >= 0) slice = slice.slice(0, end + 1);
  return slice;
}

/** Parse model JSON with fence stripping, brace matching, and common repair passes. */
export function parseModelJson<T>(raw: string, opener: "{" | "["): T {
  if (!raw.trim()) throw new Error("Empty model response");

  const slice = extractJsonSlice(raw, opener);
  const attempts = [
    slice,
    removeTrailingCommas(slice),
    removeTrailingCommas(closeOpenJson(slice)),
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as T;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not parse model JSON");
}
