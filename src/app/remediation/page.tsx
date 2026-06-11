"use client";

import { useState, useEffect } from "react";
import Sidebar from "@/components/Sidebar";
import {
  ShieldAlert, ChevronDown, User, Calendar, AlertTriangle,
  CheckCircle, ArrowUpRight, Clock, X,
} from "lucide-react";

interface Activity {
  id:         string;
  user_id:    string;
  action:     string;
  detail:     string | null;
  created_at: string;
}

interface RemediationItem {
  id:                   string;
  assessment_id:        string;
  assessment_number:    string | null;
  gap_title:            string;
  gap_severity:         "critical" | "high" | "medium" | "low";
  gap_domain:           string;
  gap_detail:           string | null;
  gap_frameworks:       string[];
  remediation_steps:    string | null;
  assigned_to:          string[];
  created_by:           string;
  status:               "open" | "in_progress" | "escalated" | "resolved" | "wont_fix";
  escalated_to:         "compliance" | "legal" | null;
  escalation_note:      string | null;
  due_date:             string | null;
  resolved_at:          string | null;
  resolution_note:      string | null;
  created_at:           string;
  remediation_activity: Activity[];
}

function fmt_date(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function is_overdue(due: string | null) {
  if (!due) return false;
  return new Date(due) < new Date();
}

const SEV_STYLES: Record<string, { bg: string; color: string; bdr: string }> = {
  critical: { bg: "var(--rh-bg)", color: "var(--rh)", bdr: "var(--rh-bdr)" },
  high:     { bg: "var(--rm-bg)", color: "var(--rm)", bdr: "var(--rm-bdr)" },
  medium:   { bg: "rgba(59,109,17,.09)", color: "var(--rl)", bdr: "rgba(59,109,17,.2)" },
  low:      { bg: "var(--card2)", color: "var(--fg3)", bdr: "var(--bdr2)" },
};

const STATUS_LABELS: Record<string, string> = {
  open:        "Open",
  in_progress: "In progress",
  escalated:   "Escalated",
  resolved:    "Resolved",
  wont_fix:    "Won't fix",
};

const DOMAIN_LABELS: Record<string, string> = {
  privacy:       "Privacy",
  ai_governance: "AI Governance",
  cybersecurity: "Cybersecurity",
};

const STATUS_FILTERS = [
  { value: "",            label: "All" },
  { value: "open",        label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "escalated",   label: "Escalated" },
  { value: "resolved",    label: "Resolved" },
];

const SEV_FILTERS = [
  { value: "",         label: "All severities" },
  { value: "critical", label: "Critical" },
  { value: "high",     label: "High" },
  { value: "medium",   label: "Medium" },
  { value: "low",      label: "Low" },
];

function SevBadge({ sev }: { sev: string }) {
  const s = SEV_STYLES[sev] ?? SEV_STYLES.low;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
      background: s.bg, color: s.color, border: `0.5px solid ${s.bdr}`,
      textTransform: "uppercase", letterSpacing: "0.5px",
    }}>
      {sev}
    </span>
  );
}

function EscalateModal({ item, onClose, onDone }: {
  item:    RemediationItem;
  onClose: () => void;
  onDone:  () => void;
}) {
  const [target, setTarget] = useState<"compliance" | "legal">("compliance");
  const [note, setNote]     = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    await fetch("/api/remediation", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id: item.id, escalated_to: target, escalation_note: note }),
    });
    setSaving(false);
    onDone();
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }}>
      <div style={{
        background: "var(--card)", border: "0.5px solid var(--bdr2)",
        borderRadius: 12, padding: "24px 28px", width: 400,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)" }}>Escalate gap</span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg3)" }}>
            <X size={15} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 16 }}>{item.gap_title}</p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 6 }}>
            Escalate to
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            {(["compliance", "legal"] as const).map(t => (
              <button key={t} type="button" onClick={() => setTarget(t)} style={{
                flex: 1, padding: "7px 0", borderRadius: 6, fontSize: 12, fontWeight: 500,
                border: `0.5px solid ${target === t ? "var(--bdr3)" : "var(--bdr2)"}`,
                background: target === t ? "var(--lift)" : "transparent",
                color: target === t ? "var(--fg)" : "var(--fg3)",
                cursor: "pointer", fontFamily: "'Sora', sans-serif",
                textTransform: "capitalize",
              }}>{t}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
            Note (optional)
          </label>
          <textarea
            value={note} onChange={e => setNote(e.target.value)}
            placeholder="Context for the reviewer..."
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 6,
              border: "0.5px solid var(--bdr2)", background: "var(--card2)",
              color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif",
              resize: "vertical", minHeight: 72,
            }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{
            padding: "7px 16px", borderRadius: 6, border: "0.5px solid var(--bdr2)",
            background: "transparent", color: "var(--fg2)", fontSize: 12, cursor: "pointer",
          }}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving} style={{
            padding: "7px 16px", borderRadius: 6, border: "none",
            background: "var(--fg)", color: "var(--bg)",
            fontSize: 12, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer",
          }}>
            {saving ? "Escalating..." : "Escalate"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item, onUpdate }: {
  item:     RemediationItem;
  onUpdate: () => void;
}) {
  const [expanded, setExpanded]     = useState(false);
  const [escalating, setEscalating] = useState(false);
  const overdue = is_overdue(item.due_date) && item.status !== "resolved";

  const updateStatus = async (status: string) => {
    await fetch("/api/remediation", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id: item.id, status }),
    });
    onUpdate();
  };

  return (
    <>
      <div style={{
        background: "var(--card)", border: "0.5px solid var(--bdr2)",
        borderRadius: 8, overflow: "hidden",
      }}>
        <div
          style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10 }}
          onClick={() => setExpanded(!expanded)}
        >
          <SevBadge sev={item.gap_severity} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", marginBottom: 3 }}>
              {item.gap_title}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {item.assessment_number && (
                <span style={{ fontSize: 10, color: "var(--fg3)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {item.assessment_number}
                </span>
              )}
              <span style={{ fontSize: 10, color: "var(--fg3)" }}>
                {DOMAIN_LABELS[item.gap_domain] ?? item.gap_domain}
              </span>
              {item.gap_frameworks.length > 0 && (
                <span style={{ fontSize: 10, color: "var(--fg3)" }}>
                  {item.gap_frameworks.slice(0, 2).join(", ")}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
            <span style={{
              fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 4,
              background: item.status === "resolved" ? "var(--rl-bg)" :
                          item.status === "escalated" ? "var(--rm-bg)" : "var(--card2)",
              color: item.status === "resolved" ? "var(--rl)" :
                     item.status === "escalated" ? "var(--rm)" : "var(--fg3)",
              border: `0.5px solid ${item.status === "resolved" ? "var(--rl-bdr)" :
                       item.status === "escalated" ? "var(--rm-bdr)" : "var(--bdr2)"}`,
            }}>
              {STATUS_LABELS[item.status]}
            </span>
            {item.due_date && (
              <span style={{ fontSize: 10, color: overdue ? "var(--rh)" : "var(--fg3)", display: "flex", alignItems: "center", gap: 3 }}>
                {overdue && <AlertTriangle size={9} />}
                <Calendar size={9} />
                {fmt_date(item.due_date)}
              </span>
            )}
          </div>

          <ChevronDown size={13} color="var(--fg3)"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s", flexShrink: 0, marginTop: 2 }} />
        </div>

        {expanded && (
          <div style={{ padding: "0 16px 16px", borderTop: "0.5px solid var(--bdr)" }}>
            {item.gap_detail && (
              <p style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.55, marginTop: 12, marginBottom: 10 }}>
                {item.gap_detail}
              </p>
            )}

            {item.remediation_steps && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                  Remediation steps
                </div>
                <p style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.55, padding: "8px 10px", background: "var(--card2)", borderRadius: 6, border: "0.5px solid var(--bdr)" }}>
                  {item.remediation_steps}
                </p>
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                Assigned to ({item.assigned_to.length})
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {item.assigned_to.map(uid => (
                  <span key={uid} style={{
                    display: "flex", alignItems: "center", gap: 4,
                    fontSize: 11, padding: "3px 8px", borderRadius: 20,
                    background: "var(--card2)", color: "var(--fg2)", border: "0.5px solid var(--bdr2)",
                  }}>
                    <User size={9} />{uid.slice(0, 8)}...
                  </span>
                ))}
              </div>
            </div>

            {item.escalated_to && (
              <div style={{ marginBottom: 12, padding: "8px 10px", background: "var(--rm-bg)", border: "0.5px solid var(--rm-bdr)", borderRadius: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: "var(--rm)", marginBottom: item.escalation_note ? 4 : 0, textTransform: "capitalize" }}>
                  Escalated to {item.escalated_to}
                </div>
                {item.escalation_note && <p style={{ fontSize: 11, color: "var(--fg2)" }}>{item.escalation_note}</p>}
              </div>
            )}

            {item.remediation_activity?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Activity
                </div>
                {item.remediation_activity.slice(0, 5).map(a => (
                  <div key={a.id} style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--fg3)", marginBottom: 4, alignItems: "flex-start" }}>
                    <Clock size={10} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{a.detail ?? a.action}</span>
                    <span style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{fmt_date(a.created_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {item.status !== "resolved" && item.status !== "wont_fix" && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {item.status === "open" && (
                  <button type="button" onClick={() => updateStatus("in_progress")} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 12px", borderRadius: 5, fontSize: 11,
                    border: "0.5px solid var(--bdr2)", background: "transparent",
                    color: "var(--fg2)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
                  }}>
                    <Clock size={10} /> Start
                  </button>
                )}
                {item.status !== "escalated" && (
                  <button type="button" onClick={() => setEscalating(true)} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 12px", borderRadius: 5, fontSize: 11,
                    border: "0.5px solid var(--rm-bdr)", background: "var(--rm-bg)",
                    color: "var(--rm)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
                  }}>
                    <ArrowUpRight size={10} /> Escalate
                  </button>
                )}
                <button type="button" onClick={() => updateStatus("resolved")} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: 5, fontSize: 11,
                  border: "0.5px solid var(--rl-bdr)", background: "var(--rl-bg)",
                  color: "var(--rl)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
                }}>
                  <CheckCircle size={10} /> Resolve
                </button>
                <button type="button" onClick={() => updateStatus("wont_fix")} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: 5, fontSize: 11,
                  border: "0.5px solid var(--bdr2)", background: "transparent",
                  color: "var(--fg3)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
                }}>
                  <X size={10} /> Won&apos;t fix
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {escalating && (
        <EscalateModal item={item} onClose={() => setEscalating(false)} onDone={onUpdate} />
      )}
    </>
  );
}

export default function RemediationPage() {
  const [items, setItems]               = useState<RemediationItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSev, setFilterSev]       = useState("");
  const [mineOnly, setMineOnly]         = useState(false);

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    if (mineOnly)     params.set("mine", "true");
    const res = await fetch(`/api/remediation?${params}`);
    const { items: data } = await res.json();
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus, mineOnly]);

  const filtered = items.filter(i => !filterSev || i.gap_severity === filterSev);

  const counts = {
    open:        items.filter(i => i.status === "open").length,
    in_progress: items.filter(i => i.status === "in_progress").length,
    escalated:   items.filter(i => i.status === "escalated").length,
    resolved:    items.filter(i => i.status === "resolved").length,
    critical:    items.filter(i => i.gap_severity === "critical").length,
  };

  const statusFilters = (
    <>
      <div className="sidebar-section">Filter by status</div>
      {STATUS_FILTERS.map(({ value, label }) => (
        <button
          key={value || "all"}
          type="button"
          onClick={() => setFilterStatus(value)}
          className={`sidebar-nav-item${filterStatus === value ? " active" : ""}`}
          style={{ width: "100%", textAlign: "left" }}
        >
          {label}
          {value && counts[value as keyof typeof counts] !== undefined && (
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg3)" }}>
              {counts[value as keyof typeof counts]}
            </span>
          )}
        </button>
      ))}
    </>
  );

  return (
    <div className="app-shell">
      <Sidebar extra={statusFilters} />
      <main className="main-area">
        <div style={{
          padding: "16px 24px", borderBottom: "0.5px solid var(--bdr)",
          display: "flex", alignItems: "center", gap: 12,
          background: "var(--card)", flexShrink: 0, flexWrap: "wrap",
        }}>
          <ShieldAlert size={14} color="var(--fg3)" />
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", flex: 1 }}>Remediation queue</span>

          <select
            value={filterSev} onChange={e => setFilterSev(e.target.value)}
            style={{
              padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--bdr2)",
              background: "var(--card2)", color: "var(--fg)", fontSize: 11,
              fontFamily: "'Sora', sans-serif", cursor: "pointer",
            }}
          >
            {SEV_FILTERS.map(({ value, label }) => <option key={value || "all"} value={value}>{label}</option>)}
          </select>

          <button type="button" onClick={() => setMineOnly(!mineOnly)} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "5px 12px", borderRadius: 5, fontSize: 11, fontWeight: 500,
            border: `0.5px solid ${mineOnly ? "var(--bdr3)" : "var(--bdr2)"}`,
            background: mineOnly ? "var(--lift)" : "transparent",
            color: mineOnly ? "var(--fg)" : "var(--fg3)", cursor: "pointer",
            fontFamily: "'Sora', sans-serif", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            <User size={10} />
            Mine only
          </button>
        </div>

        <div style={{
          padding: "10px 24px", borderBottom: "0.5px solid var(--bdr)",
          display: "flex", gap: 24, background: "var(--card2)", flexWrap: "wrap",
          flexShrink: 0,
        }}>
          {[
            { label: "Open",        value: counts.open,        color: "var(--fg)" },
            { label: "In progress", value: counts.in_progress, color: "var(--fg)" },
            { label: "Escalated",   value: counts.escalated,   color: "var(--rm)" },
            { label: "Resolved",    value: counts.resolved,    color: "var(--rl)" },
            { label: "Critical",    value: counts.critical,    color: "var(--rh)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ fontSize: 11, color: "var(--fg3)" }}>
              <span style={{ fontWeight: 600, color, marginRight: 4 }}>{value}</span>{label}
            </div>
          ))}
        </div>

        <div className="chat-scroll">
          {loading && (
            <div style={{ textAlign: "center", color: "var(--fg3)", fontSize: 12, padding: "40px 0" }}>
              Loading...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <CheckCircle size={28} color="var(--fg4)" style={{ margin: "0 auto 12px" }} />
              <p style={{ fontSize: 13, color: "var(--fg3)" }}>
                {filterStatus === "resolved" ? "No resolved items yet" : "No items in the queue"}
              </p>
              <p style={{ fontSize: 11, color: "var(--fg3)", marginTop: 4 }}>
                Add gaps from an assessment to start tracking remediation
              </p>
            </div>
          )}
          {!loading && filtered.map(item => (
            <ItemCard key={item.id} item={item} onUpdate={load} />
          ))}
        </div>
      </main>
    </div>
  );
}
