"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SAMPLE_QUESTIONS } from "@/lib/sample-questions";

type SampleQuestionsDropdownProps = {
  onSelect: (question: string) => void;
  disabled?: boolean;
  align?:   "left" | "center";
};

export default function SampleQuestionsDropdown({
  onSelect,
  disabled,
  align = "center",
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

  return (
    <div
      ref={ref}
      className="sample-questions-wrap"
      style={align === "center" ? { margin: "0 auto" } : undefined}
    >
      <button
        type="button"
        className="sample-questions-trigger"
        disabled={disabled}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
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

      {open && (
        <div className="sample-questions-menu" role="listbox" aria-label="Sample questions">
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
