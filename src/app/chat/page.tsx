"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Show, SignInButton } from "@clerk/nextjs";
import Sidebar from "@/components/Sidebar";
import ModeSelector from "@/components/ModeSelector";
import { ArrowUp, Loader2, ShieldAlert, SquarePen, Info } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

type DisplayMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "streaming"; content: string };

type SSEEvent =
  | { type: "token"; text: string }
  | { type: "done"; text?: string; conversation_id?: string }
  | { type: "error"; text: string };

const STARTERS = [
  "What does the EU AI Act require for high-risk AI systems?",
  "How does GDPR Art.35 DPIA work in practice?",
  "What is the difference between NIS2 and DORA?",
  "Explain Illinois BIPA and the risk for computer vision products",
  "What does the Colorado AI Act require from developers?",
  "How do I prepare for a SOC 2 Type II audit?",
  "What is the NIST AI Risk Management Framework?",
  "When does CCPA apply to my company?",
];

async function readSSEStream(response: Response, onEvent: (e: SSEEvent) => void) {
  const reader  = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as SSEEvent);
      } catch {
        // ignore malformed chunks
      }
    }
  }
}

// ── Chat page ──────────────────────────────────────────────────────────────────

function InfoTip({ text }: { text: string }) {
  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={e => {
        const t = e.currentTarget.querySelector(".tip") as HTMLElement;
        if (t) t.style.opacity = "1";
      }}
      onMouseLeave={e => {
        const t = e.currentTarget.querySelector(".tip") as HTMLElement;
        if (t) t.style.opacity = "0";
      }}
    >
      <Info size={14} strokeWidth={1.75} color="var(--fg3)" style={{ cursor: "default" }} />
      <div
        className="tip"
        style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
          transform: "translateX(-50%)", background: "var(--card)",
          border: "0.5px solid var(--bdr2)", borderRadius: 7,
          padding: "10px 14px", width: 260, fontSize: 12,
          color: "var(--fg2)", lineHeight: 1.65, fontFamily: "'Sora', sans-serif",
          letterSpacing: "-.01em", opacity: 0, transition: "opacity 0.15s",
          pointerEvents: "none", zIndex: 50,
          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}

function Chat() {
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [messages,       setMessages]       = useState<DisplayMessage[]>([]);
  const [history,        setHistory]        = useState<ChatMessage[]>([]);
  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [loadingSaved,   setLoadingSaved]   = useState(false);
  const [error,          setError]          = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);

  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id || messages.length > 0) return;

    setLoadingSaved(true);
    setError("");

    fetch(`/api/conversations?id=${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        if (!d.conversation) throw new Error("Conversation not found");
        const msgs: ChatMessage[] = d.conversation.messages ?? [];
        setHistory(msgs);
        setMessages(msgs.map(m => ({ role: m.role, content: m.content })));
        setConversationId(id);
      })
      .catch((e: unknown) => {
        setMessages([]);
        setHistory([]);
        setError(e instanceof Error ? e.message : "Failed to load conversation");
      })
      .finally(() => setLoadingSaved(false));
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const canSend = input.trim().length > 2 && !loading;

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || content.length <= 2 || loading) return;
    setInput("");
    setError("");

    const userMsg: ChatMessage = { role: "user", content };
    const newHistory = [...history, userMsg];

    setMessages(prev => [...prev, { role: "user", content }, { role: "streaming", content: "" }]);
    setHistory(newHistory);
    setLoading(true);

    let streamText = "";

    try {
      const res = await fetch("/api/grc-chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          messages:        newHistory,
          conversation_id: conversationId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Chat failed");
      }

      await readSSEStream(res, event => {
        if (event.type === "token") {
          streamText += event.text;
          setMessages(prev => {
            const next = [...prev];
            const idx  = next.findLastIndex(m => m.role === "streaming");
            if (idx >= 0) next[idx] = { role: "streaming", content: streamText };
            return next;
          });
        } else if (event.type === "done") {
          const finalText = streamText || event.text || "";
          setMessages(prev => {
            const next = [...prev];
            const idx  = next.findLastIndex(m => m.role === "streaming");
            if (idx >= 0) next[idx] = { role: "assistant", content: finalText };
            return next;
          });
          setHistory(prev => [...prev, { role: "assistant", content: finalText }]);
          if (event.conversation_id) {
            setConversationId(event.conversation_id);
            router.replace(`/chat?id=${event.conversation_id}`, { scroll: false });
          }
        } else if (event.type === "error") {
          throw new Error(event.text);
        }
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages(prev => prev.filter(m => m.role !== "streaming"));
      setHistory(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startNew = () => {
    setMessages([]);
    setHistory([]);
    setInput("");
    setError("");
    setConversationId(null);
    router.replace("/chat", { scroll: false });
  };

  const isHome = messages.length === 0 && !loadingSaved;

  const streamCursor = (
    <span style={{
      display: "inline-block", width: 2, height: "1em", background: "var(--fg3)",
      marginLeft: 2, animation: "pulse-dot 1s ease infinite", verticalAlign: "text-bottom",
    }} />
  );

  return (
    <div className="app-shell">
      <Show when="signed-in">
        <Sidebar />
        <div className="main-area">

          {loadingSaved && (
            <div className="home-body">
              <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                <span className="loading-dot" />
                <span className="loading-dot" />
                <span className="loading-dot" />
              </div>
            </div>
          )}

          {isHome && (
            <div className="home-body">
              <div className="home-logo">N</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                <h1 className="home-heading">How can I help?</h1>
                <InfoTip text="Ask about regulations, compliance requirements, audit preparation, or how specific laws apply to your work." />
              </div>

              <div style={{ marginBottom: 14 }}>
                <ModeSelector current="chat" />
              </div>

              <div className="input-wrap" style={{ marginBottom: 24 }}>
                <div className="input-bar">
                  <textarea
                    ref={inputRef}
                    className="input-textarea"
                    placeholder="Ask a GRC question..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKey}
                    rows={1}
                  />
                  <button type="button" className="send-btn" onClick={() => handleSend()} disabled={!canSend}>
                    {loading
                      ? <Loader2 size={16} className="spin" />
                      : <ArrowUp size={16} strokeWidth={2.5} />}
                  </button>
                </div>
              </div>

              <div style={{
                display: "flex", flexWrap: "wrap", gap: 8,
                justifyContent: "center", maxWidth: 620,
              }}>
                {STARTERS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSend(s)}
                    style={{
                      fontSize: 12, color: "var(--fg2)",
                      background: "var(--card)", border: "0.5px solid var(--bdr2)",
                      borderRadius: 20, padding: "7px 14px",
                      cursor: "pointer", fontFamily: "'Sora',sans-serif",
                      letterSpacing: "-0.01em", lineHeight: 1.4,
                      transition: "border-color 0.15s, color 0.15s",
                      textAlign: "left",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = "var(--bdr3)";
                      e.currentTarget.style.color = "var(--fg)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = "var(--bdr2)";
                      e.currentTarget.style.color = "var(--fg2)";
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {error && <p style={{ marginTop: 14, fontSize: 12, color: "var(--rh)" }}>{error}</p>}
            </div>
          )}

          {!isHome && !loadingSaved && (
            <>
              <div style={{ padding: "14px 32px 0", flexShrink: 0 }}>
                <ModeSelector current="chat" />
              </div>
              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
                <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 32px", display: "flex", flexDirection: "column", gap: 14 }}>
                {messages.map((msg, i) => {
                  if (msg.role === "user") {
                    return (
                      <div key={i} className="msg-user fade-up">
                        {msg.content}
                      </div>
                    );
                  }

                  const isStreaming = msg.role === "streaming";

                  return (
                    <div key={i} className="msg-ai fade-up">
                      <div className="msg-ai-card">
                        <div className="msg-ai-label">
                          <ShieldAlert size={11} color="var(--fg3)" />
                          Norvar
                          {isStreaming && loading && i === messages.length - 1 && (
                            <span style={{ marginLeft: 4, display: "inline-flex", alignItems: "center", gap: 3 }}>
                              <span className="loading-dot" />
                              <span className="loading-dot" />
                              <span className="loading-dot" />
                            </span>
                          )}
                        </div>
                        <p style={{
                          fontSize: 13.5, color: "var(--fg2)", lineHeight: 1.8,
                          letterSpacing: "-0.01em", whiteSpace: "pre-wrap",
                        }}>
                          {msg.content}
                          {isStreaming && streamCursor}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {error && <p style={{ fontSize: 12, color: "var(--rh)" }}>{error}</p>}
                </div>
              </div>

              <div className="chat-input-row">
                <div className="chat-input-inner">
                  <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--fg3)", fontFamily: "'Sora', sans-serif" }}>
                      GRC chat
                    </span>
                    <button
                      type="button"
                      onClick={startNew}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontSize: 11, color: "var(--fg3)", background: "transparent",
                        border: "none", cursor: "pointer", fontFamily: "'Sora', sans-serif",
                        letterSpacing: "-0.01em", padding: 0,
                      }}
                    >
                      <SquarePen size={11} strokeWidth={2} />
                      New chat
                    </button>
                  </div>
                  <div className="chat-input-bar">
                    <input
                      className="chat-input-field"
                      placeholder="Ask a follow-up question..."
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKey}
                    />
                    <button type="button" className="chat-send-btn" onClick={() => handleSend()} disabled={!canSend}>
                      {loading
                        ? <Loader2 size={14} className="spin" />
                        : <ArrowUp size={14} strokeWidth={2.5} />}
                    </button>
                  </div>
                  </div>
                </div>
              </div>
            </>
          )}

        </div>
      </Show>

      <Show when="signed-out">
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: 32, textAlign: "center", background: "var(--bg)",
        }}>
          <div className="home-logo">N</div>
          <h1 className="home-heading">Norvar GRC Chat</h1>
          <p className="home-sub" style={{ marginBottom: 28 }}>
            Sign in to ask questions about governance, risk and compliance.
          </p>
          <SignInButton>
            <button type="button" className="btn-primary">Sign in to get started</button>
          </SignInButton>
        </div>
      </Show>
    </div>
  );
}
