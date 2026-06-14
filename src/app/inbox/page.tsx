"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { EscalationInboxMessage } from "@/lib/escalation";
import { normalizeGapSeverity } from "@/lib/risk-tiers";
import {
  Inbox, ArrowLeft, Loader2, Send, ExternalLink, Mail,
} from "lucide-react";

type ThreadSummary = {
  remediation_id:    string;
  gap_title:         string;
  gap_severity:      string;
  gap_domain:        string;
  project_title:     string | null;
  assessment_number: string | null;
  recipient_name:    string | null;
  recipient_email:   string | null;
  escalation_status: string | null;
  escalated_at:      string | null;
  last_message_at:   string | null;
  message_count:     number;
  inbound_count:     number;
  has_unread:        boolean;
};

type ThreadDetail = ThreadSummary & {
  escalation_question: string | null;
  escalation_note:     string | null;
  messages:            EscalationInboxMessage[];
};

const SEV_COLORS: Record<string, string> = {
  high:   "var(--rh)",
  medium: "var(--rm)",
  low:    "var(--fg3)",
};

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function InboxContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const isMobile     = useIsMobile();
  const threadId     = searchParams.get("thread");

  const [threads, setThreads]         = useState<ThreadSummary[]>([]);
  const [thread, setThread]           = useState<ThreadDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply]             = useState("");
  const [sending, setSending]         = useState(false);
  const [error, setError]             = useState("");

  const loadThreads = useCallback(async () => {
    setLoadingList(true);
    try {
      const res  = await fetch("/api/escalation-inbox");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load inbox");
      setThreads(data.threads ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load inbox");
    } finally {
      setLoadingList(false);
    }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    setLoadingThread(true);
    setError("");
    try {
      const res  = await fetch(`/api/escalation-inbox?thread=${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load thread");
      setThread(data.thread ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load thread");
      setThread(null);
    } finally {
      setLoadingThread(false);
    }
  }, []);

  useEffect(() => { void loadThreads(); }, [loadThreads]);

  useEffect(() => {
    if (threadId) void loadThread(threadId);
    else setThread(null);
  }, [threadId, loadThread]);

  const selectThread = (id: string) => {
    router.push(`/inbox?thread=${id}`);
  };

  const sendReply = async () => {
    if (!threadId || !reply.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const res  = await fetch("/api/escalation-inbox", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ remediation_id: threadId, message: reply.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send reply");

      setReply("");
      await Promise.all([loadThread(threadId), loadThreads()]);

      if (data.email_sent === false && data.email_error) {
        setError(`Saved in Norvar, but email failed: ${data.email_error}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not send reply");
    } finally {
      setSending(false);
    }
  };

  const showList  = !isMobile || !threadId;
  const showPanel = !isMobile || threadId;

  return (
    <main className={`main-area inbox-page${isMobile ? " inbox-page--mobile" : ""}`}>
      <div className="inbox-layout">
        {showList && (
          <aside className="inbox-list-pane">
            <div className="inbox-list-head">
              <Inbox size={14} color="var(--fg3)" />
              <h1 className="inbox-list-title">Escalation inbox</h1>
            </div>

            {loadingList && (
              <div className="inbox-empty">
                <Loader2 size={16} className="spin" />
              </div>
            )}

            {!loadingList && threads.length === 0 && (
              <div className="inbox-empty">
                <Mail size={22} color="var(--fg4)" />
                <p>No escalation threads yet</p>
                <p className="inbox-empty-sub">Email responses appear here when recipients reply to escalations.</p>
              </div>
            )}

            <ul className="inbox-thread-list">
              {threads.map(t => {
                const sev = normalizeGapSeverity(t.gap_severity);
                const active = t.remediation_id === threadId;
                const previewSource = t.inbound_count > 0 ? "response" : "escalation";

                return (
                  <li key={t.remediation_id}>
                    <button
                      type="button"
                      className={`inbox-thread-row${active ? " active" : ""}${t.has_unread ? " unread" : ""}`}
                      onClick={() => selectThread(t.remediation_id)}
                    >
                      <div className="inbox-thread-row-top">
                        <span className="inbox-thread-recipient">
                          {t.recipient_name ?? t.recipient_email}
                        </span>
                        <span className="inbox-thread-date">{fmtDate(t.last_message_at)}</span>
                      </div>
                      <div className="inbox-thread-gap" style={{ color: SEV_COLORS[sev] }}>
                        {t.gap_title}
                      </div>
                      <div className="inbox-thread-meta">
                        {t.message_count > 0
                          ? `${t.message_count} message${t.message_count === 1 ? "" : "s"}`
                          : previewSource === "escalation" ? "Awaiting response" : ""}
                        {t.project_title && <> · {t.project_title}</>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
        )}

        {showPanel && (
          <section className="inbox-thread-pane">
            {!threadId && (
              <div className="inbox-thread-placeholder">
                <Inbox size={28} color="var(--fg4)" />
                <p>Select a thread to read and reply</p>
              </div>
            )}

            {threadId && loadingThread && (
              <div className="inbox-thread-placeholder">
                <Loader2 size={20} className="spin" />
              </div>
            )}

            {threadId && !loadingThread && thread && (
              <>
                <div className="inbox-thread-head">
                  {isMobile && (
                    <button type="button" className="inbox-back-btn" onClick={() => router.push("/inbox")}>
                      <ArrowLeft size={14} />
                    </button>
                  )}
                  <div className="inbox-thread-head-main">
                    <h2 className="inbox-thread-title">{thread.gap_title}</h2>
                    <p className="inbox-thread-sub">
                      To {thread.recipient_name ?? thread.recipient_email}
                      {thread.recipient_email && thread.recipient_name && (
                        <> · {thread.recipient_email}</>
                      )}
                      {thread.project_title && <> · {thread.project_title}</>}
                    </p>
                  </div>
                  <Link href="/remediation" className="inbox-open-gap">
                    <ExternalLink size={11} />
                    View gap
                  </Link>
                </div>

                {(thread.escalation_question || thread.escalation_note) && (
                  <div className="inbox-thread-context">
                    {thread.escalation_question && (
                      <p><strong>Question:</strong> {thread.escalation_question}</p>
                    )}
                    {thread.escalation_note && (
                      <p><strong>Context:</strong> {thread.escalation_note}</p>
                    )}
                  </div>
                )}

                <div className="inbox-messages">
                  {thread.messages.length === 0 && (
                    <p className="inbox-messages-empty">No messages yet. Send a reply below or wait for the recipient to respond by email.</p>
                  )}
                  {thread.messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`inbox-message${msg.direction === "outbound" ? " outbound" : " inbound"}`}
                    >
                      <div className="inbox-message-meta">
                        <span className="inbox-message-from">
                          {msg.direction === "outbound"
                            ? (msg.from_name ?? "You")
                            : (msg.from_name ?? msg.from_email)}
                        </span>
                        <span className="inbox-message-date">{fmtDate(msg.created_at)}</span>
                      </div>
                      {msg.direction === "inbound" && msg.from_name && (
                        <div className="inbox-message-email">{msg.from_email}</div>
                      )}
                      {msg.direction === "outbound" && msg.to_email && (
                        <div className="inbox-message-email">To {msg.to_email}</div>
                      )}
                      <p className="inbox-message-body">{msg.body}</p>
                    </div>
                  ))}
                </div>

                <div className="inbox-compose">
                  <textarea
                    className="inbox-compose-input"
                    placeholder={`Reply to ${thread.recipient_name ?? thread.recipient_email}…`}
                    value={reply}
                    rows={4}
                    disabled={sending}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        void sendReply();
                      }
                    }}
                  />
                  <div className="inbox-compose-actions">
                    <span className="inbox-compose-hint">⌘/Ctrl + Enter to send</span>
                    <button
                      type="button"
                      className="inbox-compose-send"
                      disabled={sending || !reply.trim()}
                      onClick={() => void sendReply()}
                    >
                      {sending ? <Loader2 size={12} className="spin" /> : <Send size={12} />}
                      Send reply
                    </button>
                  </div>
                </div>
              </>
            )}

            {error && <p className="inbox-error">{error}</p>}
          </section>
        )}
      </div>
    </main>
  );
}

export default function InboxPage() {
  return (
    <AppShell>
      <Suspense fallback={
        <main className="main-area inbox-page">
          <div className="inbox-thread-placeholder">
            <Loader2 size={20} className="spin" />
          </div>
        </main>
      }>
        <InboxContent />
      </Suspense>
    </AppShell>
  );
}
