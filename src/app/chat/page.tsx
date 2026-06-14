"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Show, SignInButton } from "@clerk/nextjs";
import AppShell from "@/components/AppShell";
import ModeSelector from "@/components/ModeSelector";
import Logo from "@/components/Logo";
import InfoTip from "@/components/InfoTip";
import SampleQuestionsDropdown from "@/components/SampleQuestionsDropdown";
import { VoiceInputIcon, VoiceErrorBanner } from "@/components/VoiceControls";
import DocumentPicker, { SelectedDocumentChips } from "@/components/DocumentPicker";
import FormattedMessage from "@/components/FormattedMessage";
import { useVoice } from "@/hooks/useVoice";
import { useIsMobile } from "@/hooks/useIsMobile";
import { CHAT_AGENT } from "@/lib/agents";
import { createTypewriterDrain, type TypewriterDrain } from "@/lib/typewriter-drain";
import { readSSEStream } from "@/lib/sse";
import { ArrowUp, Loader2, ShieldAlert, SquarePen, Trash2, FileText } from "lucide-react";

type ChatMessage = { role: "user" | "assistant"; content: string };

type DisplayMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string }
  | { role: "streaming"; content: string };

type SSEEvent =
  | { type: "token"; text: string }
  | { type: "done"; text?: string; conversation_id?: string }
  | { type: "error"; text: string };

// ── Chat page ──────────────────────────────────────────────────────────────────

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
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [docCatalog, setDocCatalog]         = useState<Record<string, string>>({});
  const [attachedDocText, setAttachedDocText] = useState("");
  const [attachedDocName, setAttachedDocName] = useState("");
  const [fileExtracting, setFileExtracting]   = useState(false);
  const [fileError, setFileError]             = useState("");

  const fileRef          = useRef<HTMLInputElement>(null);
  const inputRef         = useRef<HTMLTextAreaElement>(null);
  const scrollRef        = useRef<HTMLDivElement>(null);
  const loadedIdRef      = useRef<string | null>(null);
  const handleSendRef    = useRef<(text: string) => Promise<string | null>>(async () => null);
  const typewriterRef    = useRef<TypewriterDrain | null>(null);

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) {
      if (loadedIdRef.current !== null) {
        setMessages([]);
        setHistory([]);
        setConversationId(null);
        setError("");
        setInput("");
        setSelectedDocumentIds([]);
        setAttachedDocText("");
        setAttachedDocName("");
        setFileError("");
      }
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
    fetch("/api/documents?status=active")
      .then(r => r.json())
      .then(d => {
        const map: Record<string, string> = {};
        for (const doc of d.documents ?? []) map[doc.id] = doc.name;
        setDocCatalog(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const canSend = input.trim().length > 2 && !loading && !fileExtracting;

  const hasAttachedDocs = selectedDocumentIds.length > 0 || !!attachedDocText;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setFileExtracting(true);
    setFileError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch("/api/documents/extract", { method: "POST", body: form });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not read file");
      setAttachedDocText(data.text ?? "");
      setAttachedDocName(file.name);
    } catch (err: unknown) {
      setAttachedDocText("");
      setAttachedDocName("");
      setFileError(err instanceof Error ? err.message : "Could not read file");
    } finally {
      setFileExtracting(false);
    }
  };

  const clearAttachedDoc = () => {
    setAttachedDocText("");
    setAttachedDocName("");
    setFileError("");
  };

  const isMobileView = useIsMobile();

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

    typewriterRef.current?.reset();
    typewriterRef.current = createTypewriterDrain(ch => {
      setMessages(prev => {
        const next = [...prev];
        const idx  = next.findLastIndex(m => m.role === "streaming");
        if (idx >= 0) {
          const msg = next[idx] as Extract<DisplayMessage, { role: "streaming" }>;
          next[idx] = { role: "streaming", content: msg.content + ch };
        }
        return next;
      });
    });

    let streamText = "";
    let finalResponse: string | null = null;
    const wasNewConversation = !conversationId;

    try {
      const res = await fetch("/api/grc-chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          messages:        newHistory,
          conversation_id: conversationId,
          folder_id:       !conversationId ? folderId : undefined,
          document_ids:    selectedDocumentIds.length ? selectedDocumentIds : undefined,
          contract_text:   attachedDocText || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Chat failed");
      }

      await readSSEStream(res, event => {
        if (event.type === "token") {
          streamText += event.text ?? "";
          typewriterRef.current?.enqueue(event.text ?? "");
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
            if (wasNewConversation) {
              window.dispatchEvent(new Event("norvar:conversations-updated"));
            }
          }
        } else if (event.type === "error") {
          throw new Error(event.text);
        }
      });
    } catch (e: unknown) {
      typewriterRef.current?.reset();
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

  const attachControl = (
    <DocumentPicker
      selectedIds={selectedDocumentIds}
      onChange={setSelectedDocumentIds}
      folderId={folderId}
      disabled={loading || fileExtracting}
      variant="icon"
      onUpload={() => fileRef.current?.click()}
      uploading={fileExtracting}
      uploadAttached={!!attachedDocName}
    />
  );

  const examplesControl = (
    <SampleQuestionsDropdown
      variant="icon"
      menuPlacement="top"
      onSelect={q => sendWithVoice(q)}
      disabled={loading}
    />
  );

  const startNew = () => {
    setMessages([]);
    setHistory([]);
    setInput("");
    setError("");
    setConversationId(null);
    setSelectedDocumentIds([]);
    clearAttachedDoc();
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
    <>
      <Show when="signed-in">
        <AppShell>
          <div className={`main-area${!isHome && !loadingSaved && isMobileView ? " mobile-thread-layout" : ""}`}>

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
            <div className={`home-body${isMobileView ? " mobile-home-layout" : ""}`}>
              <div className={isMobileView ? "home-hero-block" : undefined}>
                <div className="home-hero-row">
                  <Logo variant="hero" className="home-hero-logo" size={isMobileView ? 46 : 52} />
                  <div className="home-hero-heading-wrap">
                    <h1 className="home-hero-title">How can I help?</h1>
                    {!isMobileView && (
                      <InfoTip text="Ask about regulations, compliance requirements, audit preparation, or how specific laws apply to your work." />
                    )}
                  </div>
                </div>
              </div>

              <div className={isMobileView ? "home-composer-block" : "input-wrap"} style={isMobileView ? undefined : { marginBottom: 24 }}>
                {hasAttachedDocs && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8, padding: isMobileView ? undefined : "0 2px" }}>
                    <SelectedDocumentChips
                      documents={selectedDocumentIds.map(id => ({ id, name: docCatalog[id] ?? "Document" }))}
                      onRemove={id => setSelectedDocumentIds(prev => prev.filter(x => x !== id))}
                    />
                    {attachedDocName && (
                      <span style={{
                        fontSize: 11, color: "var(--fg2)", background: "var(--card2)",
                        padding: "2px 9px", borderRadius: 20, border: "0.5px solid var(--bdr2)",
                        display: "inline-flex", alignItems: "center", gap: 5,
                        fontFamily: "'Sora', sans-serif",
                      }}>
                        <FileText size={10} strokeWidth={2} />
                        {attachedDocName}
                        <button type="button" onClick={clearAttachedDoc} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                          ×
                        </button>
                      </span>
                    )}
                  </div>
                )}
                {isMobileView ? (
                  <div className="mobile-composer">
                    <div className="mobile-composer-input-row">
                      {!input.trim() && (
                        <span className="mobile-composer-prompt-label">
                          Chat with {CHAT_AGENT.name}
                        </span>
                      )}
                      <textarea
                        ref={inputRef}
                        className="input-textarea mobile-composer-field"
                        placeholder=""
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKey}
                        rows={1}
                      />
                    </div>
                    <div className="mobile-composer-tools mobile-composer-tools--minimal">
                      <div className="composer-toolbar-start">
                        {attachControl}
                        {examplesControl}
                      </div>
                      <ModeSelector current="chat" embedded menuPlacement="top" />
                      <div className="mobile-composer-actions">
                        {voiceIcon}
                        <button type="button" className="send-btn" onClick={() => sendWithVoice()} disabled={!canSend}>
                          {loading
                            ? <Loader2 size={16} className="spin" />
                            : <ArrowUp size={16} strokeWidth={2.5} />}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
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
                      <div className="composer-toolbar">
                        <div className="composer-toolbar-start">
                          {attachControl}
                          {examplesControl}
                        </div>
                        <div className="composer-toolbar-end">
                          <ModeSelector current="chat" embedded menuPlacement="top" />
                          {voiceIcon}
                          <button type="button" className="send-btn" onClick={() => sendWithVoice()} disabled={!canSend}>
                            {loading
                              ? <Loader2 size={16} className="spin" />
                              : <ArrowUp size={16} strokeWidth={2.5} />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
                <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt" style={{ display: "none" }} onChange={handleFileUpload} />
                {fileError && (
                  <p style={{ fontSize: 11, color: "var(--rh)", marginTop: 8, fontFamily: "'Sora', sans-serif" }}>{fileError}</p>
                )}
                {voice.voiceError && (
                  <VoiceErrorBanner message={voice.voiceError} onDismiss={voice.clearError} />
                )}
              </div>

              {error && <p style={{ marginTop: 14, fontSize: 12, color: "var(--rh)", textAlign: isMobileView ? "center" : undefined }}>{error}</p>}
            </div>
          )}

          {!isHome && !loadingSaved && (
            <>
              <div ref={scrollRef} className="main-scroll">
                <div className="thread-inner" style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
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
                        {isStreaming ? (
                          <p className="formatted-message-p" style={{ whiteSpace: "pre-wrap" }}>
                            {msg.content}
                            {streamCursor}
                          </p>
                        ) : (
                          <FormattedMessage content={msg.content} />
                        )}
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
                  {(hasAttachedDocs) && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
                      <SelectedDocumentChips
                        documents={selectedDocumentIds.map(id => ({ id, name: docCatalog[id] ?? "Document" }))}
                        onRemove={id => setSelectedDocumentIds(prev => prev.filter(x => x !== id))}
                      />
                      {attachedDocName && (
                        <span style={{
                          fontSize: 11, color: "var(--fg2)", background: "var(--card2)",
                          padding: "2px 9px", borderRadius: 20, border: "0.5px solid var(--bdr2)",
                          display: "inline-flex", alignItems: "center", gap: 5,
                          fontFamily: "'Sora', sans-serif",
                        }}>
                          <FileText size={10} strokeWidth={2} />
                          {attachedDocName}
                          <button type="button" onClick={clearAttachedDoc} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex" }}>
                            ×
                          </button>
                        </span>
                      )}
                    </div>
                  )}
                  {!isMobileView && (
                  <div className="chat-input-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "var(--fg3)", fontFamily: "'Sora', sans-serif" }}>
                      Chat
                    </span>
                    <div className="chat-input-actions" style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                  )}
                  {isMobileView && (
                    <div className="mobile-thread-toolbar mobile-only">
                      <button type="button" className="mobile-thread-action" onClick={startNew}>
                        <SquarePen size={13} strokeWidth={2} />
                        New chat
                      </button>
                      {conversationId && (
                        <button
                          type="button"
                          className="mobile-thread-action mobile-thread-action--danger"
                          onClick={() => { void deleteChat(); }}
                          disabled={deleting || loading}
                        >
                          <Trash2 size={13} strokeWidth={2} />
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                  {isMobileView ? (
                  <div className="mobile-composer thread-composer">
                    <div className="mobile-composer-input-row">
                      {!input.trim() && (
                        <span className="mobile-composer-prompt-label">
                          Chat with {CHAT_AGENT.name}
                        </span>
                      )}
                      <input
                        className="chat-input-field mobile-composer-field"
                        placeholder=""
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKey}
                      />
                    </div>
                    <div className="mobile-composer-tools mobile-composer-tools--minimal">
                      <div className="composer-toolbar-start">
                        {attachControl}
                        {examplesControl}
                      </div>
                      <ModeSelector current="chat" embedded menuPlacement="top" />
                      <div className="mobile-composer-actions">
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
                        <button type="button" className="chat-send-btn send-btn" onClick={() => sendWithVoice()} disabled={!canSend}>
                          {loading
                            ? <Loader2 size={14} className="spin" />
                            : <ArrowUp size={14} strokeWidth={2.5} />}
                        </button>
                      </div>
                    </div>
                  </div>
                  ) : (
                  <>
                  <div className="chat-input-bar">
                    <input
                      className="chat-input-field"
                      placeholder="Ask a follow-up question..."
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={handleKey}
                    />
                    <div className="composer-toolbar">
                      <div className="composer-toolbar-start">
                        {attachControl}
                        {examplesControl}
                      </div>
                      <div className="composer-toolbar-end">
                        <ModeSelector current="chat" embedded menuPlacement="top" />
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
                    </div>
                  </div>
                  {voice.voiceError && (
                    <VoiceErrorBanner message={voice.voiceError} onDismiss={voice.clearError} />
                  )}
                  </>
                  )}
                  {fileError && isMobileView && (
                    <p style={{ fontSize: 11, color: "var(--rh)", marginTop: 8, fontFamily: "'Sora', sans-serif" }}>{fileError}</p>
                  )}
                  {isMobileView && voice.voiceError && (
                    <VoiceErrorBanner message={voice.voiceError} onDismiss={voice.clearError} />
                  )}
                  </div>
                </div>
              </div>
            </>
          )}

          </div>
        </AppShell>
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
    </>
  );
}
