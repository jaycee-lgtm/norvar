"use client";

import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { ArrowUp, Loader2 } from "lucide-react";
import ModeSelector, { type Mode } from "@/components/ModeSelector";
import { focusHomeComposerInput } from "@/lib/focus-home-composer";

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
}: AgentComposerProps) {
  const isHome = variant === "home";
  const hasText = value.trim().length > 0;
  const sendVisible = showSendButton ?? (hasText || loading);

  const handleShellMouseDown = (e: MouseEvent) => {
    if (hideInput || !inputRef?.current) return;
    focusHomeComposerInput(e, inputRef.current);
  };

  const rootClass = [
    "agent-composer",
    `agent-composer--${variant}`,
    isHome && hasText ? "agent-composer--active" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  const shellClass = [
    "agent-composer-shell",
    isHome ? "agent-composer-shell--home" : "agent-composer-shell--thread",
    isHome && hasText ? "agent-composer-shell--active" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rootClass}>
      {header}
      <div className={shellClass} onMouseDown={handleShellMouseDown}>
        {isHome && (
          <div className="agent-composer-prompt">
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
          <div className="agent-composer-input-row">
            <textarea
              ref={inputRef}
              className="agent-composer-field"
              placeholder={isHome ? "" : placeholder}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={disabled}
              rows={1}
            />
          </div>
        )}

        <div className="agent-composer-toolbar">
          <div className="agent-composer-toolbar-start">
            {attachControl}
            {modelControl}
            {extraToolbarStart}
            {!isHome && (
              <ModeSelector current={mode} embedded menuPlacement="top" />
            )}
          </div>
          <div className="agent-composer-toolbar-end">
            {extraToolbarEnd}
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
