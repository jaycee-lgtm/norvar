"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Brain, Check, ChevronDown, Cpu, ScanSearch, Sparkles, Zap } from "lucide-react";
import {
  DEFAULT_REDLINE_REVIEW_MODEL,
  REDLINE_MODEL_GROUPS,
  REDLINE_REVIEW_MODELS,
  type RedlineReviewModelChoice,
} from "@/lib/redline-models";

const ICONS: Record<RedlineReviewModelChoice, ReactNode> = {
  auto:         <Sparkles size={13} strokeWidth={1.75} />,
  sonnet:       <Zap size={13} strokeWidth={1.75} />,
  opus:         <ScanSearch size={13} strokeWidth={1.75} />,
  "gpt-4.1":    <Brain size={13} strokeWidth={1.75} />,
  o3:           <ScanSearch size={13} strokeWidth={1.75} />,
  "gemini-flash": <Zap size={13} strokeWidth={1.75} />,
  "gemini-pro": <Cpu size={13} strokeWidth={1.75} />,
};

export default function RedlineModelSelector({
  value = DEFAULT_REDLINE_REVIEW_MODEL,
  onChange,
  disabled = false,
  menuPlacement = "top",
  variant = "default",
}: {
  value?:          RedlineReviewModelChoice;
  onChange?:       (value: RedlineReviewModelChoice) => void;
  disabled?:       boolean;
  menuPlacement?:  "bottom" | "top";
  variant?:        "default" | "inline" | "icon";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = REDLINE_REVIEW_MODELS.find(m => m.id === value) ?? REDLINE_REVIEW_MODELS[0];
  const menuUp = menuPlacement === "top";
  const isInline = variant === "inline";
  const isIcon = variant === "icon";

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div
      ref={ref}
      className={`mode-selector mode-selector--embedded mode-selector--menu-up redline-model-picker${isInline ? " redline-model-picker--inline" : ""}${isIcon ? " redline-model-picker--icon" : ""}`}
      style={{ position: "relative", display: "inline-block" }}
    >
      <button
        type="button"
        className="mode-selector-trigger redline-model-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={`Review model: ${active.label}`}
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        style={{
          display:       "inline-flex",
          alignItems:    "center",
          gap:           isIcon ? 0 : isInline ? 6 : 5,
          padding:       isIcon ? 6 : isInline ? "2px 0" : "4px 8px",
          borderRadius:  isIcon ? 999 : isInline ? 0 : 7,
          border:        isInline ? "none" : "none",
          background:    isInline ? "transparent" : open ? "var(--card2)" : "transparent",
          cursor:        disabled ? "not-allowed" : "pointer",
          fontFamily:    "'Sora', sans-serif",
          letterSpacing: "-0.01em",
          transition:    "background 0.15s, color 0.15s",
          opacity:       disabled ? 0.5 : 1,
          color:         isInline ? "var(--fg3)" : undefined,
        }}
        onMouseEnter={e => {
          if (!open && !disabled && !isInline) e.currentTarget.style.background = "var(--card2)";
          if (!open && !disabled && isInline) e.currentTarget.style.color = "var(--fg2)";
        }}
        onMouseLeave={e => {
          if (!open && !isInline) e.currentTarget.style.background = "transparent";
          if (!open && isInline) e.currentTarget.style.color = "var(--fg3)";
        }}
      >
        {(isInline || isIcon) && (
          <span style={{ color: "var(--fg3)", display: "flex", alignItems: "center" }}>
            {ICONS[active.id]}
          </span>
        )}
        {!isIcon && (
          <span style={{
            fontSize:      isInline ? 12 : 12,
            fontWeight:    isInline ? 400 : 500,
            color:         isInline ? "inherit" : "var(--fg2)",
            letterSpacing: "-0.02em",
          }}
          >
            {active.label}
          </span>
        )}
        {!isInline && !isIcon && (
          <ChevronDown
            size={12}
            strokeWidth={2}
            color="var(--fg3)"
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
          />
        )}
      </button>

      {open && (
        <div
          className="mode-selector-menu"
          role="listbox"
          style={{
            position:     "absolute",
            top:          menuUp ? undefined : "calc(100% + 6px)",
            bottom:       menuUp ? "calc(100% + 6px)" : undefined,
            left:         isInline ? undefined : 0,
            right:        isInline ? 0 : undefined,
            minWidth:     280,
            maxHeight:    420,
            overflowY:    "auto",
            background:   "var(--card)",
            border:       "0.5px solid var(--bdr2)",
            borderRadius: 9,
            zIndex:       300,
            boxShadow:    "var(--shadow-md)",
          }}
        >
          <div style={{
            padding:       "8px 12px 6px",
            fontSize:      10,
            fontWeight:    600,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color:         "var(--fg3)",
            fontFamily:    "'Sora', sans-serif",
            borderBottom:  "0.5px solid var(--bdr)",
          }}
          >
            Model
          </div>

          {REDLINE_MODEL_GROUPS.map(group => {
            const models = REDLINE_REVIEW_MODELS.filter(m => m.group === group.id);
            if (models.length === 0) return null;

            return (
              <div key={group.id}>
                <div style={{
                  padding:       "8px 12px 4px",
                  fontSize:      10,
                  fontWeight:    600,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color:         "var(--fg3)",
                  fontFamily:    "'Sora', sans-serif",
                }}
                >
                  {group.label}
                </div>

                {models.map(model => {
                  const isActive = model.id === value;
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        if (!isActive) onChange?.(model.id);
                      }}
                      style={{
                        width:      "100%",
                        display:    "flex",
                        alignItems: "flex-start",
                        gap:        12,
                        padding:    "10px 14px",
                        background: "transparent",
                        border:     "none",
                        cursor:     isActive ? "default" : "pointer",
                        textAlign:  "left",
                        transition: "background 0.1s",
                      }}
                      onMouseEnter={e => {
                        if (!isActive) e.currentTarget.style.background = "var(--lift)";
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <div style={{
                        width:          32,
                        height:         32,
                        borderRadius:   7,
                        background:     isActive ? "var(--lift)" : "var(--card2)",
                        border:         `0.5px solid ${isActive ? "var(--bdr3)" : "var(--bdr)"}`,
                        display:        "flex",
                        alignItems:     "center",
                        justifyContent: "center",
                        color:          isActive ? "var(--fg)" : "var(--fg2)",
                        flexShrink:     0,
                      }}
                      >
                        {ICONS[model.id]}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                          <span style={{
                            fontSize:      13,
                            fontWeight:    isActive ? 500 : 400,
                            color:         "var(--fg)",
                            fontFamily:    "'Sora', sans-serif",
                            letterSpacing: "-0.02em",
                          }}
                          >
                            {model.label}
                          </span>
                          {model.badge && (
                            <span style={{
                              fontSize:     10,
                              color:        "var(--fg3)",
                              background:   "var(--card2)",
                              padding:      "1px 5px",
                              borderRadius: 4,
                              border:       "0.5px solid var(--bdr)",
                            }}
                            >
                              {model.badge}
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize:     11,
                          color:        "var(--fg3)",
                          fontFamily:   "'Sora', sans-serif",
                          lineHeight:   1.35,
                        }}
                        >
                          {model.tagline}
                        </div>
                      </div>

                      {isActive && (
                        <Check size={14} strokeWidth={2.5} color="var(--fg3)" style={{ flexShrink: 0, marginTop: 2 }} />
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
