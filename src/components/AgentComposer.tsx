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
import HoverTip from "@/components/HoverTip";
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
  const isTyping = value.length > 0;
  const [focused, setFocused] = useState(false);
  const isActive = isHome && (hasText || focused);
  const sendVisible = showSendButton ?? (hasText || loading);
  const hideToolbarIcons = isTyping && !hideInput;

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

  const promptHandlers = hideInput
    ? {}
    : { onPointerDown: handleShellPointerDown, onClick: handleShellClick };

  const rootClass = [
    "agent-composer",
    `agent-composer--${variant}`,
    hideInput ? "agent-composer--hide-input" : "",
    attachPlacement === "end" ? "agent-composer--attach-end" : "",
    isActive ? "agent-composer--active" : "",
    hideToolbarIcons ? "agent-composer--typing" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  const shellClass = [
    "agent-composer-shell",
    isHome ? "agent-composer-shell--home" : "agent-composer-shell--thread",
    hideInput ? "agent-composer-shell--hide-input" : "",
    isActive ? "agent-composer-shell--active" : "",
  ].filter(Boolean).join(" ");

  const attachInEnd = attachPlacement === "end";
  const showVoice = voiceControl && !hideToolbarIcons;
  const showAttach = attachControl && !hideToolbarIcons;
  const showModel = modelControl && !hideToolbarIcons;
  const showExtraStart = extraToolbarStart;
  const showExtraEnd = extraToolbarEnd && !hideToolbarIcons;
  const showHomePrompt = isHome && !hideToolbarIcons;

  return (
    <div className={rootClass}>
      {header}
      <div
        className={shellClass}
        {...(hideInput ? {} : { onPointerDown: handleShellPointerDown, onClick: handleShellClick })}
      >
        {showHomePrompt && (
          <div
            className="agent-composer-prompt"
            {...promptHandlers}
          >
            {promptOverride ?? (
              <ModeSelector
                current={mode}
                embedded
                askPrefix
                homePrompt
                menuPlacement="top"
                disabled={disabled || loading}
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
              placeholder={isHome && hideInput ? "" : placeholder}
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
            {!attachInEnd && showAttach && attachControl}
            {showModel && modelControl}
            {showExtraStart}
            {!isHome && !hideToolbarIcons && (
              <ModeSelector current={mode} embedded menuPlacement="top" />
            )}
          </div>
          <div className="agent-composer-toolbar-end">
            {showExtraEnd}
            {showVoice && voiceControl}
            {attachInEnd && showAttach && attachControl}
            {sendVisible && (
              <HoverTip label={sendAriaLabel} className="agent-composer-send-wrap">
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
              </HoverTip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
