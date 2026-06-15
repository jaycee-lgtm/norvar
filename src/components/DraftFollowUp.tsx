"use client";

import { useState, useRef } from "react";
import { ArrowUp, Loader2, MessageSquare } from "lucide-react";
import { readSSEStream } from "@/lib/sse";
import { createTypewriterDrain } from "@/lib/typewriter-drain";
import FormattedMessage from "@/components/FormattedMessage";
import AiDisclaimer from "@/components/AiDisclaimer";
import type { DraftFollowUpMessage } from "@/lib/draft-followup";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";

type QuickAction = {
  label:    string;
  message:  string;
  autoSend?: boolean;
};

export default function DraftFollowUp({
  draftId,
  thread,
  sectionNumber,
  agent,
  initialMessages = [],
  onMessagesChange,
  toggleLabel = "Ask about this section",
  hint = "Ask questions, suggest revisions, or request alternative language for this section.",
  placeholder = "Ask a question or suggest an update...",
  quickActions = [],
}: {
  draftId:           string;
  thread:            string;
  sectionNumber?:    string;
  agent:             "nora" | "cassius";
  initialMessages?:  DraftFollowUpMessage[];
  onMessagesChange?: (messages: DraftFollowUpMessage[]) => void;
  toggleLabel?:      string;
  hint?:             string;
  placeholder?:      string;
  quickActions?:     QuickAction[];
}) {
  const [open, setOpen]         = useState(initialMessages.length > 0);
  const [messages, setMessages] = useState<DraftFollowUpMessage[]>(initialMessages);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const typewriterRef           = useRef<ReturnType<typeof createTypewriterDrain> | null>(null);

  const agentName = agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name;
  const canSend   = input.trim().length > 0 && !loading;

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loading) return;
    const prior = messages;
    setInput("");
    setError("");
    setOpen(true);
    setLoading(true);

    setMessages([...prior, { role: "user", content: text }, { role: "assistant", content: "" }]);

    typewriterRef.current?.reset();
    typewriterRef.current = createTypewriterDrain(ch => {
      setMessages(prev => {
        const next = [...prev];
        const idx  = next.length - 1;
        if (idx >= 0 && next[idx].role === "assistant") {
          next[idx] = { role: "assistant", content: next[idx].content + ch };
        }
        return next;
      });
    });

    let reply = "";

    try {
      const res = await fetch("/api/draft/followup", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          draft_id:         draftId,
          thread,
          messages:         prior,
          new_user_message: text,
          section_number:   sectionNumber,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Chat failed");
      }

      await readSSEStream(res, event => {
        if (event.type === "token") {
          reply += event.text ?? "";
          typewriterRef.current?.enqueue(event.text ?? "");
        } else if (event.type === "done") {
          const saved = (event as { messages?: DraftFollowUpMessage[] }).messages;
          if (saved?.length) {
            setMessages(saved);
            onMessagesChange?.(saved);
          } else if (reply) {
            const finalMsgs = [
              ...prior,
              { role: "user" as const, content: text },
              { role: "assistant" as const, content: reply },
            ];
            setMessages(finalMsgs);
            onMessagesChange?.(finalMsgs);
          }
        } else if (event.type === "error") {
          throw new Error(event.text ?? "Chat failed");
        }
      });
    } catch (e: unknown) {
      typewriterRef.current?.reset();
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
      void send();
    }
  };

  const firstAssistantIndex = messages.findIndex(m => m.role === "assistant");

  return (
    <div className="gap-chat redline-inline-followup" onClick={e => e.stopPropagation()}>
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
        {open ? "Hide chat" : toggleLabel}
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
            <p className="gap-chat-hint">{hint}</p>
          )}

          {quickActions.length > 0 && (
            <div className="redline-inline-quick-actions">
              {quickActions.map(action => (
                <button
                  key={action.label}
                  type="button"
                  className="redline-inline-quick-action"
                  disabled={loading}
                  onClick={() => {
                    if (action.autoSend) void send(action.message);
                    else setInput(action.message);
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}

          <div className="gap-chat-msgs">
            {messages.map((msg, i) => (
              <div
                key={msg.id ?? i}
                className={msg.role === "user" ? "gap-chat-msg gap-chat-msg-user" : "gap-chat-msg gap-chat-msg-ai"}
              >
                {msg.role === "assistant" ? (
                  <>
                    <FormattedMessage content={msg.content} />
                    {loading && i === messages.length - 1 && !msg.content && (
                      <span className="gap-chat-thinking">
                        <span className="loading-dot" />
                        <span className="loading-dot" />
                        <span className="loading-dot" />
                      </span>
                    )}
                    {!(loading && i === messages.length - 1 && !msg.content) && i === firstAssistantIndex && (
                      <AiDisclaimer agentName={agentName} className="ai-disclaimer ai-disclaimer--gap-chat" />
                    )}
                  </>
                ) : (
                  msg.content
                )}
              </div>
            ))}
          </div>

          {error && <p className="gap-chat-error">{error}</p>}

          <div className="gap-chat-input-row">
            <input
              className="gap-chat-input"
              placeholder={placeholder}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              disabled={loading}
            />
            <button type="button" className="gap-chat-send" onClick={() => void send()} disabled={!canSend}>
              {loading ? <Loader2 size={12} className="spin" /> : <ArrowUp size={12} strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
