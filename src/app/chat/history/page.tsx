"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { MessageSquare, Plus, ChevronRight, Trash2 } from "lucide-react";

type ConversationItem = {
  id:         string;
  title:      string;
  updated_at: string;
  created_at: string;
};

export default function ChatHistoryPage() {
  const [items, setItems]       = useState<ConversationItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    fetch("/api/conversations?limit=50")
      .then(r => r.json())
      .then(d => { setItems(d.conversations || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const deleteItem = async (id: string, title: string) => {
    if (!confirm(`Delete "${title || "Untitled conversation"}"?`)) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/conversations", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Could not delete chat");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppShell>
      <div className="main-area" style={{ overflowY: "auto" }}>
        <div className="page-body chat-history-page" style={{ margin: "0 auto" }}>

          <div className="page-heading-row" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, gap: 12, flexWrap: "wrap" }}>
            <div>
              <p className="stag" style={{ marginBottom: 8 }}>Chat history</p>
              <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-.04em", fontFamily: "'Sora', sans-serif" }}>
                Your chats
              </h1>
            </div>
            <Link href="/chat" className="btn-primary" style={{ fontSize: 12, padding: "8px 14px", gap: 6 }}>
              <Plus size={13} strokeWidth={2} />
              New chat
            </Link>
          </div>

          {loading && (
            <div style={{ display: "flex", gap: 5, justifyContent: "center", padding: "60px 0" }}>
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "60px 24px" }}>
              <MessageSquare size={32} strokeWidth={1.25} color="var(--fg4)" style={{ margin: "0 auto 14px" }} />
              <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: "var(--fg)", fontFamily: "'Sora', sans-serif" }}>
                No conversations yet
              </p>
              <p style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 24, fontFamily: "'Sora', sans-serif" }}>
                Start a chat to ask about regulations, compliance requirements, or audit preparation.
              </p>
              <Link href="/chat" className="btn-primary" style={{ gap: 6 }}>
                Start a chat
                <ChevronRight size={14} strokeWidth={2} />
              </Link>
            </div>
          )}

          <div className="chat-history-list">
            {items.map(item => {
              const title = item.title || "Untitled conversation";
              const dateLabel = new Date(item.updated_at || item.created_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
                hour: "2-digit", minute: "2-digit",
              });
              return (
                <div key={item.id} className="chat-history-row">
                  <Link href={`/chat?id=${item.id}`} className="chat-history-link">
                    <MessageSquare size={14} strokeWidth={1.75} className="chat-history-icon" />
                    <span className="chat-history-title">{title}</span>
                    <span className="chat-history-date">{dateLabel}</span>
                    <ChevronRight size={13} strokeWidth={1.75} className="chat-history-chevron" />
                  </Link>

                  <button
                    type="button"
                    className="chat-history-delete"
                    aria-label={`Delete ${title}`}
                    disabled={deletingId === item.id}
                    onClick={() => deleteItem(item.id, title)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </AppShell>
  );
}
