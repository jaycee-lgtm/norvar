"use client";

import type { CSSProperties } from "react";
import { Info } from "lucide-react";

type Placement = "top" | "right" | "bottom";

const PLACEMENT: Record<Placement, CSSProperties> = {
  top: {
    bottom: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)",
  },
  right: {
    left: "calc(100% + 10px)",
    top: "50%",
    transform: "translateY(-50%)",
  },
  bottom: {
    top: "calc(100% + 8px)",
    left: "50%",
    transform: "translateX(-50%)",
  },
};

export default function InfoTip({
  text,
  placement = "right",
}: {
  text: string;
  placement?: Placement;
}) {
  return (
    <div
      className="info-tip"
      style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}
      onMouseEnter={e => {
        const t = e.currentTarget.querySelector(".info-tip-popup") as HTMLElement;
        if (t) {
          t.style.opacity = "1";
          t.style.visibility = "visible";
        }
      }}
      onMouseLeave={e => {
        const t = e.currentTarget.querySelector(".info-tip-popup") as HTMLElement;
        if (t) {
          t.style.opacity = "0";
          t.style.visibility = "hidden";
        }
      }}
    >
      <Info size={14} strokeWidth={1.75} color="var(--fg3)" style={{ cursor: "default" }} />
      <div
        className="info-tip-popup"
        style={{
          position: "absolute",
          ...PLACEMENT[placement],
          background: "var(--card)",
          border: "0.5px solid var(--bdr2)",
          borderRadius: 7,
          padding: "10px 14px",
          width: 280,
          fontSize: 12,
          color: "var(--fg2)",
          lineHeight: 1.65,
          fontFamily: "'Sora', sans-serif",
          letterSpacing: "-.01em",
          opacity: 0,
          visibility: "hidden",
          transition: "opacity 0.15s, visibility 0.15s",
          pointerEvents: "none",
          zIndex: 50,
          boxShadow: "var(--shadow-md)",
        }}
      >
        {text}
      </div>
    </div>
  );
}
