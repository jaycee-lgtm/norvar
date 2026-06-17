"use client";

import { Info } from "lucide-react";
import HoverTip from "@/components/HoverTip";

export default function InfoTip({
  text,
  placement = "right",
}: {
  text: string;
  placement?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <HoverTip label={text} placement={placement} width={280}>
      <span style={{ display: "inline-flex", cursor: "default" }}>
        <Info size={14} strokeWidth={1.75} color="var(--fg3)" />
      </span>
    </HoverTip>
  );
}
