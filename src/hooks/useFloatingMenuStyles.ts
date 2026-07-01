"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

type FloatingMenuOptions = {
  placement: "top" | "bottom";
  align:     "start" | "end";
  width?:    number;
  flip?:     boolean;
  margin?:   number;
};

const MENU_FLIP_THRESHOLD = 220;

function resolvePlacement(
  rect: DOMRect,
  preferred: "top" | "bottom",
): "top" | "bottom" {
  const margin = 6;
  const availableAbove = rect.top - margin - 8;
  const availableBelow = window.innerHeight - rect.bottom - margin - 8;

  if (preferred === "top") {
    if (availableAbove < MENU_FLIP_THRESHOLD && availableBelow > availableAbove) {
      return "bottom";
    }
    return "top";
  }

  if (availableBelow < MENU_FLIP_THRESHOLD && availableAbove > availableBelow) {
    return "top";
  }
  return "bottom";
}

export function computeFloatingMenuStyles(
  placementAnchor: HTMLElement,
  alignAnchor: HTMLElement | null | undefined,
  { placement, align, width = 280, flip = true, margin = 6 }: FloatingMenuOptions,
): CSSProperties {
  const placementRect = placementAnchor.getBoundingClientRect();
  const alignRect = (alignAnchor ?? placementAnchor).getBoundingClientRect();
  const resolvedPlacement = flip ? resolvePlacement(placementRect, placement) : placement;
  const menuWidth = width > 0
    ? Math.min(width, window.innerWidth - 16)
    : Math.min(Math.max(alignRect.width, 240), window.innerWidth - 16);
  let left = align === "end" ? alignRect.right - menuWidth : alignRect.left;
  left = Math.max(8, Math.min(left, window.innerWidth - menuWidth - 8));

  if (resolvedPlacement === "top") {
    const available = placementRect.top - margin - 8;
    return {
      position:  "fixed",
      left,
      bottom:    window.innerHeight - placementRect.top + margin,
      width:     menuWidth,
      maxHeight: Math.max(120, Math.min(320, available)),
      overflowY: "auto",
      zIndex:    400,
    };
  }

  const top = placementRect.bottom + margin;
  const available = window.innerHeight - top - 8;
  return {
    position:  "fixed",
    left,
    top,
    width:     menuWidth,
    maxHeight: Math.max(120, Math.min(320, available)),
    overflowY: "auto",
    zIndex:    400,
  };
}

export function useFloatingMenuStyles(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
  options: FloatingMenuOptions,
  alignAnchorRef?: RefObject<HTMLElement | null>,
) {
  const { placement, align, width = 280, flip = true, margin = 6 } = options;
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) {
      setStyle({});
      return;
    }

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      setStyle(computeFloatingMenuStyles(
        anchor,
        alignAnchorRef?.current ?? null,
        { placement, align, width, flip, margin },
      ));
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, placement, align, width, flip, margin, anchorRef, alignAnchorRef]);

  if (open && anchorRef.current) {
    return computeFloatingMenuStyles(
      anchorRef.current,
      alignAnchorRef?.current ?? null,
      { placement, align, width, flip, margin },
    );
  }

  return style;
}
