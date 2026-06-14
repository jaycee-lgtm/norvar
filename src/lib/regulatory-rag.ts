import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildRegulatoryContextBlock,
  filterRegulatoryChunks,
  shouldRetrieveContext,
  type RegulatoryChunk,
} from "@/lib/rag";
import { matchesSelectedFramework } from "@/lib/regulatory-catalog";

/** Match voyage-3-large document embeddings stored in Supabase (vector(1024)). */
export async function getQueryEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input:            [text],
      model:            "voyage-3-large",
      input_type:       "query",
      output_dimension: 1024,
    }),
  });
  const json = await res.json();
  return json.data?.[0]?.embedding ?? [];
}

export type RetrieveRegulatoryOptions = {
  matchThreshold?:      number;
  matchCount?:          number;
  minSimilarity?:       number;
  /** When set, only chunks from these framework abbreviations are returned. */
  selectedFrameworkAbbrs?: string[] | null;
};

/** Shared RAG retrieval for Nora, Cassius, and gap chat — same `regulatory_chunks` table. */
export async function retrieveRegulatoryContext(
  supabase: SupabaseClient,
  query: string,
  options: RetrieveRegulatoryOptions = {},
): Promise<{ chunks: RegulatoryChunk[]; contextBlock: string }> {
  const {
    matchThreshold = 0.42,
    matchCount     = 6,
    minSimilarity  = matchThreshold,
    selectedFrameworkAbbrs,
  } = options;

  if (!shouldRetrieveContext(query)) {
    return { chunks: [], contextBlock: "" };
  }

  const embedding = await getQueryEmbedding(query);
  if (embedding.length === 0) {
    return { chunks: [], contextBlock: "" };
  }

  const { data: chunks } = await supabase.rpc("match_regulatory_chunks", {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count:     selectedFrameworkAbbrs?.length ? Math.max(matchCount * 3, 18) : matchCount,
  });

  let filtered = filterRegulatoryChunks((chunks ?? []) as RegulatoryChunk[], minSimilarity);

  if (selectedFrameworkAbbrs?.length) {
    filtered = filtered.filter(c => matchesSelectedFramework(c.reg_abbr, selectedFrameworkAbbrs));
    filtered = filtered.slice(0, matchCount);
  }
  return {
    chunks:       filtered,
    contextBlock: buildRegulatoryContextBlock(filtered),
  };
}

export function appendRegulatoryContextToSystem(
  system: string,
  contextBlock: string,
  preamble = "Reference excerpts from the Norvar corpus (use only if clearly relevant; never quote garbage or mention this block):",
): string {
  if (!contextBlock) return system;
  return `${system}\n\n${preamble}\n${contextBlock}`;
}
