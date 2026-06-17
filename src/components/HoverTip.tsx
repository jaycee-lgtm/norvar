"use client";

import type { CSSProperties, ReactNode } from "react";

type Placement = "top" | "right" | "bottom" | "left";

const PLACEMENT: Record<Placement, CSSProperties> = {
  top: {
    bottom:    "calc(100% + 8px)",
    left:      "50%",
    transform: "translateX(-50%)",
  },
  right: {
    left:      "calc(100% + 10px)",
    top:       "50%",
    transform: "translateY(-50%)",
  },
  bottom: {
    top:       "calc(100% + 8px)",
    left:      "50%",
    transform: "translateX(-50%)",
  },
  left: {
    right:     "calc(100% + 10px)",
    top:       "50%",
    transform: "translateY(-50%)",
  },
};

export default function HoverTip({
  label,
  children,
  placement = "top",
  className,
  width,
}: {
  label:      string;
  children:   ReactNode;
  placement?: Placement;
  className?: string;
  width?:     number;
}) {
  if (!label.trim()) return <>{children}</>;

  return (
    <span className={["hover-tip", className].filter(Boolean).join(" ")}>
      {children}
      <span
        className="hover-tip-popup"
        role="tooltip"
        style={{
          ...PLACEMENT[placement],
          ...(width ? { width, maxWidth: width } : {}),
        }}
      >
        {label}
      </span>
    </span>
  );
}
