"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Placement = "top" | "right" | "bottom" | "left";

const VIEWPORT_PAD = 8;
const TIP_GAP      = 8;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function tipCoords(
  trigger: DOMRect,
  tip: DOMRect,
  placement: Placement,
): CSSProperties {
  const maxLeft = window.innerWidth - tip.width - VIEWPORT_PAD;
  const maxTop  = window.innerHeight - tip.height - VIEWPORT_PAD;

  switch (placement) {
    case "right":
      return {
        left: clamp(trigger.right + TIP_GAP, VIEWPORT_PAD, maxLeft),
        top:  clamp(trigger.top + trigger.height / 2 - tip.height / 2, VIEWPORT_PAD, maxTop),
      };
    case "bottom":
      return {
        left: clamp(trigger.left + trigger.width / 2 - tip.width / 2, VIEWPORT_PAD, maxLeft),
        top:  clamp(trigger.bottom + TIP_GAP, VIEWPORT_PAD, maxTop),
      };
    case "left":
      return {
        left: clamp(trigger.left - tip.width - TIP_GAP, VIEWPORT_PAD, maxLeft),
        top:  clamp(trigger.top + trigger.height / 2 - tip.height / 2, VIEWPORT_PAD, maxTop),
      };
    default:
      return {
        left: clamp(trigger.left + trigger.width / 2 - tip.width / 2, VIEWPORT_PAD, maxLeft),
        top:  clamp(trigger.top - tip.height - TIP_GAP, VIEWPORT_PAD, maxTop),
      };
  }
}

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
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef     = useRef<HTMLSpanElement>(null);
  const [visible, setVisible]       = useState(false);
  const [positioned, setPositioned] = useState(false);
  const [coords, setCoords]         = useState<CSSProperties>({});

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const tip = tipRef.current;
    if (!trigger || !tip) return;
    setCoords(tipCoords(trigger.getBoundingClientRect(), tip.getBoundingClientRect(), placement));
    setPositioned(true);
  }, [placement]);

  const show = () => {
    setPositioned(false);
    setVisible(true);
  };

  const hide = () => {
    setVisible(false);
    setPositioned(false);
  };

  useEffect(() => {
    if (!visible) return;
    const frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [visible, label, updatePosition]);

  useEffect(() => {
    if (!visible) return;
    const onChange = () => updatePosition();
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    return () => {
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
    };
  }, [visible, updatePosition]);

  if (!label.trim()) return <>{children}</>;

  const wrap = Boolean(width);

  return (
    <>
      <span
        ref={triggerRef}
        className={["hover-tip", className].filter(Boolean).join(" ")}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </span>

      {visible && typeof document !== "undefined" && createPortal(
        <span
          ref={tipRef}
          className={[
            "hover-tip-popup",
            "hover-tip-popup--portal",
            wrap ? "hover-tip-popup--wrap" : "",
            positioned ? "hover-tip-popup--visible" : "",
          ].filter(Boolean).join(" ")}
          role="tooltip"
          style={{
            ...(width ? { width, maxWidth: width } : {}),
            ...coords,
          }}
        >
          {label}
        </span>,
        document.body,
      )}
    </>
  );
}
