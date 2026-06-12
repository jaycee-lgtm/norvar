"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Show, SignInButton } from "@clerk/nextjs";
import Sidebar from "@/components/Sidebar";
import ModeSelector from "@/components/ModeSelector";
import Logo from "@/components/Logo";
import SampleQuestionsDropdown from "@/components/SampleQuestionsDropdown";
import { VoiceInputIcon, VoiceErrorBanner } from "@/components/VoiceControls";
import { useVoice } from "@/hooks/useVoice";
import { CHAT_AGENT } from "@/lib/agents";
import { ArrowUp, Loader2, ShieldAlert, SquarePen, Trash2, Info } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

type DisplayMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "streaming"; content: string };

type SSEEvent =
  | { type: "token"; text: string }
  | { type: "done"; text?: string; conversation_id?: string }
  | { type: "error"; text: string };

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
  const folderId     = searchParams.get("folder");

  const [messages,       setMessages]       = useState<DisplayMessage[]>([]);
  const [history,        setHistory]        = useState<ChatMessage[]>([]);
  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [loadingSaved,   setLoadingSaved]   = useState(false);
  const [error,          setError]          = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [deleting, setDeleting]             = useState(false);

  const inputRef         = useRef<HTMLTextAreaElement>(null);
  const scrollRef        = useRef<HTMLDivElement>(null);
  const loadedIdRef      = useRef<string | null>(null);
  const handleSendRef    = useRef<(text: string) => Promise<string | null>>(async () => null);

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) {
      loadedIdRef.current = null;
      return;
    }
    if (loadedIdRef.current === id) return;

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
        loadedIdRef.current = id;
      })
      .catch((e: unknown) => {
        setMessages([]);
        setHistory([]);
        setConversationId(null);
        loadedIdRef.current = null;
        setError(e instanceof Error ? e.message : "Failed to load conversation");
      })
      .finally(() => setLoadingSaved(false));
  }, [searchParams]);

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

  const voice = useVoice({
    onVoiceSend: text => handleSendRef.current(text),
    disabled: loading,
  });

  const handleSend = async (textOverride?: string, fromVoice = false): Promise<string | null> => {
    const content = (textOverride ?? input).trim();
    if (!content || content.length <= 2) return null;
    if (!fromVoice && loading) return null;
    if (!textOverride) setInput("");
    setError("");

    const userMsg: ChatMessage = { role: "user", content };
    const newHistory = [...history, userMsg];

    setMessages(prev => [...prev, { role: "user", content }, { role: "streaming", content: "" }]);
    setHistory(newHistory);
    setLoading(true);

    let streamText = "";
    let finalResponse: string | null = null;

    try {
      const res = await fetch("/api/grc-chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          messages:        newHistory,
          conversation_id: conversationId,
          folder_id:       !conversationId ? folderId : undefined,
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
          finalResponse = finalText;
          setMessages(prev => {
            const next = [...prev];
            const idx  = next.findLastIndex(m => m.role === "streaming");
            if (idx >= 0) next[idx] = { role: "assistant", content: finalText };
            return next;
          });
          setHistory(prev => [...prev, { role: "assistant", content: finalText }]);
          if (event.conversation_id) {
            setConversationId(event.conversation_id);
            loadedIdRef.current = event.conversation_id;
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
      return null;
    } finally {
      setLoading(false);
    }

    return finalResponse;
  };

  handleSendRef.current = (text: string) => handleSend(text, true);

  const sendWithVoice = async (text?: string) => {
    const response = await handleSend(text, false);
    if (response) voice.speakAfterResponse(response);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendWithVoice();
    }
  };

  const voiceIcon = (
    <VoiceInputIcon
      isListening={voice.isListening}
      isTranscribing={voice.isTranscribing}
      isSpeaking={voice.isSpeaking}
      voiceActive={voice.settings.speakResponses || voice.settings.voiceConversation}
      configured={voice.support.configured}
      disabled={loading}
      onStartListening={voice.startListening}
      onStopListening={voice.stopListening}
      onStopSpeaking={voice.stopSpeak}
      agentName={CHAT_AGENT.name}
    />
  );

  const startNew = () => {
    setMessages([]);
    setHistory([]);
    setInput("");
    setError("");
    setConversationId(null);
    loadedIdRef.current = null;
    router.replace("/chat", { scroll: false });
  };

  const deleteChat = async () => {
    if (!conversationId) return;
    const title = messages.find(m => m.role === "user")?.content.slice(0, 60) || "this chat";
    if (!confirm(`Delete "${title}"?`)) return;
    setDeleting(true);
    setError("");
    try {
      const res = await fetch("/api/conversations", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: conversationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      startNew();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not delete chat");
    } finally {
      setDeleting(false);
    }
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
              <Logo size={40} />
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
                  {voiceIcon}
                  <button type="button" className="send-btn" onClick={() => sendWithVoice()} disabled={!canSend}>
                    {loading
                      ? <Loader2 size={16} className="spin" />
                      : <ArrowUp size={16} strokeWidth={2.5} />}
                  </button>
                </div>
                {voice.voiceError && (
                  <VoiceErrorBanner message={voice.voiceError} onDismiss={voice.clearError} />
                )}
              </div>

              <SampleQuestionsDropdown
                onSelect={q => sendWithVoice(q)}
                disabled={loading}
              />

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
                          {CHAT_AGENT.name}
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
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "var(--fg3)", fontFamily: "'Sora', sans-serif" }}>
                      Chat
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <SampleQuestionsDropdown
                        align="left"
                        onSelect={q => sendWithVoice(q)}
                        disabled={loading}
                      />
                      {conversationId && (
                        <button
                          type="button"
                          onClick={() => { void deleteChat(); }}
                          disabled={deleting || loading}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 5,
                            fontSize: 11, color: "var(--rh)", background: "transparent",
                            border: "none", cursor: deleting || loading ? "not-allowed" : "pointer",
                            fontFamily: "'Sora', sans-serif", letterSpacing: "-0.01em", padding: 0,
                            opacity: deleting || loading ? 0.5 : 1,
                          }}
                        >
                          <Trash2 size={11} strokeWidth={2} />
                          Delete chat
                        </button>
                      )}
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
                  </div>
                  <div className="chat-input-bar">
                    <input
                      className="chat-input-field"
                      placeholder="Ask a follow-up question..."
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKey}
                    />
                    <VoiceInputIcon
                      isListening={voice.isListening}
                      isTranscribing={voice.isTranscribing}
                      isSpeaking={voice.isSpeaking}
                      voiceActive={voice.settings.speakResponses || voice.settings.voiceConversation}
                      configured={voice.support.configured}
                      disabled={loading}
                      onStartListening={voice.startListening}
                      onStopListening={voice.stopListening}
                      onStopSpeaking={voice.stopSpeak}
                      size="sm"
                      agentName={CHAT_AGENT.name}
                    />
                    <button type="button" className="chat-send-btn" onClick={() => sendWithVoice()} disabled={!canSend}>
                      {loading
                        ? <Loader2 size={14} className="spin" />
                        : <ArrowUp size={14} strokeWidth={2.5} />}
                    </button>
                  </div>
                  {voice.voiceError && (
                    <VoiceErrorBanner message={voice.voiceError} onDismiss={voice.clearError} />
                  )}
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
          <Logo size={40} />
          <h1 className="home-heading">Chat with {CHAT_AGENT.name}</h1>
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
