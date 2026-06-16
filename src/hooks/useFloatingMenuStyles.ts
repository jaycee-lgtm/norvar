"use client";

import { useEffect, useState, type CSSProperties, type RefObject } from "react";

type FloatingMenuOptions = {
  placement: "top" | "bottom";
  align:     "start" | "end";
  width?:    number;
};

export function useFloatingMenuStyles(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  { placement, align, width = 280 }: FloatingMenuOptions,
) {
  const [style, setStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!open || !anchorRef.current) return;

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const margin = 6;
      const menuWidth = width > 0
        ? Math.min(width, window.innerWidth - 16)
        : Math.min(Math.max(rect.width, 240), window.innerWidth - 16);
      let left = align === "end" ? rect.right - menuWidth : rect.left;
      left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));

      if (placement === "top") {
        const available = rect.top - margin - 8;
        setStyle({
          position:  "fixed",
          left,
          bottom:    window.innerHeight - rect.top + margin,
          width:     menuWidth,
          maxHeight: Math.max(120, Math.min(320, available)),
          overflowY: "auto",
          zIndex:    400,
        });
        return;
      }

      const top = rect.bottom + margin;
      const available = window.innerHeight - top - 8;
      setStyle({
        position:  "fixed",
        left,
        top,
        width:     menuWidth,
        maxHeight: Math.max(120, Math.min(320, available)),
        overflowY: "auto",
        zIndex:    400,
      });
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, placement, align, width]);

  return style;
}
