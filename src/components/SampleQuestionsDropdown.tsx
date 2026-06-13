"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Lightbulb } from "lucide-react";
import { SAMPLE_QUESTIONS } from "@/lib/sample-questions";

type SampleQuestionsDropdownProps = {
  onSelect: (question: string) => void;
  disabled?: boolean;
  align?: "left" | "center";
  variant?: "chip" | "icon";
  menuPlacement?: "top" | "bottom";
};

export default function SampleQuestionsDropdown({
  onSelect,
  disabled,
  align = "center",
  variant = "chip",
  menuPlacement = "bottom",
}: SampleQuestionsDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref   = useRef<HTMLDivElement>(null);

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
      className={`sample-questions-wrap${isIcon ? " sample-questions-wrap--icon" : ""}`}
      style={!isIcon && align === "center" ? { margin: "0 auto" } : undefined}
    >
      <button
        type="button"
        className={isIcon ? "sample-questions-icon-btn attach-plus-btn" : "sample-questions-trigger"}
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Example questions"
        title="Example questions"
      >
        {isIcon ? (
          <Lightbulb size={16} strokeWidth={2} />
        ) : (
          <>
            Sample questions
            <ChevronDown
              size={11}
              strokeWidth={2}
              style={{
                transition: "transform 0.15s",
                transform: open ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </>
        )}
      </button>

      {open && (
        <div
          className={`sample-questions-menu${menuPlacement === "top" ? " sample-questions-menu--top" : ""}`}
          role="listbox"
          aria-label="Example questions"
        >
          {SAMPLE_QUESTIONS.map(q => (
            <button
              key={q}
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
        </div>
      )}
    </div>
  );
}
