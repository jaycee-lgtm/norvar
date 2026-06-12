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
        <div className="page-body" style={{ maxWidth: 720, margin: "0 auto" }}>

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

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map(item => {
              const title = item.title || "Untitled conversation";
              return (
                <div
                  key={item.id}
                  className="history-item"
                  style={{ display: "flex", alignItems: "center", gap: 14 }}
                >
                  <Link
                    href={`/chat?id=${item.id}`}
                    style={{
                      display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0,
                      background: "var(--card)", border: "0.5px solid var(--bdr)",
                      borderRadius: 8, padding: "14px 16px", textDecoration: "none",
                      transition: "border-color 0.15s", color: "inherit",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--bdr2)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--bdr)"; }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 7, background: "var(--card2)",
                      border: "0.5px solid var(--bdr)", display: "flex", alignItems: "center",
                      justifyContent: "center", flexShrink: 0,
                    }}>
                      <MessageSquare size={15} strokeWidth={1.75} color="var(--fg3)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 13, color: "var(--fg)", fontFamily: "'Sora', sans-serif",
                        letterSpacing: "-.01em", marginBottom: 4,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {title}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--fg4)", fontFamily: "'Sora', sans-serif" }}>
                        {new Date(item.updated_at || item.created_at).toLocaleDateString("en-US", {
                          month: "short", day: "numeric", year: "numeric",
                          hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <ChevronRight size={14} strokeWidth={1.75} color="var(--fg3)" />
                  </Link>

                  <button
                    type="button"
                    aria-label={`Delete ${title}`}
                    disabled={deletingId === item.id}
                    onClick={() => deleteItem(item.id, title)}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "center",
                      width: 32, height: 32, borderRadius: 6, flexShrink: 0,
                      border: "0.5px solid var(--bdr2)", background: "transparent",
                      color: "var(--fg3)", cursor: deletingId === item.id ? "not-allowed" : "pointer",
                    }}
                  >
                    <Trash2 size={14} />
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
