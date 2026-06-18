"use client";

import { useState, useEffect, useCallback } from "react";
import { Github, Gitlab, Trello, AlertTriangle, ExternalLink, Check } from "lucide-react";

type Signal = {
  id:                  string;
  provider:            "github" | "gitlab" | "jira";
  source_type:         string;
  source_url:          string;
  repo_or_project:     string;
  author_external_name: string;
  title:               string;
  domains:             string[];
  severity:            "high" | "medium" | "low";
  signal_kind:         "new_exposure" | "regression" | "new_integration";
  summary:             string;
  gaps_identified:     Array<{ gap: string; framework: string; domain: string }>;
  frameworks_cited:    string[];
  notified_admin:      boolean;
  notified_author:     boolean;
  notified_compliance: boolean;
  user_dismissed:      boolean;
  assessment_triggered: boolean;
  created_at:          string;
};

const PROVIDER_ICON = {
  github: <Github size={13} />,
  gitlab: <Gitlab size={13} />,
  jira:   <Trello size={13} />,
};

const SEVERITY_META = {
  high:   { label: "High",   color: "var(--rh, #A32D2D)", bg: "var(--rh-bg, #FCEBEB)" },
  medium: { label: "Medium", color: "var(--rm, #854F0B)", bg: "var(--rm-bg, #FAEEDA)" },
  low:    { label: "Low",    color: "var(--rl, #3B6D11)", bg: "var(--rl-bg, #EAF3DE)" },
};

const KIND_LABEL = {
  new_exposure:    "New exposure",
  regression:      "Regression",
  new_integration: "New integration",
};

const DOMAIN_LABEL: Record<string, string> = {
  privacy: "Privacy", ai_governance: "AI Governance", cybersecurity: "Cybersecurity",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function SignalCard({ signal, onDismiss, onAskNora, onRunAssessment }: {
  signal:          Signal;
  onDismiss:       (id: string) => void;
  onAskNora:       (signal: Signal) => void;
  onRunAssessment: (signal: Signal) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = SEVERITY_META[signal.severity];

  return (
    <div style={{
      border: "0.5px solid var(--bdr2)", borderLeft: `3px solid ${sev.color}`,
      borderRadius: 8, background: "var(--card)", marginBottom: 8, overflow: "hidden",
      opacity: signal.user_dismissed ? 0.5 : 1,
    }}>
      <div onClick={() => setExpanded(!expanded)} style={{ padding: "12px 16px", cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ color: "var(--fg3)" }}>{PROVIDER_ICON[signal.provider]}</span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
            background: sev.bg, color: sev.color, textTransform: "uppercase", letterSpacing: "0.4px",
          }}>
            {sev.label}
          </span>
          <span style={{ fontSize: 10, color: "var(--fg3)", fontWeight: 500 }}>
            {KIND_LABEL[signal.signal_kind]}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg3)" }}>
            {fmtDate(signal.created_at)}
          </span>
        </div>

        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", marginBottom: 2 }}>
          {signal.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--fg3)" }}>
          {signal.repo_or_project} · {signal.author_external_name}
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop: "0.5px solid var(--bdr)", padding: "14px 16px" }}>
          <p style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.6, marginBottom: 14 }}>
            {signal.summary}
          </p>

          {signal.gaps_identified?.length > 0 && (
            <div style={{ marginBottom: 14, padding: "10px 12px", background: "var(--card2)", borderRadius: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", marginBottom: 6 }}>
                Gaps identified
              </div>
              {signal.gaps_identified.map((g, i) => (
                <div key={i} style={{ fontSize: 12, color: "var(--fg)", marginBottom: 4 }}>
                  <strong>{g.gap}</strong>
                  <span style={{ color: "var(--fg3)", fontSize: 11 }}> — {g.framework} · {DOMAIN_LABEL[g.domain] ?? g.domain}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <a href={signal.source_url} target="_blank" rel="noreferrer" style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "5px 10px", borderRadius: 5, fontSize: 11,
              border: "0.5px solid var(--bdr2)", color: "var(--fg2)", textDecoration: "none",
            }}>
              View source <ExternalLink size={10} />
            </a>
            <button onClick={() => onAskNora(signal)} style={{
              padding: "5px 10px", borderRadius: 5, fontSize: 11, fontWeight: 500,
              border: "0.5px solid var(--bdr2)", background: "transparent", color: "var(--fg2)", cursor: "pointer",
            }}>
              Ask Nora
            </button>
            <button onClick={() => onRunAssessment(signal)} style={{
              padding: "5px 10px", borderRadius: 5, fontSize: 11, fontWeight: 500,
              border: "none", background: "var(--fg)", color: "var(--bg)", cursor: "pointer",
            }}>
              Run assessment with Cassius
            </button>
            {!signal.user_dismissed && (
              <button onClick={() => onDismiss(signal.id)} style={{
                padding: "5px 10px", borderRadius: 5, fontSize: 11,
                border: "none", background: "transparent", color: "var(--fg3)", cursor: "pointer",
                marginLeft: "auto",
              }}>
                Dismiss
              </button>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, fontSize: 10, color: "var(--fg3)" }}>
            {signal.notified_admin      && <span><Check size={9} style={{ verticalAlign: "middle" }} /> Admin notified</span>}
            {signal.notified_author     && <span><Check size={9} style={{ verticalAlign: "middle" }} /> Author notified</span>}
            {signal.notified_compliance && <span><Check size={9} style={{ verticalAlign: "middle" }} /> Compliance notified</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InboxMonitoringTab() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterDomain, setFilterDomain]     = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/monitor/signals");
    const { signals: s } = await res.json().catch(() => ({ signals: [] }));
    setSignals(s ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const dismiss = async (id: string) => {
    await fetch("/api/monitor/signals", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, user_dismissed: true }),
    });
    void load();
  };

  const askNora = (signal: Signal) => {
    window.location.href = `/?prefill=${encodeURIComponent(signal.summary)}`;
  };

  const runAssessment = (signal: Signal) => {
    window.location.href = `/assess?context=${encodeURIComponent(JSON.stringify({
      source: signal.source_url, summary: signal.summary, domains: signal.domains,
    }))}`;
  };

  const filtered = signals.filter(s =>
    !s.user_dismissed &&
    (!filterSeverity || s.severity === filterSeverity) &&
    (!filterDomain   || s.domains.includes(filterDomain))
  );

  const counts = {
    high:   signals.filter(s => s.severity === "high" && !s.user_dismissed).length,
    medium: signals.filter(s => s.severity === "medium" && !s.user_dismissed).length,
    low:    signals.filter(s => s.severity === "low" && !s.user_dismissed).length,
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 16, padding: "10px 0" }}>
        {Object.entries(counts).map(([sev, count]) => {
          const meta = SEVERITY_META[sev as keyof typeof SEVERITY_META];
          return (
            <div key={sev} style={{ fontSize: 12, color: "var(--fg3)" }}>
              <span style={{ fontWeight: 700, color: meta.color, marginRight: 4 }}>{count}</span>{meta.label}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {["", "high", "medium", "low"].map(s => (
          <button key={s} onClick={() => setFilterSeverity(s)} style={{
            padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500,
            border: `0.5px solid ${filterSeverity === s ? "var(--bdr3)" : "var(--bdr2)"}`,
            background: filterSeverity === s ? "var(--lift)" : "transparent",
            color: filterSeverity === s ? "var(--fg)" : "var(--fg3)", cursor: "pointer",
          }}>
            {s ? SEVERITY_META[s as keyof typeof SEVERITY_META].label : "All severities"}
          </button>
        ))}
        <span style={{ width: 1, background: "var(--bdr)", margin: "0 4px" }} />
        {["", "privacy", "ai_governance", "cybersecurity"].map(d => (
          <button key={d} onClick={() => setFilterDomain(d)} style={{
            padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500,
            border: `0.5px solid ${filterDomain === d ? "var(--bdr3)" : "var(--bdr2)"}`,
            background: filterDomain === d ? "var(--lift)" : "transparent",
            color: filterDomain === d ? "var(--fg)" : "var(--fg3)", cursor: "pointer",
          }}>
            {d ? DOMAIN_LABEL[d] : "All domains"}
          </button>
        ))}
      </div>

      {loading && <p style={{ fontSize: 12, color: "var(--fg3)", textAlign: "center", padding: 30 }}>Loading...</p>}
      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <AlertTriangle size={24} color="var(--fg4)" style={{ margin: "0 auto 10px" }} />
          <p style={{ fontSize: 12, color: "var(--fg3)" }}>No monitoring signals match this filter</p>
        </div>
      )}
      {!loading && filtered.map(s => (
        <SignalCard key={s.id} signal={s} onDismiss={dismiss} onAskNora={askNora} onRunAssessment={runAssessment} />
      ))}
    </div>
  );
}
