"use client";

import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useState,
} from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import ModeSelector, { type Mode } from "@/components/ModeSelector";
import { focusComposerField, shouldIgnoreComposerFocusTap } from "@/lib/focus-home-composer";

export type AgentComposerProps = {
  variant: "home" | "thread";
  mode: Mode;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  canSend?: boolean;
  onSend: () => void;
  showSendButton?: boolean;
  hideInput?: boolean;
  attachControl?: ReactNode;
  voiceControl?: ReactNode;
  modelControl?: ReactNode;
  extraToolbarStart?: ReactNode;
  extraToolbarEnd?: ReactNode;
  header?: ReactNode;
  promptOverride?: ReactNode;
  sendAriaLabel?: string;
  className?: string;
  attachPlacement?: "start" | "end";
};

export default function AgentComposer({
  variant,
  mode,
  value,
  onChange,
  onKeyDown,
  inputRef,
  placeholder = "",
  disabled = false,
  loading = false,
  canSend = true,
  onSend,
  showSendButton,
  hideInput = false,
  attachControl,
  voiceControl,
  modelControl,
  extraToolbarStart,
  extraToolbarEnd,
  header,
  promptOverride,
  sendAriaLabel = "Send",
  className,
  attachPlacement = "start",
}: AgentComposerProps) {
  const isHome = variant === "home";
  const hasText = value.trim().length > 0;
  const [focused, setFocused] = useState(false);
  const isActive = isHome && (hasText || focused);
  const sendVisible = showSendButton ?? (hasText || loading);

  const focusField = () => {
    if (hideInput || disabled || !inputRef?.current) return;
    inputRef.current.focus();
    if (isHome) setFocused(true);
  };

  const handleShellPointerDown = (e: PointerEvent) => {
    if (hideInput || shouldIgnoreComposerFocusTap(e.target)) return;
    if (isHome) setFocused(true);
    focusComposerField(e, inputRef?.current ?? null);
  };

  const handleShellClick = (e: MouseEvent) => {
    if (hideInput || shouldIgnoreComposerFocusTap(e.target)) return;
    focusField();
  };

  const rootClass = [
    "agent-composer",
    `agent-composer--${variant}`,
    hideInput ? "agent-composer--hide-input" : "",
    isActive ? "agent-composer--active" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  const shellClass = [
    "agent-composer-shell",
    isHome ? "agent-composer-shell--home" : "agent-composer-shell--thread",
    hideInput ? "agent-composer-shell--hide-input" : "",
    isActive ? "agent-composer-shell--active" : "",
  ].filter(Boolean).join(" ");

  const attachInEnd = attachPlacement === "end";

  return (
    <div className={rootClass}>
      {header}
      <div
        className={shellClass}
        onPointerDown={handleShellPointerDown}
        onClick={handleShellClick}
      >
        {isHome && (
          <div
            className="agent-composer-prompt"
            onPointerDown={handleShellPointerDown}
            onClick={handleShellClick}
          >
            {promptOverride ?? (
              <ModeSelector
                current={mode}
                embedded
                askPrefix
                homePrompt
                menuPlacement="top"
              />
            )}
          </div>
        )}

        {!hideInput && (
          <div
            className="agent-composer-input-row"
            onPointerDown={handleShellPointerDown}
            onClick={handleShellClick}
          >
            <textarea
              ref={inputRef}
              className="agent-composer-field"
              placeholder={isHome ? "" : placeholder}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                if (!value.trim()) setFocused(false);
              }}
              disabled={disabled}
              rows={1}
            />
          </div>
        )}

        <div className="agent-composer-toolbar">
          <div className="agent-composer-toolbar-start">
            {!attachInEnd && attachControl}
            {modelControl}
            {extraToolbarStart}
            {!isHome && (
              <ModeSelector current={mode} embedded menuPlacement="top" />
            )}
          </div>
          <div className="agent-composer-toolbar-end">
            {extraToolbarEnd}
            {attachInEnd && attachControl}
            {voiceControl}
            {sendVisible && (
              <button
                type="button"
                className="send-btn"
                onClick={onSend}
                disabled={disabled || loading || !canSend}
                aria-label={sendAriaLabel}
              >
                {loading
                  ? <Loader2 size={16} className="spin" />
                  : <ArrowUp size={16} strokeWidth={2.5} />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
