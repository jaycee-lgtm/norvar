"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Show } from "@clerk/nextjs";
import LandingPage from "@/components/LandingPage";

function SignedInRedirect() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const id     = searchParams.get("id");
    const folder = searchParams.get("folder");

    if (id || folder) {
      const qs = new URLSearchParams();
      if (id) qs.set("id", id);
      if (folder) qs.set("folder", folder);
      router.replace(`/assess?${qs.toString()}`);
      return;
    }

    router.replace("/chat");
  }, [router, searchParams]);

  return null;
}

export default function HomePage() {
  return (
    <>
      <Show when="signed-in">
        <Suspense fallback={null}>
          <SignedInRedirect />
        </Suspense>
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}
