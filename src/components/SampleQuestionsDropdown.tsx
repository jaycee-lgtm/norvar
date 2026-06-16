"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Lightbulb, Loader2 } from "lucide-react";
import { useSampleQuestions } from "@/hooks/useSampleQuestions";
import type { SampleQuestionsContext } from "@/lib/sample-questions";

type SampleQuestionsDropdownProps = {
  context: SampleQuestionsContext;
  onSelect: (question: string) => void;
  disabled?: boolean;
  align?: "left" | "center";
  variant?: "chip" | "icon";
  menuPlacement?: "top" | "bottom";
  enabled?: boolean;
};

export default function SampleQuestionsDropdown({
  context,
  onSelect,
  disabled,
  align = "center",
  variant = "chip",
  menuPlacement = "bottom",
  enabled = true,
}: SampleQuestionsDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref   = useRef<HTMLDivElement>(null);
  const { questions, refreshing } = useSampleQuestions(context, { enabled });

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
          refreshing
            ? <Loader2 size={22} className="spin" strokeWidth={2} />
            : <Lightbulb size={22} strokeWidth={2} />
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
