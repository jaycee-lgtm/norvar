"use client";

import { useState } from "react";
import { ArrowUp, Loader2, MessageSquare } from "lucide-react";
import { readSSEStream } from "@/lib/sse";

export type GapChatMessage = { role: "user" | "assistant"; content: string };

export type GapChatContext = {
  title:              string;
  severity:           string;
  domain?:            string;
  detail?:            string | null;
  frameworks?:        string[];
  remediation_steps?: string | null;
};

type GapChatProps = {
  gap:               GapChatContext;
  remediationId?:     string;
  assessmentId?:      string | null;
  gapKey?:            string;
  initialMessages?: GapChatMessage[];
  onMessagesChange?: (messages: GapChatMessage[]) => void;
};

export default function GapChat({
  gap,
  remediationId,
  assessmentId,
  gapKey,
  initialMessages = [],
  onMessagesChange,
}: GapChatProps) {
  const [open, setOpen]         = useState(initialMessages.length > 0);
  const [messages, setMessages] = useState<GapChatMessage[]>(initialMessages);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const canSend = input.trim().length > 0 && !loading;

  const send = async () => {
    if (!canSend) return;
    const text = input.trim();
    const prior  = messages;
    setInput("");
    setError("");
    setOpen(true);
    setLoading(true);

    setMessages([...prior, { role: "user", content: text }, { role: "assistant", content: "" }]);

    let reply = "";

    try {
      const res = await fetch("/api/gap-chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          messages: prior,
          new_user_message: text,
          gap,
          remediation_id: remediationId,
          assessment_id:  assessmentId,
          gap_key:        gapKey,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Chat failed");
      }

      await readSSEStream(res, event => {
        if (event.type === "token") {
          reply += event.text ?? "";
          setMessages(prev => {
            const next = [...prev];
            const idx  = next.length - 1;
            if (idx >= 0 && next[idx].role === "assistant") {
              next[idx] = { role: "assistant", content: reply };
            }
            return next;
          });
        } else if (event.type === "done") {
          const saved = (event as { messages?: GapChatMessage[] }).messages;
          if (saved?.length) {
            setMessages(saved);
            onMessagesChange?.(saved);
          } else if (reply) {
            const finalMsgs = [...prior, { role: "user" as const, content: text }, { role: "assistant" as const, content: reply }];
            setMessages(finalMsgs);
            onMessagesChange?.(finalMsgs);
          }
        } else if (event.type === "error") {
          throw new Error(event.text);
        }
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages(prior);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      send();
    }
  };

  return (
    <div className="gap-chat" onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => {
          setOpen(v => {
            if (v) setError("");
            return !v;
          });
        }}
        className="gap-chat-toggle"
      >
        <MessageSquare size={11} />
        {open ? "Hide chat" : "Ask about remediation"}
        {messages.length > 0 && !open && (
          <span className="gap-chat-count">{Math.ceil(messages.length / 2)}</span>
        )}
      </button>

      {error && !open && (
        <p className="gap-chat-error" style={{ marginTop: 6 }}>{error}</p>
      )}

      {open && (
        <div className="gap-chat-panel">
          {messages.length === 0 && (
            <p className="gap-chat-hint">
              Ask Norvar how to implement the fix, who should own it, or what evidence you need.
            </p>
          )}

          <div className="gap-chat-msgs">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={msg.role === "user" ? "gap-chat-msg gap-chat-msg-user" : "gap-chat-msg gap-chat-msg-ai"}
            >
              {msg.content}
              {loading && i === messages.length - 1 && msg.role === "assistant" && !msg.content && (
                <span className="gap-chat-thinking">
                  <span className="loading-dot" />
                  <span className="loading-dot" />
                  <span className="loading-dot" />
                </span>
              )}
            </div>
          ))}
          </div>

          {error && <p className="gap-chat-error">{error}</p>}

          <div className="gap-chat-input-row">
            <input
              className="gap-chat-input"
              placeholder="Ask a remediation question..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
            />
            <button type="button" className="gap-chat-send" onClick={send} disabled={!canSend}>
              {loading ? <Loader2 size={12} className="spin" /> : <ArrowUp size={12} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
