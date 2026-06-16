"use client";

import type { ReactNode } from "react";

export default function HomeComposerWrap({
  isMobileView,
  children,
  fullWidth = false,
}: {
  isMobileView: boolean;
  children:     ReactNode;
  fullWidth?:   boolean;
}) {
  return (
    <div
      className={isMobileView ? "home-composer-block" : "input-wrap"}
      style={isMobileView ? undefined : { marginBottom: 24, ...(fullWidth ? { width: "100%" } : {}) }}
    >
      {children}
    </div>
  );
}
