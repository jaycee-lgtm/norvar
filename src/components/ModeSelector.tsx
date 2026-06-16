"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ShieldAlert, MessageSquare, Check, FilePenLine, FileText } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useFloatingMenuStyles } from "@/hooks/useFloatingMenuStyles";

export type Mode = "chat" | "assess" | "contracts" | "draft";

export const MODES: {
  id:      Mode;
  label:   string;
  version: string;
  tagline: string;
  icon:    React.ReactNode;
  href:    string;
}[] = [
  {
    id:      "chat",
    label:   "Nora",
    version: "1.0",
    tagline: "Free-form GRC conversation",
    icon:    <MessageSquare size={13} strokeWidth={1.75} />,
    href:    "/chat",
  },
  {
    id:      "assess",
    label:   "Cassius",
    version: "1.0",
    tagline: "Formal compliance risk assessment",
    icon:    <ShieldAlert size={13} strokeWidth={1.75} />,
    href:    "/assess",
  },
  {
    id:      "contracts",
    label:   "Varro",
    version: "1.0",
    tagline: "Contract review and redline",
    icon:    <FilePenLine size={13} strokeWidth={1.75} />,
    href:    "/contracts",
  },
  {
    id:      "draft",
    label:   "Petra",
    version: "1.0",
    tagline: "Agreement drafting",
    icon:    <FileText size={13} strokeWidth={1.75} />,
    href:    "/draft",
  },
];

export default function ModeSelector({
  current,
  compact = false,
  embedded = false,
  menuPlacement = "bottom",
  menuAlign = "start",
  askPrefix = false,
  homePrompt = false,
  onSelect,
  navigate = true,
  disabled = false,
}: {
  current: Mode;
  compact?: boolean;
  embedded?: boolean;
  menuPlacement?: "bottom" | "top";
  menuAlign?:     "start" | "end";
  askPrefix?:     boolean;
  homePrompt?:    boolean;
  onSelect?: (mode: Mode) => void;
  navigate?: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isMobileView = useIsMobile();

  const active = MODES.find(m => m.id === current) ?? MODES[0];

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const menuUp = menuPlacement === "top";
  const floatingMenuStyle = useFloatingMenuStyles(open && isMobileView, ref, {
    placement: menuUp ? "top" : "bottom",
    align:     menuAlign,
    width:     compact ? 0 : 260,
  });

  return (
    <div
      ref={ref}
      className={`mode-selector${compact ? " mode-selector--compact" : ""}${embedded ? " mode-selector--embedded" : ""}${homePrompt ? " mode-selector--home-prompt" : ""}${menuUp ? " mode-selector--menu-up" : ""}`}
      style={{ position: "relative", display: (compact && !embedded) ? "block" : homePrompt ? "block" : "inline-block", width: (compact && !embedded) || homePrompt ? "100%" : undefined }}
    >
      <button
        type="button"
        className="mode-selector-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        style={homePrompt ? {
          display:    "inline-flex",
          alignItems: "center",
          cursor:     disabled ? "not-allowed" : "pointer",
          fontFamily: "'Sora', sans-serif",
        } : {
          display:        "inline-flex",
          alignItems:     "center",
          gap:            embedded ? 5 : 7,
          padding:        embedded ? "4px 8px" : compact ? "7px 12px" : "6px 12px",
          borderRadius:   embedded ? 7 : 8,
          border:         embedded ? "none" : "0.5px solid var(--bdr2)",
          background:     embedded ? (open ? "var(--card2)" : "transparent") : open ? "var(--lift)" : "var(--card)",
          cursor:         "pointer",
          fontFamily:     "'Sora', sans-serif",
          letterSpacing:  "-0.01em",
          transition:     "background 0.15s, border-color 0.15s",
          width:          (compact && !embedded) ? "100%" : "auto",
        }}
        onMouseEnter={homePrompt ? undefined : e => {
          if (!open) e.currentTarget.style.background = embedded ? "var(--card2)" : "var(--card2)";
        }}
        onMouseLeave={homePrompt ? undefined : e => {
          if (!open) e.currentTarget.style.background = embedded ? "transparent" : "var(--card)";
        }}
      >
        {!embedded && (
          <span style={{ color: "var(--fg2)", display: "flex", alignItems: "center" }}>
            {active.icon}
          </span>
        )}
        <span style={homePrompt ? undefined : { fontSize: compact ? 13 : 12, fontWeight: 500, color: embedded ? "var(--fg2)" : compact ? "var(--fg)" : "var(--fg3)", letterSpacing: "-0.02em" }}>
          {embedded
            ? askPrefix
              ? `Ask ${active.label} ${active.version}`
              : `${active.label} ${active.version}`
            : active.label}
        </span>
        {!embedded && (
        <span style={{
          fontSize: compact ? 11 : 10, color: "var(--fg3)",
          background: "var(--card2)",
          padding: "1px 6px",
          borderRadius: 4,
          border: "0.5px solid var(--bdr)",
          fontWeight: 400,
        }}>
          {active.version}
        </span>
        )}
        <ChevronDown
          size={compact ? 14 : 12} strokeWidth={2} color="var(--fg3)"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </button>

      {open && (
        <div
          className="mode-selector-menu"
          role="listbox"
          style={isMobileView ? {
            ...floatingMenuStyle,
            background:   "var(--card)",
            border:       "0.5px solid var(--bdr2)",
            borderRadius: 9,
            boxShadow:    "var(--shadow-md)",
          } : {
          position:     "absolute",
          top:          menuUp ? undefined : "calc(100% + 6px)",
          bottom:       menuUp ? "calc(100% + 6px)" : undefined,
          left:         menuAlign === "end" ? undefined : 0,
          right:        menuAlign === "end" ? 0 : compact ? 0 : undefined,
          minWidth:     compact ? undefined : 260,
          width:        compact ? "100%" : undefined,
          maxWidth:     compact ? "100%" : undefined,
          background:   "var(--card)",
          border:       "0.5px solid var(--bdr2)",
          borderRadius: 9,
          overflow:     "hidden",
          zIndex:       300,
          boxShadow:    "var(--shadow-md)",
        }}>
          <div className="mode-selector-menu-header">
            Mode
          </div>

          {MODES.map(mode => {
            const isActive = mode.id === current;
            return (
              <button
                key={mode.id}
                type="button"
                className={`mode-selector-option${isActive ? " is-active" : ""}`}
                onClick={() => {
                  setOpen(false);
                  if (isActive) return;
                  if (onSelect) {
                    onSelect(mode.id);
                    return;
                  }
                  if (navigate) router.push(mode.href);
                }}
              >
                <div className="mode-selector-option-row">
                  <div className="mode-selector-option-icon">
                    {mode.icon}
                  </div>

                  <div className="mode-selector-option-head">
                    <span className="mode-selector-option-name">{mode.label}</span>
                    <span className="mode-selector-option-version">{mode.version}</span>
                  </div>

                  {isActive && (
                    <Check size={compact ? 14 : 12} strokeWidth={2.5} color="var(--fg3)" className="mode-selector-option-check" />
                  )}
                </div>

                <div className="mode-selector-option-tagline">{mode.tagline}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
