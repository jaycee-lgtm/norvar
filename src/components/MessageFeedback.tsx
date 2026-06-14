"use client";

import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { MessageFeedbackRating, MessageFeedbackSource } from "@/lib/message-feedback";

type Props = {
  messageId?: string;
  feedback?: MessageFeedbackRating | null;
  disabled?: boolean;
  source: MessageFeedbackSource;
  containerId: string | null;
  gapKey?: string;
  messageContent: string;
  userMessage?: string;
  agent?: string;
  onFeedbackChange?: (rating: MessageFeedbackRating | null) => void;
};

export default function MessageFeedback({
  messageId,
  feedback = null,
  disabled = false,
  source,
  containerId,
  gapKey,
  messageContent,
  userMessage,
  agent = "nora",
  onFeedbackChange,
}: Props) {
  const [current, setCurrent] = useState<MessageFeedbackRating | null>(feedback);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCurrent(feedback ?? null);
  }, [feedback, messageId]);

  if (!messageId || !containerId || !messageContent.trim()) return null;

  const submit = async (rating: MessageFeedbackRating) => {
    if (disabled || saving) return;

    const next = current === rating ? null : rating;
    setSaving(true);
    setCurrent(next);
    onFeedbackChange?.(next);

    try {
      const res = await fetch("/api/message-feedback", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          source,
          container_id:    containerId,
          message_id:      messageId,
          rating:          next,
          message_content: messageContent,
          user_message:    userMessage,
          gap_key:         gapKey,
          agent,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not save feedback");
    } catch {
      setCurrent(current);
      onFeedbackChange?.(current);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="message-feedback" aria-label="Rate this response">
      <button
        type="button"
        className={`message-feedback-btn${current === "up" ? " active up" : ""}`}
        disabled={disabled || saving}
        aria-pressed={current === "up"}
        aria-label="Helpful response"
        onClick={() => { void submit("up"); }}
      >
        <ThumbsUp size={12} strokeWidth={2} />
      </button>
      <button
        type="button"
        className={`message-feedback-btn${current === "down" ? " active down" : ""}`}
        disabled={disabled || saving}
        aria-pressed={current === "down"}
        aria-label="Unhelpful response"
        onClick={() => { void submit("down"); }}
      >
        <ThumbsDown size={12} strokeWidth={2} />
      </button>
    </div>
  );
}
