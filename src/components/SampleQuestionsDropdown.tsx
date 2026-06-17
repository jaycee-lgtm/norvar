"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Lightbulb, Loader2 } from "lucide-react";
import { useSampleQuestions } from "@/hooks/useSampleQuestions";
import { useFloatingMenuStyles } from "@/hooks/useFloatingMenuStyles";
import type { SampleQuestionsContext } from "@/lib/sample-questions";
import type { SampleQuestionsPayload } from "@/lib/sample-questions-generate";
import HoverTip from "@/components/HoverTip";

type SampleQuestionsDropdownProps = {
  context: SampleQuestionsContext;
  onSelect: (question: string) => void;
  disabled?: boolean;
  align?: "left" | "center";
  variant?: "chip" | "icon";
  menuPlacement?: "top" | "bottom";
  enabled?: boolean;
  payload?: SampleQuestionsPayload;
};

export default function SampleQuestionsDropdown({
  context,
  onSelect,
  disabled,
  align = "center",
  variant = "chip",
  menuPlacement = "bottom",
  enabled = true,
  payload,
}: SampleQuestionsDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref   = useRef<HTMLDivElement>(null);
  const { questions, refreshing } = useSampleQuestions(context, { enabled, payload });
  const floatingMenuStyle = useFloatingMenuStyles(open && variant === "icon", ref, {
    placement: menuPlacement === "top" ? "top" : "bottom",
    align:     "start",
    width:     420,
  });

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const isIcon = variant === "icon";

  return (
    <div
      ref={ref}
      className={`sample-questions-wrap${isIcon ? " sample-questions-wrap--icon" : ""}${refreshing ? " sample-questions-wrap--refreshing" : ""}`}
      style={!isIcon && align === "center" ? { margin: "0 auto" } : undefined}
    >
      {isIcon ? (
        <HoverTip label="Browse example questions">
          <button
            type="button"
            className="sample-questions-icon-btn attach-plus-btn"
            disabled={disabled}
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-label="Browse example questions"
          >
            {refreshing
              ? <Loader2 size={22} className="spin" strokeWidth={2} />
              : <Lightbulb size={22} strokeWidth={2} />}
          </button>
        </HoverTip>
      ) : (
        <button
          type="button"
          className="sample-questions-trigger"
          disabled={disabled}
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label="Browse example questions"
        >
          Sample questions
          <ChevronDown
            size={11}
            strokeWidth={2}
            style={{
              transition: "transform 0.15s",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>
      )}

      {open && (
        <div
          className={`sample-questions-menu${menuPlacement === "top" ? " sample-questions-menu--top" : ""}${isIcon ? " sample-questions-menu--floating" : ""}`}
          role="listbox"
          aria-label="Example questions"
          style={isIcon ? {
            ...floatingMenuStyle,
            background:   "var(--card)",
            border:       "0.5px solid var(--bdr2)",
            borderRadius: 10,
            boxShadow:    "var(--shadow-lg)",
            padding:      6,
          } : undefined}
        >
          {questions.map((q, i) => (
            <button
              key={`${i}-${q.slice(0, 24)}`}
              type="button"
              role="option"
              className="sample-questions-item"
              onClick={() => {
                onSelect(q);
                setOpen(false);
              }}
            >
              {q}
            </button>
          ))}
          {refreshing && (
            <p className="sample-questions-refresh-note">Refreshing suggestions…</p>
          )}
        </div>
      )}
    </div>
  );
}
