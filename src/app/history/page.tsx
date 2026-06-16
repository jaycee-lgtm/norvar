"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { normalizeRiskTier } from "@/lib/risk-tiers";
import { AlertTriangle, Tag, Clock, Plus, FileSearch, ChevronRight, Trash2 } from "lucide-react";

type HistoryItem = {
  id:                string;
  description:       string;
  title?:            string;
  assessment_number?: string | null;
  risk_tier:         string;
  created_at:        string;
  domains?:          string[];
};

function tierColors(tier: string) {
  const t = normalizeRiskTier(tier);
  if (t === "high")   return { num: "var(--rh)", bg: "var(--rh-bg)", bdr: "var(--rh-bdr)" };
  if (t === "medium") return { num: "var(--rm)", bg: "var(--rm-bg)", bdr: "var(--rm-bdr)" };
  return { num: "var(--rl)", bg: "var(--rl-bg)", bdr: "var(--rl-bdr)" };
}

function tierLabel(tier: string) {
  const t = normalizeRiskTier(tier);
  if (t === "high") return "H";
  if (t === "medium") return "M";
  return "L";
}

export default function HistoryPage() {
  const [items,      setItems]      = useState<HistoryItem[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = () => {
    fetch("/api/assessments")
      .then(r => r.json())
      .then(d => { setItems(d.assessments || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const tierCounts = {
    high:   items.filter(i => normalizeRiskTier(i.risk_tier) === "high").length,
    medium: items.filter(i => normalizeRiskTier(i.risk_tier) === "medium").length,
    low:    items.filter(i => normalizeRiskTier(i.risk_tier) === "low").length,
  };

  const deleteItem = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This also removes linked remediation items.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/assessments", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Could not delete assessment");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <AppShell>
      <div className="main-area" style={{ overflowY: "auto" }}>
        <div className="page-body" style={{ margin: "0 auto" }}>

          <div className="page-heading-row" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 28, gap: 12, flexWrap: "wrap" }}>
            <div>
              <p className="stag" style={{ marginBottom: 6 }}>Assessment history</p>
              <div className="history-page-title-line">
                <h1 className="history-page-title">Your assessments</h1>
                {!loading && items.length > 0 && (
                  <span className="history-page-count">
                    {items.length} assessment{items.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            </div>
            <Link href="/assess" className="btn-primary" style={{ fontSize: 12, padding: "8px 14px", gap: 6 }}>
              <Plus size={13} strokeWidth={2} />
              New assessment
            </Link>
          </div>

          {!loading && items.length > 0 && (
            <div className="history-stats-bar">
              {[
                { label: "High risk",   value: tierCounts.high,   color: "var(--rh)" },
                { label: "Medium risk", value: tierCounts.medium, color: "var(--rm)" },
                { label: "Low risk",    value: tierCounts.low,    color: "var(--rl)" },
              ].map(({ label, value, color }) => (
                <div key={label} className="history-stat">
                  <span className="history-stat-value" style={{ color }}>{value}</span>
                  {label}
                </div>
              ))}
            </div>
          )}

          {loading && (
            <div style={{ display: "flex", gap: 5, justifyContent: "center", padding: "60px 0" }}>
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </div>
          )}

          {!loading && items.length === 0 && (
            <div className="card" style={{ textAlign: "center", padding: "60px 24px" }}>
              <FileSearch size={32} strokeWidth={1.25} color="var(--fg4)" style={{ margin: "0 auto 14px" }} />
              <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: "var(--fg)", fontFamily: "'Sora', sans-serif" }}>
                No assessments yet
              </p>
              <p style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 24, fontFamily: "'Sora', sans-serif" }}>
                Run your first assessment to see your compliance history here.
              </p>
              <Link href="/assess" className="btn-primary" style={{ gap: 6 }}>
                Run first assessment
                <ChevronRight size={14} strokeWidth={2} />
              </Link>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map(item => {
              const c = tierColors(item.risk_tier);
              const title = item.title || item.description;
              return (
                <div key={item.id} className="history-item-row">
                  <Link href={`/assess?id=${item.id}`} className="history-item">
                    <div className="history-tier-badge" style={{ background: c.bg, border: `0.5px solid ${c.bdr}`, color: c.num }}>
                      {tierLabel(item.risk_tier)}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5, flexWrap: "wrap" }}>
                        <span className="history-item-number">{item.assessment_number ?? "—"}</span>
                        <span style={{
                          display: "inline-flex", alignItems: "center", gap: 4,
                          fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 4,
                          background: c.bg, color: c.num, border: `0.5px solid ${c.bdr}`,
                          fontFamily: "'Sora', sans-serif",
                        }}>
                          <AlertTriangle size={10} strokeWidth={2.5} />
                          {normalizeRiskTier(item.risk_tier)} risk
                        </span>
                        {item.domains?.slice(0, 3).map(d => (
                          <span key={d} style={{
                            display: "inline-flex", alignItems: "center", gap: 3,
                            fontSize: 10, color: "var(--fg3)", background: "var(--card2)",
                            padding: "1px 7px", borderRadius: 4, border: "0.5px solid var(--bdr)",
                            fontFamily: "'Sora', sans-serif",
                          }}>
                            <Tag size={9} strokeWidth={2} />
                            {d}
                          </span>
                        ))}
                      </div>

                      <p style={{
                        fontSize: 13, color: "var(--fg)", overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                        fontFamily: "'Sora', sans-serif", letterSpacing: "-0.01em",
                        marginBottom: 4,
                      }}>
                        {title}
                      </p>

                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <Clock size={10} strokeWidth={2} color="var(--fg4)" />
                        <span style={{ fontSize: 11, color: "var(--fg4)", fontFamily: "'Sora', sans-serif" }}>
                          {new Date(item.created_at).toLocaleDateString("en-US", {
                            month: "short", day: "numeric", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>

                    <ChevronRight size={14} strokeWidth={1.75} color="var(--fg3)" />
                  </Link>

                  <button
                    type="button"
                    className="history-item-delete"
                    aria-label={`Delete ${title}`}
                    disabled={deletingId === item.id}
                    onClick={() => deleteItem(item.id, title)}
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
