"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { resolveCatalogEntryForFrameworkRef } from "@/lib/regulatory-catalog";

export default function FrameworkRef({ label }: { label: string }) {
  const entry = resolveCatalogEntryForFrameworkRef(label);

  if (entry?.sourceUrl) {
    return (
      <a
        href={entry.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="redline-fw-link"
        title={entry.name}
        onClick={e => e.stopPropagation()}
      >
        {label}
        <ExternalLink size={9} strokeWidth={2} />
      </a>
    );
  }

  return (
    <Link
      href="/frameworks"
      className="redline-fw-link"
      onClick={e => e.stopPropagation()}
    >
      {label}
    </Link>
  );
}
