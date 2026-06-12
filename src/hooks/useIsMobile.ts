"use client";

import { useEffect, useState } from "react";

function readIsMobile(breakpoint: number) {
  if (typeof window === "undefined") return false;
  return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
}

export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() => readIsMobile(breakpoint));

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);

  return isMobile;
}
