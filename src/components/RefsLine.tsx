"use client";

import { resolveRefUrl } from "@/lib/regulatory-ref-urls";

export default function RefsLine({ line }: { line: string }) {
  const refsStr = line.replace(/^refs?:\s*/i, "").trim();
  if (!refsStr) return null;

  const refs = refsStr.split(/[,;]/).map(r => r.trim()).filter(Boolean);

  return (
    <div className="refs-line">
      {refs.map((ref, i) => {
        const url = resolveRefUrl(ref);
        if (url) {
          return (
            <a
              key={i}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="ref-chip ref-chip--link"
            >
              ↗ {ref}
            </a>
          );
        }
        return (
          <span key={i} className="ref-chip">{ref}</span>
        );
      })}
    </div>
  );
}
