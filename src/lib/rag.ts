export type RegulatoryChunk = {
  reg_abbr:   string;
  reg_name:   string;
  chunk_text: string;
  similarity?: number;
};

/** Reject PDF/binary garbage and low-quality extractions from the corpus. */
export function isReadableChunkText(text: string): boolean {
  if (!text || text.trim().length < 40) return false;
  if (/[\x00-\x08\x0e-\x1f]/.test(text)) return false;
  if (/%PDF|endobj|\bstream\b|PK\x03\x04/i.test(text)) return false;

  const stripped = text.replace(/\s+/g, " ").trim();
  const letters = (stripped.match(/[a-zA-Z]/g) || []).length;
  if (letters / stripped.length < 0.55) return false;

  const words = stripped.match(/\b[a-zA-Z]{3,}\b/g);
  return !!words && words.length >= 6;
}

/** Skip vector search for greetings, sign-offs, and other non-substantive messages. */
export function shouldRetrieveContext(query: string): boolean {
  const q = query.trim();
  if (q.length < 10) return false;

  const lower = q.toLowerCase();
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|cool|bye|goodbye|good night|cheers)[\s!.?,]*$/i.test(q)) {
    return false;
  }
  if (q.length < 100 && /\b(thanks|thank you|all good|no thanks|that'?s all|nothing else|good for now)\b/.test(lower)) {
    return false;
  }
  return true;
}

export function filterRegulatoryChunks(
  chunks: RegulatoryChunk[],
  minSimilarity = 0.42,
): RegulatoryChunk[] {
  return chunks.filter(c => {
    if (c.similarity != null && c.similarity < minSimilarity) return false;
    return isReadableChunkText(c.chunk_text);
  });
}

export function buildRegulatoryContextBlock(chunks: RegulatoryChunk[]): string {
  if (!chunks.length) return "";
  return chunks
    .map((c, i) => `[${i + 1}] ${c.reg_abbr} — ${c.reg_name}\n${c.chunk_text.trim()}`)
    .join("\n\n");
}
