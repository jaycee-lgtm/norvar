"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Github, Gitlab, Trello, AlertTriangle, ExternalLink, Check, Loader2, RefreshCw, MessageSquare, ClipboardCheck } from "lucide-react";
import HoverTip from "@/components/HoverTip";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  monitoringAssessHref,
  monitoringChatHref,
} from "@/lib/monitoring-inquiry";

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

function SignalCard({ signal, onDismiss, onAskNora, onRunAssessment, isMobile, highlight, actionBusy }: {
  signal:          Signal;
  onDismiss:       (id: string) => void;
  onAskNora:       (signal: Signal) => void;
  onRunAssessment: (signal: Signal) => void;
  isMobile:        boolean;
  highlight:       boolean;
  actionBusy:      "nora" | "assess" | null;
}) {
  const [expanded, setExpanded] = useState(highlight);
  const sev = SEVERITY_META[signal.severity];

  useEffect(() => {
    if (highlight) setExpanded(true);
  }, [highlight]);

  return (
    <article
      className={`inbox-monitor-card${signal.user_dismissed ? " dismissed" : ""}${expanded ? " expanded" : ""}${highlight ? " highlighted" : ""}`}
      style={{ "--monitor-sev": sev.color } as React.CSSProperties}
    >
      <button
        type="button"
        className="inbox-monitor-card-head"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {!isMobile && (
          <span className="inbox-monitor-provider inbox-monitor-provider--row" aria-hidden>
            {PROVIDER_ICON[signal.provider]}
          </span>
        )}

        <div className="inbox-monitor-card-main">
          {isMobile ? (
            <>
              <div className="inbox-monitor-card-top">
                <span className="inbox-monitor-provider" aria-hidden>
                  {PROVIDER_ICON[signal.provider]}
                </span>
                <span className="inbox-monitor-severity" style={{ background: sev.bg, color: sev.color }}>
                  {sev.label}
                </span>
                <span className="inbox-monitor-kind">{KIND_LABEL[signal.signal_kind]}</span>
                <time className="inbox-monitor-date" dateTime={signal.created_at}>
                  {fmtDate(signal.created_at)}
                </time>
              </div>
              <h3 className="inbox-monitor-title">{signal.title}</h3>
              <p className="inbox-monitor-meta">
                {signal.repo_or_project} · {signal.author_external_name}
              </p>
            </>
          ) : (
            <div className="inbox-monitor-row">
              <span className="inbox-monitor-kind">{KIND_LABEL[signal.signal_kind]}</span>
              <h3 className="inbox-monitor-title">{signal.title}</h3>
              {!expanded && (
                <p className="inbox-monitor-snippet">{signal.summary}</p>
              )}
              <time className="inbox-monitor-date" dateTime={signal.created_at}>
                {fmtDate(signal.created_at)}
              </time>
              <span
                className="inbox-monitor-sev-dot"
                style={{ background: sev.color }}
                title={`${sev.label} severity`}
                aria-hidden
              />
            </div>
          )}
        </div>
      </button>

      {expanded && (
        <div className="inbox-monitor-card-body">
          {!isMobile && (
            <p className="inbox-monitor-source">
              {signal.repo_or_project} · {signal.author_external_name}
            </p>
          )}
          <p className="inbox-monitor-summary">{signal.summary}</p>

          {signal.gaps_identified?.length > 0 && (
            <div className="inbox-monitor-gaps">
              <div className="inbox-monitor-gaps-label">Gaps identified</div>
              {signal.gaps_identified.map((g, i) => (
                <div key={i} className="inbox-monitor-gap-row">
                  <strong>{g.gap}</strong>
                  <span> — {g.framework} · {DOMAIN_LABEL[g.domain] ?? g.domain}</span>
                </div>
              ))}
            </div>
          )}

          <div className="inbox-monitor-actions">
            <a href={signal.source_url} target="_blank" rel="noreferrer" className="inbox-monitor-btn">
              View source <ExternalLink size={10} />
            </a>
            <button
              type="button"
              className="inbox-monitor-btn"
              disabled={!!actionBusy}
              onClick={() => onAskNora(signal)}
            >
              {actionBusy === "nora" ? <Loader2 size={11} className="spin" /> : <MessageSquare size={11} />}
              Ask Nora
            </button>
            <button
              type="button"
              className="inbox-monitor-btn primary"
              disabled={!!actionBusy}
              onClick={() => onRunAssessment(signal)}
            >
              {actionBusy === "assess" ? <Loader2 size={11} className="spin" /> : <ClipboardCheck size={11} />}
              Run assessment
            </button>
            {!signal.user_dismissed && (
              <button type="button" className="inbox-monitor-btn ghost" onClick={() => onDismiss(signal.id)}>
                Dismiss
              </button>
            )}
          </div>

          <div className="inbox-monitor-notify">
            {signal.notified_admin      && <span><Check size={9} /> Admin notified</span>}
            {signal.notified_author     && <span><Check size={9} /> Author notified</span>}
            {signal.notified_compliance && <span><Check size={9} /> Compliance notified</span>}
          </div>
        </div>
      )}
    </article>
  );
}

function InboxMonitoringTabInner() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const highlightId  = searchParams.get("signal");
  const isMobile     = useIsMobile();
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterDomain, setFilterDomain]     = useState("");
  const [actionBusy, setActionBusy] = useState<{ id: string; kind: "nora" | "assess" } | null>(null);

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
    setActionBusy({ id: signal.id, kind: "nora" });
    router.push(monitoringChatHref(signal.id));
  };

  const runAssessment = (signal: Signal) => {
    setActionBusy({ id: signal.id, kind: "assess" });
    router.push(monitoringAssessHref(signal.id));
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

  const filterKey = `${filterSeverity}-${filterDomain}`;

  return (
    <div className={`inbox-monitoring-feed${isMobile ? " inbox-monitoring-feed--mobile" : ""}`}>
      {!isMobile && (
        <div className="inbox-monitoring-toolbar">
          <HoverTip label="Refresh">
            <button
              type="button"
              className="inbox-toolbar-btn"
              aria-label="Refresh"
              disabled={loading}
              onClick={() => { void load(); }}
            >
              <RefreshCw size={16} strokeWidth={1.75} className={loading ? "spin" : undefined} />
            </button>
          </HoverTip>
          <span className="inbox-list-toolbar-spacer" />
          <span className="inbox-list-range">
            {filtered.length > 0 ? `1–${filtered.length}` : "0"} of {filtered.length}
          </span>
        </div>
      )}

      <div className="inbox-monitoring-head">
        <div className="inbox-monitoring-stats">
          {Object.entries(counts).map(([sev, count]) => {
            const meta = SEVERITY_META[sev as keyof typeof SEVERITY_META];
            return (
              <button
                key={sev}
                type="button"
                className={`inbox-monitoring-stat${filterSeverity === sev ? " active" : ""}`}
                onClick={() => setFilterSeverity(filterSeverity === sev ? "" : sev)}
              >
                <span className="inbox-monitoring-stat-count" style={{ color: meta.color }}>{count}</span>
                {meta.label}
              </button>
            );
          })}
        </div>

        <div className="inbox-monitoring-filters">
          <div className="inbox-monitoring-filter-group" role="tablist" aria-label="Severity">
            {["", "high", "medium", "low"].map(s => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={filterSeverity === s}
                className={`inbox-monitoring-filter${filterSeverity === s ? " active" : ""}`}
                onClick={() => setFilterSeverity(s)}
              >
                {s ? SEVERITY_META[s as keyof typeof SEVERITY_META].label : "All severities"}
              </button>
            ))}
          </div>
          {!isMobile && <span className="inbox-monitoring-filter-divider" aria-hidden />}
          <div className="inbox-monitoring-filter-group" role="tablist" aria-label="Domain">
            {["", "privacy", "ai_governance", "cybersecurity"].map(d => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={filterDomain === d}
                className={`inbox-monitoring-filter${filterDomain === d ? " active" : ""}`}
                onClick={() => setFilterDomain(d)}
              >
                {d ? DOMAIN_LABEL[d] : "All domains"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="inbox-monitoring-list" key={filterKey}>
        {loading && (
          <div className="inbox-monitoring-empty">
            <Loader2 size={16} className="spin" />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="inbox-monitoring-empty inbox-monitoring-empty--fade">
            <AlertTriangle size={24} color="var(--fg4)" />
            <p>{signals.length === 0 ? "No monitoring signals yet" : "No signals match this filter"}</p>
          </div>
        )}
        {!loading && filtered.map(s => (
          <SignalCard
            key={s.id}
            signal={s}
            isMobile={isMobile}
            highlight={s.id === highlightId}
            actionBusy={actionBusy?.id === s.id ? actionBusy.kind : null}
            onDismiss={dismiss}
            onAskNora={askNora}
            onRunAssessment={runAssessment}
          />
        ))}
      </div>
    </div>
  );
}

export default function InboxMonitoringTab() {
  return (
    <Suspense fallback={
      <div className="inbox-monitoring-empty">
        <Loader2 size={16} className="spin" />
      </div>
    }>
      <InboxMonitoringTabInner />
    </Suspense>
  );
}
