"use client";

import { useState, useRef, useEffect, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ShieldAlert, MessageSquare, Check, FilePenLine, FileText } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useFloatingMenuStyles } from "@/hooks/useFloatingMenuStyles";
import HoverTip from "@/components/HoverTip";

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
  sidebar = false,
  embedded = false,
  menuPlacement = "bottom",
  menuAlign = "start",
  askPrefix = false,
  homePrompt = false,
  onSelect,
  navigate = true,
  disabled = false,
  menuAnchorRef,
  menuFlip,
  menuGap,
}: {
  current: Mode;
  compact?: boolean;
  sidebar?: boolean;
  embedded?: boolean;
  menuPlacement?: "bottom" | "top";
  menuAlign?:     "start" | "end";
  askPrefix?:     boolean;
  homePrompt?:    boolean;
  onSelect?: (mode: Mode) => void;
  navigate?: boolean;
  disabled?: boolean;
  menuAnchorRef?: RefObject<HTMLElement | null>;
  menuFlip?: boolean;
  menuGap?: number;
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

  const isCompact = compact || sidebar;
  const menuUp = menuPlacement === "top";
  const useFloatingMenu = isMobileView || homePrompt;
  const menuPositionRef = menuAnchorRef ?? ref;
  const menuAlignRef = menuAnchorRef ? ref : undefined;
  const floatingMenuStyle = useFloatingMenuStyles(
    open && useFloatingMenu,
    menuPositionRef,
    {
      placement: menuUp ? "top" : "bottom",
      align:     menuAlign,
      width:     isCompact ? 0 : 260,
      flip:      menuFlip,
      margin:    menuGap,
    },
    menuAlignRef,
  );

  const triggerTitle = homePrompt
    ? `Switch agent — ${active.label} (${active.tagline})`
    : embedded
    ? `Switch agent — ${active.label} (${active.tagline})`
    : `Switch to ${active.label}`;

  return (
    <div
      ref={ref}
      className={`mode-selector${isCompact ? " mode-selector--compact" : ""}${sidebar ? " mode-selector--sidebar" : ""}${embedded ? " mode-selector--embedded" : ""}${homePrompt ? " mode-selector--home-prompt" : ""}${menuUp ? " mode-selector--menu-up" : ""}`}
      style={{ position: "relative", display: (isCompact && !embedded) || sidebar ? "block" : homePrompt ? "block" : "inline-block", width: (isCompact && !embedded) || sidebar || homePrompt ? "100%" : undefined }}
    >
      <HoverTip label={triggerTitle}>
        <button
          type="button"
          className="mode-selector-trigger"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-label={triggerTitle}
          disabled={disabled}
          onClick={() => !disabled && setOpen(o => !o)}
        style={homePrompt || sidebar ? {
          display:    sidebar ? undefined : "inline-flex",
          alignItems: sidebar ? undefined : "center",
          cursor:     disabled ? "not-allowed" : "pointer",
          fontFamily: "'Sora', sans-serif",
        } : {
          display:        "inline-flex",
          alignItems:     "center",
          gap:            embedded ? 5 : 7,
          padding:        embedded ? "4px 8px" : isCompact ? "7px 12px" : "6px 12px",
          borderRadius:   embedded ? 7 : 8,
          border:         embedded ? "none" : "0.5px solid var(--bdr2)",
          background:     embedded ? (open ? "var(--card2)" : "transparent") : open ? "var(--lift)" : "var(--card)",
          cursor:         "pointer",
          fontFamily:     "'Sora', sans-serif",
          letterSpacing:  "-0.01em",
          transition:     "background 0.15s, border-color 0.15s",
          width:          (isCompact && !embedded) ? "100%" : "auto",
        }}
        onMouseEnter={homePrompt || sidebar ? undefined : e => {
          if (!open) e.currentTarget.style.background = embedded ? "var(--card2)" : "var(--card2)";
        }}
        onMouseLeave={homePrompt || sidebar ? undefined : e => {
          if (!open) e.currentTarget.style.background = embedded ? "transparent" : "var(--card)";
        }}
      >
        {sidebar ? (
          <>
            <span className="mode-selector-trigger-start">
              <span className="mode-selector-trigger-icon">{active.icon}</span>
              <span className="mode-selector-trigger-label">{active.label}</span>
            </span>
            <span className="mode-selector-trigger-end">
              <span className="mode-selector-trigger-version">{active.version}</span>
              <ChevronDown
                size={12}
                strokeWidth={2}
                className="mode-selector-trigger-chevron"
                style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
              />
            </span>
          </>
        ) : (
          <>
            {!embedded && (
              <span style={{ color: "var(--fg2)", display: "flex", alignItems: "center" }}>
                {active.icon}
              </span>
            )}
            <span style={homePrompt ? undefined : { fontSize: isCompact ? 13 : 12, fontWeight: 500, color: embedded ? "var(--fg2)" : isCompact ? "var(--fg)" : "var(--fg3)", letterSpacing: "-0.02em" }}>
              {embedded
                ? askPrefix
                  ? `Ask ${active.label} ${active.version}`
                  : `${active.label} ${active.version}`
                : active.label}
            </span>
            {!embedded && (
            <span style={{
              fontSize: isCompact ? 11 : 10, color: "var(--fg3)",
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
              size={homePrompt ? 14 : isCompact ? 14 : 12}
              strokeWidth={2}
              color="var(--fg3)"
              className="mode-selector-trigger-chevron"
              style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
            />
          </>
        )}
      </button>
      </HoverTip>

      {open && (
        <div
          className={`mode-selector-menu${useFloatingMenu ? " mode-selector-menu--floating" : ""}`}
          role="listbox"
          style={useFloatingMenu ? {
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
          right:        menuAlign === "end" ? 0 : isCompact ? 0 : undefined,
          minWidth:     isCompact ? undefined : 260,
          width:        isCompact ? "100%" : undefined,
          maxWidth:     isCompact ? "100%" : undefined,
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
                    <Check size={isCompact ? 14 : 12} strokeWidth={2.5} color="var(--fg3)" className="mode-selector-option-check" />
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
