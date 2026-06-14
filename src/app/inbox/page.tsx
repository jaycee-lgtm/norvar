"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { EscalationInboxMessage } from "@/lib/escalation";
import type { InboxFolder, InboxFolderCounts, InboxListItem } from "@/lib/inbox";
import { INBOX_FOLDERS } from "@/lib/inbox";
import { normalizeGapSeverity } from "@/lib/risk-tiers";
import {
  Inbox, ArrowLeft, Loader2, Send, ExternalLink, Mail,
  Archive, Trash2, RotateCcw, Inbox as InboxIcon,
} from "lucide-react";

type FolderCounts = InboxFolderCounts;

type ThreadDetail = {
  remediation_id:      string;
  gap_title:           string;
  gap_severity:        string;
  project_title:       string | null;
  recipient_name:      string | null;
  recipient_email:     string | null;
  escalation_question: string | null;
  escalation_note:     string | null;
  folder:              InboxFolder;
  counts:              FolderCounts;
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

function parseFolder(value: string | null): InboxFolder {
  if (value === "sent" || value === "archived" || value === "trash") return value;
  return "received";
}

function InboxContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const isMobile     = useIsMobile();
  const threadId     = searchParams.get("thread");
  const folder       = parseFolder(searchParams.get("folder"));

  const [items, setItems]             = useState<InboxListItem[]>([]);
  const [counts, setCounts]           = useState<FolderCounts>({
    received: 0, sent: 0, archived: 0, trash: 0, unread_received: 0,
  });
  const [thread, setThread]           = useState<ThreadDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [actionBusy, setActionBusy]   = useState<string | null>(null);
  const [reply, setReply]             = useState("");
  const [sending, setSending]         = useState(false);
  const [error, setError]             = useState("");

  const loadList = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingList(true);
    try {
      const res  = await fetch(`/api/escalation-inbox?folder=${folder}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load inbox");
      setItems(data.items ?? []);
      if (data.counts) setCounts(data.counts);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load inbox");
    } finally {
      if (!opts?.silent) setLoadingList(false);
    }
  }, [folder]);

  const loadThread = useCallback(async (id: string, activeFolder: InboxFolder) => {
    setLoadingThread(true);
    setError("");
    try {
      const res  = await fetch(`/api/escalation-inbox?thread=${id}&folder=${activeFolder}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load thread");
      setThread(data.thread ?? null);
      if (data.counts) setCounts(data.counts);
      await loadList({ silent: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not load thread");
      setThread(null);
    } finally {
      setLoadingThread(false);
    }
  }, [loadList]);

  useEffect(() => { void loadList(); }, [loadList]);

  useEffect(() => {
    if (threadId) void loadThread(threadId, folder);
    else setThread(null);
  }, [threadId, folder, loadThread]);

  const setFolder = (next: InboxFolder) => {
    const params = new URLSearchParams();
    params.set("folder", next);
    if (threadId) params.set("thread", threadId);
    router.push(`/inbox?${params.toString()}`);
  };

  const selectThread = (id: string) => {
    router.push(`/inbox?folder=${folder}&thread=${id}`);
  };

  const patchMessage = async (messageId: string, action: string) => {
    if (action === "delete" && !window.confirm("Move this message to the recycle bin?")) return;
    if (action === "purge" && !window.confirm("Permanently delete this message? This cannot be undone.")) return;

    setActionBusy(messageId);
    setError("");
    try {
      const res  = await fetch("/api/escalation-inbox", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ message_id: messageId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update message");
      await loadList();
      if (threadId) await loadThread(threadId, folder);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not update message");
    } finally {
      setActionBusy(null);
    }
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
      await Promise.all([loadThread(threadId, folder), loadList()]);

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
  const canCompose = folder === "received" || folder === "sent";

  const emptyCopy: Record<InboxFolder, { title: string; sub: string }> = {
    received: { title: "No received messages", sub: "Replies to escalations appear here." },
    sent:     { title: "No sent messages", sub: "Messages you send from Norvar appear here." },
    archived: { title: "No archived messages", sub: "Archive messages to keep threads tidy." },
    trash:    { title: "Recycle bin is empty", sub: "Deleted messages stay here for 90 days." },
  };

  return (
    <main className={`main-area inbox-page${isMobile ? " inbox-page--mobile" : ""}`}>
      <div className="inbox-layout">
        {showList && (
          <aside className="inbox-list-pane">
            <div className="inbox-list-head">
              <Inbox size={14} color="var(--fg3)" />
              <h1 className="inbox-list-title">Escalation inbox</h1>
            </div>

            <nav className="inbox-folder-nav" aria-label="Inbox folders">
              {INBOX_FOLDERS.map(f => (
                <button
                  key={f.id}
                  type="button"
                  className={`inbox-folder-tab${folder === f.id ? " active" : ""}`}
                  onClick={() => setFolder(f.id)}
                >
                  <span>{f.label}</span>
                  {f.id === "received" && counts.unread_received > 0 ? (
                    <span className="inbox-folder-count inbox-folder-count--unread">
                      {counts.unread_received}
                    </span>
                  ) : counts[f.id] > 0 ? (
                    <span className="inbox-folder-count">{counts[f.id]}</span>
                  ) : null}
                </button>
              ))}
            </nav>

            {folder === "trash" && (
              <p className="inbox-trash-note">Deleted messages are kept for 90 days, then removed permanently.</p>
            )}

            {loadingList && (
              <div className="inbox-empty">
                <Loader2 size={16} className="spin" />
              </div>
            )}

            {!loadingList && items.length === 0 && (
              <div className="inbox-empty">
                <Mail size={22} color="var(--fg4)" />
                <p>{emptyCopy[folder].title}</p>
                <p className="inbox-empty-sub">{emptyCopy[folder].sub}</p>
              </div>
            )}

            <ul className="inbox-thread-list">
              {items.map(item => {
                const sev = normalizeGapSeverity(item.gap_severity);
                const active = item.remediation_id === threadId;

                return (
                  <li key={item.message_id}>
                    <button
                      type="button"
                      className={`inbox-thread-row${active ? " active" : ""}${item.is_read ? "" : " unread"}`}
                      onClick={() => selectThread(item.remediation_id)}
                    >
                      <div className="inbox-thread-row-top">
                        {!item.is_read && item.direction === "inbound" && (
                          <span className="inbox-unread-dot" aria-hidden />
                        )}
                        <span className="inbox-thread-recipient">
                          {item.direction === "inbound"
                            ? (item.from_name ?? item.from_email)
                            : (item.recipient_name ?? item.recipient_email)}
                        </span>
                        <span className="inbox-thread-date">{fmtDate(item.created_at)}</span>
                      </div>
                      <div className="inbox-thread-gap" style={{ color: SEV_COLORS[sev] }}>
                        {item.gap_title}
                      </div>
                      <div className="inbox-thread-meta">
                        {item.body_preview}
                        {item.project_title && <> · {item.project_title}</>}
                      </div>
                      {folder === "trash" && item.days_until_purge !== null && (
                        <div className="inbox-purge-hint">
                          Permanently removed in {item.days_until_purge} day{item.days_until_purge === 1 ? "" : "s"}
                        </div>
                      )}
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
                <InboxIcon size={28} color="var(--fg4)" />
                <p>Select a message to read and manage</p>
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
                    <button
                      type="button"
                      className="inbox-back-btn"
                      onClick={() => router.push(`/inbox?folder=${folder}`)}
                    >
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
                    <p className="inbox-messages-empty">No messages in this folder for this thread.</p>
                  )}
                  {thread.messages.map(msg => (
                    <div
                      key={msg.id}
                      className={`inbox-message${msg.direction === "outbound" ? " outbound" : " inbound"}${msg.is_read === false ? " unread" : ""}`}
                    >
                      <div className="inbox-message-head">
                        <div className="inbox-message-meta">
                          {msg.is_read === false && msg.direction === "inbound" && (
                            <span className="inbox-unread-dot" aria-hidden />
                          )}
                          <span className="inbox-message-from">
                            {msg.direction === "outbound"
                              ? (msg.from_name ?? "You")
                              : (msg.from_name ?? msg.from_email)}
                          </span>
                          <span className="inbox-message-date">{fmtDate(msg.created_at)}</span>
                        </div>
                        <div className="inbox-message-actions">
                          {folder === "trash" && (
                            <>
                              <button
                                type="button"
                                className="inbox-msg-action"
                                disabled={actionBusy === msg.id}
                                title="Restore"
                                onClick={() => void patchMessage(msg.id, "restore")}
                              >
                                <RotateCcw size={11} />
                              </button>
                              <button
                                type="button"
                                className="inbox-msg-action danger"
                                disabled={actionBusy === msg.id}
                                title="Delete permanently"
                                onClick={() => void patchMessage(msg.id, "purge")}
                              >
                                <Trash2 size={11} />
                              </button>
                            </>
                          )}
                          {folder === "archived" && (
                            <>
                              <button
                                type="button"
                                className="inbox-msg-action"
                                disabled={actionBusy === msg.id}
                                title="Move back to inbox"
                                onClick={() => void patchMessage(msg.id, "unarchive")}
                              >
                                <InboxIcon size={11} />
                              </button>
                              <button
                                type="button"
                                className="inbox-msg-action danger"
                                disabled={actionBusy === msg.id}
                                title="Delete"
                                onClick={() => void patchMessage(msg.id, "delete")}
                              >
                                <Trash2 size={11} />
                              </button>
                            </>
                          )}
                          {(folder === "received" || folder === "sent") && (
                            <>
                              <button
                                type="button"
                                className="inbox-msg-action"
                                disabled={actionBusy === msg.id}
                                title="Archive"
                                onClick={() => void patchMessage(msg.id, "archive")}
                              >
                                <Archive size={11} />
                              </button>
                              <button
                                type="button"
                                className="inbox-msg-action danger"
                                disabled={actionBusy === msg.id}
                                title="Delete"
                                onClick={() => void patchMessage(msg.id, "delete")}
                              >
                                <Trash2 size={11} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      {msg.direction === "inbound" && msg.from_name && (
                        <div className="inbox-message-email">{msg.from_email}</div>
                      )}
                      {msg.direction === "outbound" && msg.to_email && (
                        <div className="inbox-message-email">To {msg.to_email}</div>
                      )}
                      {msg.deleted_at && folder === "trash" && (
                        <div className="inbox-purge-hint">
                          Permanently removed in {Math.max(0, Math.ceil((new Date(msg.deleted_at).getTime() + 90 * 86_400_000 - Date.now()) / 86_400_000))} days
                        </div>
                      )}
                      <p className="inbox-message-body">{msg.body}</p>
                    </div>
                  ))}
                </div>

                {canCompose && (
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
                )}
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
