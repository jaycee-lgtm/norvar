"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ShieldAlert, MessageSquare, Check } from "lucide-react";

export type Mode = "assess" | "chat";

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
];

export default function ModeSelector({
  current,
  compact = false,
  menuPlacement = "bottom",
}: {
  current: Mode;
  compact?: boolean;
  menuPlacement?: "bottom" | "top";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = MODES.find(m => m.id === current) ?? MODES[0];

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const menuUp = menuPlacement === "top";

  return (
    <div
      ref={ref}
      className={`mode-selector${compact ? " mode-selector--compact" : ""}${menuUp ? " mode-selector--menu-up" : ""}`}
      style={{ position: "relative", display: compact ? "block" : "inline-block", width: compact ? "100%" : undefined }}
    >
      <button
        type="button"
        className="mode-selector-trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen(o => !o)}
        style={{
          display:        "inline-flex",
          alignItems:     "center",
          gap:            7,
          padding:        compact ? "5px 10px" : "6px 12px",
          borderRadius:   8,
          border:         "0.5px solid var(--bdr2)",
          background:     open ? "var(--lift)" : "var(--card)",
          cursor:         "pointer",
          fontFamily:     "'Sora', sans-serif",
          letterSpacing:  "-0.01em",
          transition:     "background 0.15s, border-color 0.15s",
          width:          compact ? "100%" : "auto",
        }}
        onMouseEnter={e => {
          if (!open) e.currentTarget.style.background = "var(--card2)";
        }}
        onMouseLeave={e => {
          if (!open) e.currentTarget.style.background = "var(--card)";
        }}
      >
        <span style={{ color: "var(--fg2)", display: "flex", alignItems: "center" }}>
          {active.icon}
        </span>
        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg3)", letterSpacing: "-0.02em" }}>
          {active.label}
        </span>
        <span style={{
          fontSize: 10, color: "var(--fg3)",
          background: "var(--card2)", padding: "1px 6px",
          borderRadius: 4, border: "0.5px solid var(--bdr)",
          fontWeight: 400,
        }}>
          {active.version}
        </span>
        <ChevronDown
          size={12} strokeWidth={2} color="var(--fg3)"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </button>

      {open && (
        <div
          className="mode-selector-menu"
          role="listbox"
          style={{
          position:     "absolute",
          top:          menuUp ? undefined : "calc(100% + 6px)",
          bottom:       menuUp ? "calc(100% + 6px)" : undefined,
          left:         0,
          right:        compact ? 0 : undefined,
          minWidth:     compact ? undefined : 260,
          width:        compact ? "100%" : undefined,
          maxWidth:     compact ? "100%" : undefined,
          background:   "var(--card)",
          border:       "0.5px solid var(--bdr2)",
          borderRadius: 9,
          overflow:     "hidden",
          zIndex:       300,
          boxShadow:    "0 8px 28px rgba(0,0,0,0.3)",
        }}>
          <div style={{
            padding:        "8px 12px 6px",
            fontSize:       10,
            fontWeight:     600,
            letterSpacing:  ".08em",
            textTransform:  "uppercase" as const,
            color:          "var(--fg3)",
            fontFamily:     "'Sora', sans-serif",
            borderBottom:   "0.5px solid var(--bdr)",
          }}>
            Mode
          </div>

          {MODES.map(mode => {
            const isActive = mode.id === current;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (!isActive) router.push(mode.href);
                }}
                style={{
                  width:         "100%",
                  display:       "flex",
                  alignItems:    "flex-start",
                  gap:           12,
                  padding:       "10px 14px",
                  background:    "transparent",
                  border:        "none",
                  cursor:        isActive ? "default" : "pointer",
                  textAlign:     "left" as const,
                  transition:    "background 0.1s",
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
                }}>
                  {mode.icon}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 2 }}>
                    <span style={{
                      fontSize:      13,
                      fontWeight:    isActive ? 500 : 400,
                      color:         "var(--fg)",
                      fontFamily:    "'Sora', sans-serif",
                      letterSpacing: "-0.02em",
                    }}>
                      {mode.label}
                    </span>
                    <span style={{
                      fontSize:   10,
                      color:      "var(--fg3)",
                      background: "var(--card2)",
                      padding:    "1px 5px",
                      borderRadius: 4,
                      border:     "0.5px solid var(--bdr)",
                    }}>
                      {mode.version}
                    </span>
                  </div>
                  <div style={{
                    fontSize:      11,
                    color:         "var(--fg3)",
                    fontFamily:    "'Sora', sans-serif",
                    letterSpacing: "-0.01em",
                    whiteSpace:    "normal",
                    wordBreak:     "break-word",
                    overflowWrap:  "break-word",
                    lineHeight:    1.35,
                  }}>
                    {mode.tagline}
                  </div>
                </div>

                {isActive && (
                  <Check size={14} strokeWidth={2.5} color="var(--fg3)" style={{ flexShrink: 0, marginTop: 2 }} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
