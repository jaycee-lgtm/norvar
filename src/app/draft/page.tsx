"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function DraftRedirectInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const legacyId = params.get("id");
    if (legacyId) {
      params.set("draft", legacyId);
      params.delete("id");
    }
    params.set("tab", "draft");
    router.replace(`/contracts?${params.toString()}`);
  }, [router, searchParams]);

  return null;
}

export default function DraftPage() {
  return (
    <Suspense fallback={null}>
      <DraftRedirectInner />
    </Suspense>
  );
}
