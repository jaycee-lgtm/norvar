"use client";

import { Suspense, useState, useRef, useEffect, type RefObject } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Show } from "@clerk/nextjs";
import AppShell from "@/components/AppShell";
import LandingPage from "@/components/LandingPage";
import HomeHero from "@/components/HomeHero";
import HomeComposerWrap from "@/components/HomeComposerWrap";
import AgentComposer from "@/components/AgentComposer";
import FormattedMessage from "@/components/FormattedMessage";
import MessageFeedback from "@/components/MessageFeedback";
import AiDisclaimer from "@/components/AiDisclaimer";
import type { MessageFeedbackRating } from "@/lib/message-feedback";
import GapChat, { type GapChatMessage } from "@/components/GapChat";
import { splitRemediationSteps } from "@/lib/remediation-steps";
import DocumentPicker, { SelectedDocumentChips } from "@/components/DocumentPicker";
import {
  type AssessmentAnswers,
  type AssessmentQuestion,
  buildAssessmentRequest,
  formatGuidedQuestionText,
  getNextAssessmentQuestion,
  guidedQuestionOptions,
  mapQuestionnaireDomain,
  ASSESSMENT_QUESTIONS,
  sanitizeAssessmentUserMessage,
} from "@/lib/assessment-questionnaire";
import { VoiceInputIcon, VoiceErrorBanner } from "@/components/VoiceControls";
import { useVoice } from "@/hooks/useVoice";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";
import SampleQuestionsDropdown from "@/components/SampleQuestionsDropdown";
import {
  ASSESSMENT_CONFIRM_NOT_YET,
  ASSESSMENT_CONFIRM_OPTIONS,
  ASSESSMENT_CONFIRM_YES,
  buildAssessmentConfirmationText,
  buildAssessmentScopingIntroText,
  buildConversationDescription,
  conversationLooksLikeAssessment,
  isAffirmativeAssessmentConfirm,
  isNegativeAssessmentConfirm,
  looksLikeAssessmentDescription,
} from "@/lib/cassius-prescope";
import { createTypewriterDrain, type TypewriterDrain } from "@/lib/typewriter-drain";
import { readSSEStream } from "@/lib/sse";
import {
  type NoraChatMessage,
  clearNoraCassiusHandoff,
  consumeNoraCassiusHandoff,
} from "@/lib/nora-cassius-handoff";
import {
  buildMonitoringAssessmentDescription,
  mapMonitoringDomainsToAssessment,
  type MonitoringInquirySignal,
} from "@/lib/monitoring-inquiry";
import { aggregateAssessmentFrameworks, CATALOG_STATUS_LABELS, resolveCatalogEntryForFrameworkRef } from "@/lib/regulatory-catalog";
import { normalizeRiskDomainKey, normalizeScopedRiskDomains, type RiskDomainKey } from "@/lib/risk-tiers";
import { normalizeGapSeverity, normalizeRiskTier, compareGapSeverity } from "@/lib/risk-tiers";
import { assignGapIds, lookupGapChat } from "@/lib/gap-id";
import {
  FileText,
  Loader2, AlertTriangle, AlertCircle, Info,
  ShieldAlert, X, Download,
  History, SquarePen, ChevronDown,
} from "lucide-react";

import {
  jurisdictionLabel,
  normalizeJurisdictionList,
} from "@/lib/jurisdictions";

// Three core domain lenses. CV, ADMT, and Robotics are assessment subjects
// evaluated through these lenses, not separate domains.
const DOMAIN_OPTIONS = [
  { value: "privacy",  label: "Privacy"       },
  { value: "ai",       label: "AI Governance" },
  { value: "cyber",    label: "Cybersecurity" },
];

const DATA_TYPE_OPTIONS = [
  { value: "biometric",      label: "Biometrics"            },
  { value: "health",         label: "Health / genetic"      },
  { value: "children",       label: "Children's data"       },
  { value: "location",       label: "Precise location"      },
  { value: "financial",      label: "Financial data"        },
  { value: "behavioural",    label: "Behavioural"           },
  { value: "communications", label: "Communications"        },
  { value: "general_pi",     label: "General personal data" },
];

const SECTOR_OPTIONS = [
  { value: "healthcare",     label: "Healthcare"       },
  { value: "finance",        label: "Finance"          },
  { value: "hr_recruitment", label: "HR / Recruitment" },
  { value: "government",     label: "Government"       },
  { value: "education",      label: "Education"        },
  { value: "transport",      label: "Transport"        },
  { value: "media_adtech",   label: "Media / Ad tech"  },
  { value: "legal",          label: "Legal"            },
  { value: "retail",         label: "Retail"           },
  { value: "proptech",       label: "Proptech"         },
];

// ── Types ──────────────────────────────────────────────────────────────────────

type Gap = {
  severity:     "high" | "medium" | "low";
  domain?:      string;
  title:        string;
  detail?:      string;
  description?: string;
  remediation?: string;
  frameworks:   string[];
};

type Assessment = {
  id?:             string;
  title:           string;
  summary:         string;
  risk:            string;
  risk_summary?:   string;
  risk_score?:     { composite: number; tier: string };
  risk_tier?:      string;
  risk_by_domain?: Record<string, { tier: string; gap_count: number }>;
  scoped_domains?: RiskDomainKey[];
  assessment_number?: string;
  status?:         "processing" | "partial" | "complete" | "failed";
  gaps:            Gap[];
  frameworks?:     string[];
};

type Message =
  | { role: "user"; content: string; tags?: string[] }
  | { role: "nora"; content: string }
  | { role: "assistant"; assessment: Assessment }
  | { role: "thinking"; text: string; status?: string; isFollowUp?: boolean; followUpOptions?: string[]; guidedQuestionId?: string; guidedMulti?: boolean; guidedText?: boolean; riskTag?: string; assessmentConfirm?: boolean }
  | { role: "chat"; text: string; id?: string; feedback?: MessageFeedbackRating | null };

type StoredMessage =
  | { role: "user"; content: string; tags?: string[] }
  | { role: "nora"; content: string }
  | { role: "assistant"; assessment: Assessment }
  | { role: "chat"; text: string; id?: string; feedback?: MessageFeedbackRating | null };

function restoreMessages(
  row: {
    id: string;
    title: string;
    description: string;
    risk_tier: string;
    risk_score: number;
    domains?: string[];
    result?: Assessment;
    prior_nora_chat?: NoraChatMessage[];
    messages?: StoredMessage[];
  },
): Message[] {
  const scopedDomains = normalizeScopedRiskDomains(
    row.domains ?? row.result?.scoped_domains ?? [],
  );

  if (Array.isArray(row.messages) && row.messages.length > 0) {
    return row.messages.flatMap((m): Message[] => {
      if (m.role === "user") {
        return [{
          role: "user",
          content: sanitizeAssessmentUserMessage(m.content, row.description),
          tags: m.tags,
        }];
      }
      if (m.role === "nora") {
        return [{ role: "nora", content: m.content }];
      }
      if (m.role === "chat") {
        return [{ role: "chat", text: m.text, id: m.id, feedback: m.feedback }];
      }
      if (m.role === "assistant" && m.assessment) {
        const a = m.assessment;
        const resultStatus = (row.result as Assessment | undefined)?.status;
        const filteredRiskByDomain = filterRiskByScopedDomains(a.risk_by_domain, scopedDomains);
        return [{
          role: "assistant",
          assessment: {
            ...a,
            id: row.id,
            title: a.title ?? row.title,
            status: a.status ?? resultStatus,
            risk_by_domain: filteredRiskByDomain,
            scoped_domains: scopedDomains.length ? scopedDomains : a.scoped_domains,
            risk_score: a.risk_score ?? {
              composite: row.risk_score,
              tier: row.risk_tier,
            },
          },
        }];
      }
      return [];
    });
  }

  const result = (row.result ?? {}) as Assessment;
  const displayDescription = sanitizeAssessmentUserMessage(row.description || row.title || "");
  return [
    { role: "user", content: displayDescription },
    {
      role: "assistant",
      assessment: {
        ...result,
        id: row.id,
        title: result.title ?? row.title,
        gaps: result.gaps ?? [],
        status: result.status,
        risk_by_domain: filterRiskByScopedDomains(result.risk_by_domain, scopedDomains),
        scoped_domains: scopedDomains.length ? scopedDomains : result.scoped_domains,
        risk_score: result.risk_score ?? {
          composite: row.risk_score,
          tier: row.risk_tier,
        },
      },
    },
  ];
}

function filterRiskByScopedDomains(
  byDomain: Assessment["risk_by_domain"],
  scopedDomains: RiskDomainKey[],
) {
  if (!byDomain || !scopedDomains.length) return byDomain;
  const filtered: NonNullable<Assessment["risk_by_domain"]> = {};
  for (const domain of scopedDomains) {
    if (byDomain[domain]) filtered[domain] = byDomain[domain];
  }
  return filtered;
}

function GapFrameworkLinks({ frameworks }: { frameworks: string[] }) {
  if (!frameworks.length) return null;

  return (
    <div className="gap-framework-chips">
      {frameworks.map((raw, i) => {
        const ref = raw.trim();
        const entry = resolveCatalogEntryForFrameworkRef(ref);
        return entry?.sourceUrl ? (
          <a
            key={`${ref}-${i}`}
            href={entry.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="gap-framework-chip gap-framework-chip--link"
          >
            {ref}
          </a>
        ) : (
          <span key={`${ref}-${i}`} className="gap-framework-chip">{ref}</span>
        );
      })}
    </div>
  );
}

type SSEEvent =
  | { type: "status"; text: string }
  | { type: "token"; text: string }
  | { type: "summary"; text: string }
  | { type: "started"; assessment_id: string; assessment_number?: string; assessment?: Assessment }
  | { type: "gap"; gap: Gap; index: number; assessment?: Assessment }
  | { type: "done"; assessment?: Assessment; text?: string }
  | { type: "saved"; assessment?: Assessment }
  | { type: "warning"; text: string }
  | { type: "ping" }
  | { type: "error"; text: string };

// ── Severity icon ──────────────────────────────────────────────────────────────

function SevIcon({ sev }: { sev: string }) {
  const normalized = normalizeGapSeverity(sev);
  if (normalized === "high")   return <AlertTriangle size={9} strokeWidth={2.5} />;
  if (normalized === "medium") return <AlertCircle   size={9} strokeWidth={2.5} />;
  return <Info size={9} strokeWidth={2.5} />;
}

// ── Export ─────────────────────────────────────────────────────────────────────

function exportAssessment(a: Assessment) {
  const frameworks = aggregateAssessmentFrameworks(a.gaps ?? [], a.frameworks);
  const lines: string[] = [
    "NORVAR COMPLIANCE ASSESSMENT",
    "=".repeat(50),
    "",
    `Title: ${a.title}`,
    `Risk: ${normalizeRiskTier(a.risk_tier ?? a.risk_score?.tier ?? a.risk ?? "low")}`,
    "",
    "SUMMARY",
    "-".repeat(30),
    a.summary,
    "",
    "FRAMEWORKS",
    "-".repeat(30),
    frameworks.join(", ") || "None",
    "",
    `GAPS (${a.gaps?.length ?? 0})`,
    "-".repeat(30),
  ];

  [...(a.gaps ?? [])]
    .sort((x, y) => compareGapSeverity(x.severity, y.severity))
    .forEach((g, i) => {
    lines.push("", `${i + 1}. [${normalizeGapSeverity(g.severity).toUpperCase()}] ${g.title}`);
    lines.push(`   Frameworks: ${g.frameworks?.join(", ") || "N/A"}`);
    if (g.detail || g.description) lines.push(`   Issue: ${g.detail || g.description}`);
    if (g.remediation) lines.push(`   Fix: ${g.remediation}`);
  });

  lines.push("", "=".repeat(50), `Generated by Norvar, ${new Date().toLocaleString()}`);

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = `norvar-${(a.title || "assessment").toLowerCase().replace(/\s+/g, "-")}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatGapStreamText(gap: Gap, index: number): string {
  const sev = normalizeGapSeverity(gap.severity);
  const lines = [
    "",
    `GAP ${index + 1} · ${sev.charAt(0).toUpperCase() + sev.slice(1)}`,
    gap.title,
    "",
  ];
  if (gap.detail || gap.description) {
    lines.push("Gap", gap.detail || gap.description || "", "");
  }
  const steps = gap.remediation ? splitRemediationSteps(gap.remediation) : [];
  if (steps.length > 0) {
    lines.push("Proposed remediation");
    steps.forEach((step, i) => lines.push(`${i + 1}. ${step}`));
    lines.push("");
  }
  return lines.join("\n");
}

function splitAssessmentStream(text: string): { summary: string; gaps: string } {
  const match = text.match(/\n\nGAP \d+/);
  if (!match || match.index === undefined) {
    return { summary: text.trim(), gaps: "" };
  }
  return {
    summary: text.slice(0, match.index).trim(),
    gaps:    text.slice(match.index).trim(),
  };
}

function AssessmentScrollHint({
  containerRef,
  visible,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  visible:        boolean;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!visible) {
      setShow(false);
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShow(remaining > 96);
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [containerRef, visible]);

  if (!show) return null;

  return (
    <button
      type="button"
      className="assessment-scroll-hint"
      aria-label="More gaps below — scroll down"
      onClick={() => {
        const el = containerRef.current;
        if (!el) return;
        el.scrollBy({ top: Math.round(el.clientHeight * 0.72), behavior: "smooth" });
      }}
    >
      <ChevronDown size={16} strokeWidth={2.25} />
      <span>More below</span>
    </button>
  );
}

// ── Assessment card ────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
  const t = normalizeRiskTier(tier);
  const styles: Record<string, { bg: string; color: string }> = {
    high:   { bg: "var(--color-background-warning, #FAEEDA)", color: "var(--color-text-warning, #854F0B)" },
    medium: { bg: "var(--color-background-info,    #E6F1FB)", color: "var(--color-text-info,    #185FA5)" },
    low:    { bg: "var(--color-background-success, #EAF3DE)", color: "var(--color-text-success, #3B6D11)" },
  };
  const s = styles[t] ?? styles.low;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
      background: s.bg, color: s.color,
      textTransform: "uppercase", letterSpacing: "0.5px",
    }}>
      {t}
    </span>
  );
}

const DOMAIN_LABELS: Record<string, string> = {
  privacy:       "Privacy",
  ai_governance: "AI Governance",
  cybersecurity: "Cybersecurity",
};

function AssessmentCard({ a, onNew, assessmentId, gapChats, onGapChatsUpdate, scopedDomains: scopedDomainsProp, streamingText, streamActive }: {
  a:                 Assessment;
  onNew:             () => void;
  assessmentId?:     string | null;
  gapChats?:         Record<string, GapChatMessage[]>;
  onGapChatsUpdate?: (key: string, messages: GapChatMessage[]) => void;
  scopedDomains?:    string[];
  streamingText?:    string;
  streamActive?:     boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"gaps" | "frameworks">("gaps");

  const overallTier = normalizeRiskTier(a.risk_tier ?? a.risk_score?.tier ?? a.risk ?? "low");
  const byDomain    = a.risk_by_domain ?? null;
  const scopedDomains = a.scoped_domains?.length
    ? a.scoped_domains
    : normalizeScopedRiskDomains(scopedDomainsProp ?? []);
  const visibleDomains: RiskDomainKey[] = scopedDomains.length
    ? scopedDomains
    : (Object.keys(byDomain ?? {}) as RiskDomainKey[]);
  const gaps        = a.gaps ?? [];
  const frameworks  = aggregateAssessmentFrameworks(gaps, a.frameworks);
  const isProcessing = a.status === "processing";
  const streamParts  = streamingText ? splitAssessmentStream(streamingText) : { summary: "", gaps: "" };
  const showDomainTiers = Boolean(
    !isProcessing &&
    byDomain &&
    visibleDomains.length > 0 &&
    (
      visibleDomains.length > 1 ||
      visibleDomains.some(domain => (byDomain[domain]?.gap_count ?? 0) > 0)
    ),
  );
  const hasStreamGaps = Boolean(streamParts.gaps);
  const showRiskSummary = !isProcessing;
  const ordered     = [...gaps].sort(
    (x, y) => compareGapSeverity(x.severity, y.severity),
  );
  const gapIdMap    = assignGapIds(
    ordered.map(g => ({ domain: g.domain ?? "privacy" })),
    a.assessment_number ?? null,
  );

  const [queued,    setQueued]    = useState<Set<number>>(new Set());
  const [queueing,  setQueueing]  = useState<number | null>(null);
  const [queuedAll, setQueuedAll] = useState(false);

  const addToQueue = async (indices: number[]) => {
    if (!a.id) return;
    const gapsToQueue = indices.map(i => ordered[i]).filter(Boolean);
    if (!gapsToQueue.length) return;

    const first = indices[0];
    setQueueing(indices.length === 1 ? first : -1);

    try {
      await fetch("/api/remediation", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          assessment_id:     a.id,
          assessment_number: a.assessment_number ?? null,
          project_title:     a.title,
          gaps:              indices.map(i => {
            const info = gapIdMap.get(i)!;
            return {
              ...ordered[i],
              gap_key:    info.gap_key,
              gap_number: info.gap_number,
            };
          }),
        }),
      });
      setQueued(prev => { const next = new Set(prev); indices.forEach(i => next.add(i)); return next; });
      if (indices.length > 1) setQueuedAll(true);
    } finally {
      setQueueing(null);
    }
  };

  return (
    <div className="msg-ai-card fade-up assessment-card">
      <div className="msg-ai-label">
        <ShieldAlert size={11} strokeWidth={2} color="var(--fg3)" />
        {ASSESS_AGENT.name} assessment
      </div>

      {showRiskSummary ? (
        <div className="score-row">
          <TierBadge tier={overallTier} />
          <span style={{ fontSize: 12, color: "var(--fg2)", fontWeight: 500, marginLeft: 6 }}>
            {overallTier.charAt(0).toUpperCase() + overallTier.slice(1)} risk
          </span>
          <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg3)" }}>
            {`${gaps.length} gap${gaps.length !== 1 ? "s" : ""} · ${frameworks.length} framework${frameworks.length !== 1 ? "s" : ""}`}
          </span>
        </div>
      ) : (
        <div className="assessment-status-row">
          <Loader2 size={12} className="spin" color="var(--fg3)" />
          <span>Analysing your deployment</span>
          {gaps.length > 0 && (
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg3)" }}>
              {gaps.length} gap{gaps.length !== 1 ? "s" : ""} identified so far
            </span>
          )}
        </div>
      )}

      {isProcessing && gaps.length === 0 && !hasStreamGaps && (
        <div style={{ display: "flex", gap: 5, padding: "6px 0 10px" }}>
          <span className="loading-dot" />
          <span className="loading-dot" />
          <span className="loading-dot" />
        </div>
      )}

      {showDomainTiers && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 4, flexWrap: "wrap" }}>
          {visibleDomains.map(domain => {
            const info = byDomain![domain];
            if (!info) return null;
            const showTierBadge = visibleDomains.length > 1 || info.tier !== overallTier;
            return (
            <div key={domain} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 6,
              border: "0.5px solid var(--bdr)",
              background: "var(--card2)", fontSize: 11,
            }}>
              <span style={{ color: "var(--fg3)" }}>{DOMAIN_LABELS[domain] ?? domain}</span>
              {showTierBadge && <TierBadge tier={info.tier} />}
              {info.gap_count > 0 && (
                <span style={{ fontSize: 10, color: "var(--fg3)" }}>
                  {info.gap_count} gap{info.gap_count !== 1 ? "s" : ""}
                </span>
              )}
            </div>
            );
          })}
        </div>
      )}

      <p className="assessment-summary">
        {a.summary || streamParts.summary || (isProcessing ? "Analysing your deployment. Gaps will stream in below." : "")}
        {isProcessing && streamActive && !streamParts.gaps && streamParts.summary && (
          <span className="assessment-stream-cursor" aria-hidden />
        )}
      </p>
      <div className="section-divider" />

      <div className="assessment-tabs" style={{ display: "flex", borderBottom: "0.5px solid var(--bdr)", marginBottom: 12 }}>
        {(["gaps", "frameworks"] as const).map(t => (
          <button key={t} type="button" onClick={() => setTab(t)} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 11px", fontSize: 11, cursor: "pointer",
            background: "transparent", border: "none",
            fontFamily: "'Sora', sans-serif", letterSpacing: "-0.01em",
            color: tab === t ? "var(--fg)" : "var(--fg3)",
            fontWeight: tab === t ? 500 : 400,
            borderBottom: tab === t ? "1.5px solid var(--fg)" : "1.5px solid transparent",
            marginBottom: -1,
          }}>
            {t === "gaps" && (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {`Gaps (${gaps.length})`}
                {tab === "gaps" && ordered.length > 0 && a.id && !queuedAll && (
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); void addToQueue(ordered.map((_, i) => i)); }}
                    disabled={queueing !== null}
                    style={{
                      fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 10,
                      background: "var(--card2)", color: "var(--fg3)", border: "0.5px solid var(--bdr2)",
                      cursor: queueing !== null ? "not-allowed" : "pointer",
                      letterSpacing: "0.05em", textTransform: "uppercase",
                    }}
                  >
                    {queueing === -1 ? "..." : "+ Add all"}
                  </button>
                )}
                {queuedAll && (
                  <span style={{ fontSize: 9, color: "var(--rl)", fontWeight: 600 }}>✓ All queued</span>
                )}
              </span>
            )}
            {t === "frameworks" && `Frameworks (${frameworks.length})`}
          </button>
        ))}
      </div>

      {tab === "gaps" && (
        <div className="assessment-gaps-section">
          {isProcessing ? (
            streamParts.gaps ? (
              <div className="assessment-gap-stream">
                {streamParts.gaps}
                {streamActive && <span className="assessment-stream-cursor" aria-hidden />}
              </div>
            ) : (
              <div style={{ padding: "12px 0", display: "flex", alignItems: "center", gap: 8 }}>
                <span className="loading-dot" />
                <span className="loading-dot" />
                <span className="loading-dot" />
                <span style={{ fontSize: 12, color: "var(--fg3)" }}>
                  Identifying compliance gaps...
                </span>
              </div>
            )
          ) : ordered.length === 0 ? (
            <p style={{ fontSize: 12, color: "var(--fg3)", padding: "8px 0" }}>No gaps identified.</p>
          ) : (
          ordered.map((gap, i) => {
            const steps = gap.remediation ? splitRemediationSteps(gap.remediation) : [];
            const sev = normalizeGapSeverity(gap.severity);
            const idInfo = gapIdMap.get(i)!;
            const gapLabel = idInfo.gap_id ?? idInfo.gap_number;
            return (
            <div key={i} className="gap-item gap-item-card">
              <div className="gap-item-header">
                <div className="gap-item-head-main">
                  <div className="gap-item-meta">
                    <span className="gap-item-index">{gapLabel}</span>
                    <span className={`gap-sev ${sev}`}>
                      <SevIcon sev={sev} />
                      {sev.charAt(0).toUpperCase() + sev.slice(1)}
                    </span>
                  </div>
                  <h3 className="gap-title">{gap.title}</h3>
                  {gap.frameworks && gap.frameworks.length > 0 && (
                    <GapFrameworkLinks frameworks={gap.frameworks} />
                  )}
                </div>
                <button
                  type="button"
                  className="gap-queue-btn"
                  onClick={() => addToQueue([i])}
                  disabled={queued.has(i) || queueing === i}
                >
                  {queueing === i ? "..." : queued.has(i) ? "Queued" : "Queue"}
                </button>
              </div>
              <div className="gap-item-body">
                {(gap.detail || gap.description) && (
                  <section className="gap-section gap-section--issue">
                    <div className="gap-section-label">Gap</div>
                    <p className="gap-detail">{gap.detail || gap.description}</p>
                  </section>
                )}
                {steps.length > 0 && (
                  <section className="gap-section gap-section--remediation">
                    <div className="gap-section-label">Proposed remediation</div>
                    <ol className="gap-remediation-steps">
                      {steps.map((step, si) => (
                        <li key={si}>{step}</li>
                      ))}
                    </ol>
                  </section>
                )}
                <GapChat
                  gap={{
                    title:              gap.title,
                    severity:           gap.severity,
                    detail:             gap.detail || gap.description,
                    frameworks:         gap.frameworks,
                    remediation_steps:  gap.remediation,
                  }}
                  assessmentId={assessmentId}
                  gapKey={idInfo.gap_key}
                  initialMessages={lookupGapChat(gapChats, idInfo.gap_key, [String(i)])}
                  onMessagesChange={msgs => onGapChatsUpdate?.(idInfo.gap_key, msgs)}
                />
              </div>
            </div>
            );
          })
          )}
        </div>
      )}

      {tab === "frameworks" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {frameworks.length === 0 && (
            isProcessing ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                <span className="loading-dot" />
                <span className="loading-dot" />
                <span className="loading-dot" />
                <span style={{ fontSize: 12, color: "var(--fg3)" }}>
                  Identifying applicable frameworks...
                </span>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: "var(--fg3)" }}>No frameworks listed.</p>
            )
          )}
          {frameworks.map(f => {
            const entry = resolveCatalogEntryForFrameworkRef(f);
            const label = entry?.abbr ?? f;
            const content = (
              <div style={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                padding: "8px 12px",
                borderRadius: 6,
                border: "0.5px solid var(--bdr)",
                background: "var(--card2)",
              }}>
                <span style={{
                  fontSize: 11,
                  color: "var(--fg2)",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                }}>
                  {label}
                </span>
                {entry && entry.name !== label && (
                  <span style={{ fontSize: 12, color: "var(--fg)" }}>{entry.name}</span>
                )}
                {entry && (
                  <span style={{ fontSize: 11, color: "var(--fg3)" }}>
                    {entry.jurisdictionLabel}
                    {entry.status ? ` · ${CATALOG_STATUS_LABELS[entry.status]}` : ""}
                  </span>
                )}
              </div>
            );
            return entry?.sourceUrl ? (
              <a
                key={f}
                href={entry.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, textDecoration: "none", width: "fit-content" }}
              >
                {content}
                <span style={{ fontSize: 10, color: "var(--accent)", fontFamily: "'Sora', sans-serif" }}>
                  Source
                </span>
              </a>
            ) : (
              <div key={f}>{content}</div>
            );
          })}
        </div>
      )}

      <div className="section-divider" />

      <div className="result-actions">
        {ordered.length > 0 && a.id && !queuedAll && (
          <button
            type="button"
            className="result-action"
            onClick={() => addToQueue(ordered.map((_, i) => i))}
            disabled={queueing !== null}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: queueing !== null ? "not-allowed" : "pointer" }}
          >
            {queueing === -1 ? "Queueing..." : "Queue all gaps"}
          </button>
        )}
        {queuedAll && (
          <span className="result-action" style={{ color: "var(--rl)", fontSize: 11 }}>All gaps queued</span>
        )}
        <button type="button" className="result-action" onClick={() => exportAssessment(a)} style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <Download size={11} strokeWidth={2} /> Export
        </button>
        <button type="button" className="result-action" onClick={() => router.push("/history")} style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <History size={11} strokeWidth={2} /> View history
        </button>
        <button type="button" className="result-action" onClick={onNew} style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <SquarePen size={11} strokeWidth={2} /> New assessment
        </button>
      </div>
    </div>
  );
}

function updateLastMessage(
  prev: Message[],
  role: "thinking" | "chat",
  update: Partial<Extract<Message, { role: typeof role }>>,
): Message[] {
  const next = [...prev];
  const idx  = next.findLastIndex(m => m.role === role);
  if (idx >= 0) next[idx] = { ...next[idx], ...update } as Message;
  return next;
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}

function Home() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const folderId     = searchParams.get("folder");
  const monitorId    = searchParams.get("monitor");

  const [messages,      setMessages]      = useState<Message[]>([]);
  const [input,         setInput]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [loadingSaved,  setLoadingSaved]  = useState(false);
  const [error,         setError]         = useState("");
  const [contractText,  setContractText]  = useState("");
  const [contractName,  setContractName]  = useState("");
  const [fileExtracting, setFileExtracting] = useState(false);
  const [fileError,      setFileError]      = useState("");
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [docCatalog, setDocCatalog]       = useState<Record<string, string>>({});
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [domains,       setDomains]       = useState<string[]>([]);
  const [dataTypes,     setDataTypes]     = useState<string[]>([]);
  const [sector,        setSector]        = useState<string[]>([]);
  const [assessmentId,  setAssessmentId]  = useState<string | null>(null);
  const [gapChats,      setGapChats]      = useState<Record<string, GapChatMessage[]>>({});
  const [priorNoraChat, setPriorNoraChat] = useState<NoraChatMessage[]>([]);

  const [pendingDesc, setPendingDesc] = useState("");
  const [guidedActive, setGuidedActive] = useState(false);
  const [guidedAnswers, setGuidedAnswers] = useState<AssessmentAnswers>({});
  const [guidedMultiSelections, setGuidedMultiSelections] = useState<string[]>([]);
  const [activeGuidedQuestionId, setActiveGuidedQuestionId] = useState<string | null>(null);
  const [guidedTyping, setGuidedTyping] = useState(false);
  const [assessmentStreamText, setAssessmentStreamText] = useState("");
  const [preScopePhase, setPreScopePhase] = useState<"chat" | "confirm" | null>("chat");

  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const scrollRef      = useRef<HTMLDivElement>(null);
  const fileRef        = useRef<HTMLInputElement>(null);
  const followUpRef    = useRef<(text: string) => Promise<string | null>>(async () => null);
  const handleSendRef  = useRef<(text: string) => Promise<string | null>>(async () => null);
  const typewriterRef  = useRef<TypewriterDrain | null>(null);
  const assessingRef   = useRef(false);
  const assessGapAnchoredRef = useRef(false);
  const assessScrollLockedRef = useRef(false);
  const prevAssessmentStatusRef = useRef<string | undefined>(undefined);
  const monitorBootRef          = useRef(false);

  function resetAssessmentScroll() {
    assessGapAnchoredRef.current = false;
    assessScrollLockedRef.current = false;
  }

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) {
      if (searchParams.get("monitor") || monitorBootRef.current) return;
      setMessages([]);
      setError("");
      setAssessmentId(null);
      setGapChats({});
      const handoff = consumeNoraCassiusHandoff();
      if (handoff.length > 0) {
        setPriorNoraChat(handoff);
        setGuidedActive(false);
        setActiveGuidedQuestionId(null);
        setGuidedTyping(false);
        const noraThread: Message[] = handoff.map((entry) => ({
          role: "nora",
          content: `${entry.role === "assistant" ? "Nora" : "You"}: ${entry.content}`,
        }));
        setMessages(noraThread);
      } else {
        setPriorNoraChat([]);
      }
      setPreScopePhase("chat");
      setPendingDesc("");
      return;
    }

    setLoadingSaved(true);
    setError("");

    fetch(`/api/assessments?id=${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        if (!d.assessment) throw new Error("Assessment not found");
        setAssessmentId(id);
        setGapChats(d.assessment.gap_chats ?? {});
        if (Array.isArray(d.assessment.domains)) setDomains(d.assessment.domains);
        if (Array.isArray(d.assessment.prior_nora_chat)) {
          setPriorNoraChat(d.assessment.prior_nora_chat);
        } else {
          setPriorNoraChat([]);
        }
        setMessages(restoreMessages(d.assessment));
        const status = (d.assessment.result as Assessment | undefined)?.status;
        if (status === "processing") setLoading(true);
      })
      .catch((e: unknown) => {
        setMessages([]);
        setPriorNoraChat([]);
        setError(e instanceof Error ? e.message : "Failed to load assessment");
      })
      .finally(() => setLoadingSaved(false));
  }, [searchParams]);

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) return;

    const assistant = [...messages].reverse().find(
      (m): m is Extract<Message, { role: "assistant" }> => m.role === "assistant",
    );
    if (assistant?.assessment.status !== "processing") return;

    const poll = () => {
      fetch(`/api/assessments?id=${id}`)
        .then(r => r.json())
        .then(d => {
          if (!d.assessment) return;
          setGapChats(d.assessment.gap_chats ?? {});
          setMessages(restoreMessages(d.assessment));
          const status = (d.assessment.result as Assessment | undefined)?.status;
          if (status && status !== "processing") {
            setLoading(false);
            setError("");
          }
        })
        .catch(() => {});
    };

    const timer = setInterval(poll, 3000);
    return () => clearInterval(timer);
  }, [searchParams, messages]);

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
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  const hasAssessment   = messages.some(m => m.role === "assistant");
  const latestAssessment = [...messages].reverse().find(
    (m): m is Extract<Message, { role: "assistant" }> => m.role === "assistant",
  )?.assessment;
  const assessmentInProgress = latestAssessment?.status === "processing";
  const showAssessmentScrollHint = Boolean(
    loading &&
    assessmentInProgress &&
    ((latestAssessment?.gaps?.length ?? 0) > 0 || assessmentStreamText.includes("GAP ")),
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const streamingAssessment = loading && (
      assessmentStreamText.length > 0 || assessmentInProgress
    );

    if (streamingAssessment) {
      const parts = splitAssessmentStream(assessmentStreamText);
      const hasFirstGap = Boolean(parts.gaps) || (latestAssessment?.gaps?.length ?? 0) > 0;

      if (hasFirstGap && !assessGapAnchoredRef.current) {
        assessGapAnchoredRef.current = true;
        assessScrollLockedRef.current = true;
        requestAnimationFrame(() => {
          el.querySelector(".assessment-gaps-section")
            ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
        return;
      }

      if (assessScrollLockedRef.current) return;

      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      return;
    }

    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading, guidedTyping, assessmentStreamText, assessmentInProgress, latestAssessment?.gaps?.length]);

  useEffect(() => {
    const status = latestAssessment?.status;
    const prev = prevAssessmentStatusRef.current;
    if (prev === "processing" && status && status !== "processing") {
      requestAnimationFrame(() => {
        scrollRef.current?.querySelector(".assessment-card")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      assessScrollLockedRef.current = false;
    }
    prevAssessmentStatusRef.current = status;
  }, [latestAssessment?.status]);

  const firstDisclaimerIndex = messages.findIndex(m =>
    m.role === "nora"
    || m.role === "chat"
    || (m.role === "thinking" && !!m.text && !m.status),
  );

  function clearAll() {
    setJurisdictions([]);
    setDomains([]);
    setDataTypes([]);
    setSector([]);
  }

  function startNew() {
    setMessages([]);
    setInput("");
    setError("");
    clearAll();
    setContractText("");
    setContractName("");
    setSelectedDocumentIds([]);
    setAssessmentId(null);
    setGapChats({});
    setPriorNoraChat([]);
    clearNoraCassiusHandoff();
    setPendingDesc("");
    setGuidedActive(false);
    setGuidedAnswers({});
    setGuidedMultiSelections([]);
    setActiveGuidedQuestionId(null);
    setGuidedTyping(false);
    setAssessmentStreamText("");
    setPreScopePhase("chat");
    resetAssessmentScroll();
    typewriterRef.current?.reset();
    monitorBootRef.current = false;
    router.push("/assess");
  }

  const buildTagsFromValues = (
    guidedJurisdictions: string[],
    guidedDomains: string[],
    guidedDataTypes: string[],
    guidedSector: string,
  ) => [
    ...guidedJurisdictions.map(v => jurisdictionLabel(v)),
    ...guidedDomains.map(v => DOMAIN_OPTIONS.find(x => x.value === v)?.label ?? v),
    ...guidedDataTypes.map(v => DATA_TYPE_OPTIONS.find(x => x.value === v)?.label ?? v),
    ...(guidedSector ? [SECTOR_OPTIONS.find(x => x.value === guidedSector)?.label ?? guidedSector] : []),
  ];

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    setContractName(file.name);
    setFileExtracting(true);
    setFileError("");

    try {
      const form = new FormData();
      form.append("file", file);
      const res  = await fetch("/api/documents/extract", { method: "POST", body: form });
      const data = await res.json() as { text?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not read file");
      setContractText(data.text ?? "");
    } catch (err: unknown) {
      setContractText("");
      setContractName("");
      setFileError(err instanceof Error ? err.message : "Could not read file");
    } finally {
      setFileExtracting(false);
    }
  };

  const activeGuidedQuestion = activeGuidedQuestionId
    ? ASSESSMENT_QUESTIONS.find(q => q.id === activeGuidedQuestionId) ?? null
    : null;

  const canSend = hasAssessment
    ? input.trim().length > 2 && !loading
    : guidedActive
    ? activeGuidedQuestion?.type === "text" && input.trim().length > 0 && !loading
    : preScopePhase === "confirm"
    ? input.trim().length > 0 && !loading
    : input.trim().length > 0 && !loading;

  const showSendButton = input.trim().length > 0 || loading;

  const isMobileView = useIsMobile();

  const hideMobileGuidedComposer = isMobileView
    && guidedActive
    && !!activeGuidedQuestion
    && activeGuidedQuestion.type !== "text";

  const presentAssessmentConfirmation = () => {
    const fullText = buildAssessmentConfirmationText();
    typewriterRef.current?.reset();
    setGuidedTyping(true);

    setMessages(prev => {
      const filtered = prev.filter(m => !(m.role === "thinking" && (m.isFollowUp || m.assessmentConfirm)));
      return [...filtered, {
        role:              "thinking",
        text:              "",
        isFollowUp:        true,
        assessmentConfirm: true,
        followUpOptions:   [...ASSESSMENT_CONFIRM_OPTIONS],
      }];
    });

    typewriterRef.current = createTypewriterDrain(ch => {
      setMessages(prev => {
        const next = [...prev];
        const idx  = next.findLastIndex(m => m.role === "thinking" && m.assessmentConfirm);
        if (idx >= 0) {
          const msg = next[idx] as Extract<Message, { role: "thinking" }>;
          next[idx] = { ...msg, text: msg.text + ch };
        }
        return next;
      });
    }, () => setGuidedTyping(false));

    typewriterRef.current.enqueue(fullText);
  };

  const handlePreScopeChat = async (text: string): Promise<string | null> => {
    const threadDesc = buildConversationDescription(messages, text);
    if (threadDesc) setPendingDesc(threadDesc);

    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);
    setMessages(prev => [...prev, { role: "chat", text: "" }]);

    typewriterRef.current?.reset();
    typewriterRef.current = createTypewriterDrain(ch => {
      setMessages(prev => {
        const next = [...prev];
        const idx  = next.findLastIndex(m => m.role === "chat");
        if (idx >= 0) {
          const msg = next[idx] as Extract<Message, { role: "chat" }>;
          next[idx] = { ...msg, text: msg.text + ch };
        }
        return next;
      });
    });

    const history: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of messages) {
      if (m.role === "user") history.push({ role: "user", content: m.content });
      else if (m.role === "chat" && m.text) history.push({ role: "assistant", content: m.text });
      else if (m.role === "nora") history.push({ role: "assistant", content: m.content });
    }
    history.push({ role: "user", content: text });

    let chatText = "";
    try {
      const res = await fetch("/api/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: history, mode: "cassius_prescope" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Chat failed");
      }
      await readSSEStream(res, event => {
        if (event.type === "token") {
          chatText += event.text ?? "";
          typewriterRef.current?.enqueue(event.text ?? "");
        } else if (event.type === "error") {
          throw new Error(event.text);
        }
      });
      return chatText || null;
    } catch (e: unknown) {
      typewriterRef.current?.reset();
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages(prev => prev.filter(m => m.role !== "chat" || m.text));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleAssessmentConfirm = async (
    label: string,
    userAlreadyAdded = false,
    descOverride?: string,
  ): Promise<string | null> => {
    setMessages(prev => {
      const filtered = prev.filter(m => !(m.role === "thinking" && m.assessmentConfirm));
      return userAlreadyAdded
        ? filtered
        : [...filtered, { role: "user", content: label }];
    });

    if (label === ASSESSMENT_CONFIRM_YES) {
      setPreScopePhase(null);
      const desc = (descOverride ?? pendingDesc).trim();
      if (!desc) return null;
      setPendingDesc(desc);
      return startGuidedAssessment(desc, { skipUserBubble: true });
    }

    setPreScopePhase("chat");
    setPendingDesc("");
    const reply = "No problem — tell me more about what you're working on. When you're ready for a formal assessment, just describe it and we'll take it from there.";
    setMessages(prev => [...prev, { role: "chat", text: reply }]);
    return reply;
  };

  const handleAssessmentConfirmText = async (text: string): Promise<string | null> => {
    setMessages(prev => [...prev, { role: "user", content: text }]);
    if (isAffirmativeAssessmentConfirm(text)) {
      return handleAssessmentConfirm(ASSESSMENT_CONFIRM_YES, true);
    }
    if (isNegativeAssessmentConfirm(text)) {
      return handleAssessmentConfirm(ASSESSMENT_CONFIRM_NOT_YET, true);
    }
    setError("Please choose Yes or Not yet above, or reply with yes/no.");
    return null;
  };

  const voice = useVoice({
    onVoiceSend: text => handleSendRef.current(text),
    disabled: loading,
  });

  const useFollowUpExamples = hasAssessment && !!(latestAssessment?.gaps?.length);

  const examplesControl = (
    <SampleQuestionsDropdown
      context={useFollowUpExamples ? "assessment-followup" : "assess"}
      variant="icon"
      menuPlacement="top"
      onSelect={q => { void sendWithVoice(q); }}
      disabled={loading}
      payload={useFollowUpExamples ? {
        gaps: latestAssessment!.gaps ?? [],
        assessmentTitle: latestAssessment!.title,
      } : undefined}
    />
  );

  const presentGuidedQuestion = (question: AssessmentQuestion, intro?: string) => {
    setActiveGuidedQuestionId(question.id);
    if (question.type === "multi") setGuidedMultiSelections([]);

    const fullText = [intro, formatGuidedQuestionText(question)].filter(Boolean).join("\n\n");

    typewriterRef.current?.reset();
    setGuidedTyping(true);

    setMessages(prev => {
      const filtered = prev.filter(m => !(m.role === "thinking" && (m.isFollowUp || m.guidedText || m.guidedQuestionId)));
      return [...filtered, {
        role:             "thinking",
        text:             "",
        isFollowUp:       question.type !== "text",
        followUpOptions:  guidedQuestionOptions(question),
        guidedQuestionId: question.id,
        guidedMulti:      question.type === "multi",
        guidedText:       question.type === "text",
        riskTag:          question.riskTag,
      }];
    });

    typewriterRef.current = createTypewriterDrain(ch => {
      setMessages(prev => {
        const next = [...prev];
        const idx  = next.findLastIndex(m =>
          m.role === "thinking" && m.guidedQuestionId === question.id,
        );
        if (idx >= 0) {
          const msg = next[idx] as Extract<Message, { role: "thinking" }>;
          next[idx] = { ...msg, text: msg.text + ch };
        }
        return next;
      });
    }, () => setGuidedTyping(false));

    typewriterRef.current.enqueue(fullText);
  };

  const completeGuidedAssessment = async (answers: AssessmentAnswers) => {
    if (assessingRef.current) return;
    assessingRef.current = true;

    setGuidedActive(false);
    setActiveGuidedQuestionId(null);
    setGuidedTyping(false);
    typewriterRef.current?.reset();
    const { prompt, userMessage, meta } = buildAssessmentRequest(answers, pendingDesc);

    const guidedDomains       = (meta.domains ?? []).map(mapQuestionnaireDomain);
    const guidedJurisdictions = normalizeJurisdictionList(meta.jurisdictions ?? []);
    const guidedDataTypes     = meta.data_types ?? [];
    const guidedSector        = meta.sector ?? "";

    setDomains(guidedDomains);
    setJurisdictions(guidedJurisdictions);
    setDataTypes(guidedDataTypes);
    setSector(guidedSector ? [guidedSector] : []);

    const tags = buildTagsFromValues(guidedJurisdictions, guidedDomains, guidedDataTypes, guidedSector);
    setMessages(prev => prev.filter(m => m.role !== "thinking" || !!m.status));

    try {
      await runAssessment(
        prompt,
        tags,
        guidedDomains,
        guidedJurisdictions,
        guidedDataTypes,
        guidedSector,
        folderId,
        { guidedScoping: true, userMessage, priorNoraChat },
      );
    } finally {
      assessingRef.current = false;
    }
  };

  const commitGuidedAnswer = (questionId: string, value: string | string[], userLabel: string) => {
    setGuidedAnswers(prev => {
      const nextAnswers = { ...prev, [questionId]: value };
      setMessages(msgs => [
        ...msgs.filter(m => !(m.role === "thinking" && (m.isFollowUp || m.guidedText || m.guidedQuestionId))),
        { role: "user", content: userLabel },
      ]);
      setGuidedMultiSelections([]);
      const nextQ = getNextAssessmentQuestion(nextAnswers);
      if (!nextQ) {
        void completeGuidedAssessment(nextAnswers);
      } else {
        presentGuidedQuestion(nextQ);
      }
      return nextAnswers;
    });
  };

  const handleGuidedOption = (optionLabel: string) => {
    const question = activeGuidedQuestion;
    if (!question) return;

    if (question.type === "multi") {
      if (optionLabel === "Continue") {
        if (question.required && guidedMultiSelections.length === 0) return;
        const labels = guidedMultiSelections.map(value =>
          question.options?.find(o => o.value === value)?.label ?? value,
        );
        commitGuidedAnswer(question.id, guidedMultiSelections, labels.join(", ") || "Continue");
        return;
      }
      const opt = question.options?.find(o => o.label === optionLabel);
      if (!opt) return;
      setGuidedMultiSelections(prev =>
        prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value],
      );
      return;
    }

    const opt = question.options?.find(o => o.label === optionLabel);
    commitGuidedAnswer(question.id, opt?.value ?? optionLabel, optionLabel);
  };

  const handleGuidedTextAnswer = (text: string) => {
    const question = activeGuidedQuestion;
    if (!question) return null;

    if (question.type === "text") {
      commitGuidedAnswer(question.id, text, text);
      return null;
    }

    if (question.type === "single") {
      const opt = question.options?.find(
        o => o.label.toLowerCase() === text.toLowerCase() || o.label.toLowerCase().includes(text.toLowerCase()),
      );
      commitGuidedAnswer(question.id, opt?.value ?? text, opt?.label ?? text);
      return null;
    }

    return null;
  };

  const startGuidedAssessment = async (
    text: string,
    opts?: { skipUserBubble?: boolean; intro?: string },
  ): Promise<string | null> => {
    if (!opts?.skipUserBubble) {
      setMessages(prev => [...prev, { role: "user", content: text }]);
    }
    setPendingDesc(text);
    setGuidedActive(true);
    setGuidedAnswers({});
    setGuidedMultiSelections([]);
    setActiveGuidedQuestionId(null);
    setPreScopePhase(null);
    setError("");

    const answers: AssessmentAnswers = {};
    const nextQ = getNextAssessmentQuestion(answers);
    if (!nextQ) {
      await completeGuidedAssessment(answers);
      return null;
    }

    const intro = opts?.intro ?? buildAssessmentScopingIntroText();

    presentGuidedQuestion(nextQ, intro);
    return `${intro}\n\n${formatGuidedQuestionText(nextQ)}`;
  };

  const runAssessment = async (
    text: string,
    tags: string[],
    resolvedDomains: string[],
    resolvedJurisdictions: string[],
    resolvedDataTypes: string[],
    resolvedSector: string,
    folderId?: string | null,
    opts?: { guidedScoping?: boolean; userMessage?: string; priorNoraChat?: NoraChatMessage[] },
  ): Promise<string | null> => {
    setMessages(prev => [...prev, { role: "thinking", text: "", status: "Retrieving regulations..." }]);
    setLoading(true);
    setGuidedTyping(false);
    setAssessmentStreamText("");
    resetAssessmentScroll();

    typewriterRef.current?.reset();
    typewriterRef.current = createTypewriterDrain(ch => {
      setAssessmentStreamText(prev => prev + ch);
      setMessages(prev => {
        const next = [...prev];
        const idx  = next.findLastIndex(m => m.role === "thinking");
        if (idx >= 0 && !next.some(m => m.role === "assistant")) {
          const msg = next[idx] as Extract<Message, { role: "thinking" }>;
          next[idx] = { ...msg, text: msg.text + ch, status: undefined };
        }
        return next;
      });
    });

    let streamingText = "";
    let summaryText = "";
    let receivedDone    = false;
    let receivedStarted = false;
    try {
      const res = await fetch("/api/assess", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description:   text,
          user_message:  opts?.userMessage ?? text,
          domains:       resolvedDomains,
          jurisdictions: resolvedJurisdictions,
          data_types:    resolvedDataTypes,
          sector:        resolvedSector,
          contract_text: contractText || undefined,
          document_ids:  selectedDocumentIds.length ? selectedDocumentIds : undefined,
          tags,
          folder_id:     folderId || undefined,
          guided_scoping: opts?.guidedScoping ?? false,
          prior_nora_chat: opts?.priorNoraChat ?? priorNoraChat,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Assessment failed");
      }
      let showCard        = false;
      const scopedForRun  = normalizeScopedRiskDomains(resolvedDomains);

      const decorateAssessment = (assessment: Assessment): Assessment => {
        const scoped = assessment.scoped_domains?.length
          ? assessment.scoped_domains
          : scopedForRun;
        return {
          ...assessment,
          scoped_domains: scoped.length ? scoped : assessment.scoped_domains,
          risk_by_domain: filterRiskByScopedDomains(assessment.risk_by_domain, scoped),
        };
      };

      const applyAssessment = (assessment: Assessment) => {
        const decorated = decorateAssessment(assessment);
        setMessages(prev => {
          const next = prev.filter(m => !(m.role === "thinking" && !m.isFollowUp && !m.guidedQuestionId));
          const idx  = next.findLastIndex(m => m.role === "assistant");
          if (idx >= 0) next[idx] = { role: "assistant", assessment: decorated };
          else next.push({ role: "assistant", assessment: decorated });
          return next;
        });
      };

      await readSSEStream(res, (event) => {
        const ev = event as SSEEvent;
        if (ev.type === "ping") return;

        if (ev.type === "started") {
          receivedStarted = true;
          showCard = true;
          const assessment = ev.assessment;
          if (ev.assessment_id) {
            setAssessmentId(ev.assessment_id);
            router.replace(`/assess?id=${ev.assessment_id}`, { scroll: false });
            window.dispatchEvent(new Event("norvar:assessments-updated"));
          }
          if (assessment) {
            applyAssessment({
              ...assessment,
              id: ev.assessment_id ?? assessment.id,
              gaps: assessment.gaps ?? [],
              status: assessment.status ?? "processing",
            });
          }
          return;
        }

        if (ev.type === "status") {
          if (!showCard) setMessages(prev => updateLastMessage(prev, "thinking", { status: ev.text }));
          return;
        }

        if (ev.type === "token") {
          streamingText += ev.text ?? "";
          typewriterRef.current?.enqueue(ev.text ?? "");
          return;
        }

        if (ev.type === "summary") {
          const summary = ev.text ?? "";
          summaryText = summary;
          const delta = summary.slice(streamingText.length);
          streamingText = summary;
          if (delta) typewriterRef.current?.enqueue(delta);
          return;
        }

        if (ev.type === "gap") {
          showCard = true;
          if (ev.assessment) {
            applyAssessment(ev.assessment);
          }
          typewriterRef.current?.enqueue(formatGapStreamText(ev.gap, ev.index));
          return;
        }

        if (ev.type === "done" || ev.type === "saved") {
          receivedDone = ev.type === "done" ? true : receivedDone;
          if (ev.type === "done") {
            typewriterRef.current?.reset();
            setAssessmentStreamText("");
          }
          const assessment = ev.assessment;
          if (!assessment) throw new Error("Assessment failed");
          if (assessment.id) setAssessmentId(assessment.id);
          summaryText = assessment.summary || summaryText || streamingText;

          if (ev.type === "done") {
            applyAssessment({ ...assessment, status: assessment.status ?? "complete" });
            clearNoraCassiusHandoff();
            setPriorNoraChat([]);
            clearAll();
            setContractText("");
            setContractName("");
            setSelectedDocumentIds([]);
            setPendingDesc("");
            setGuidedActive(false);
            setGuidedAnswers({});
            setGuidedMultiSelections([]);
            setActiveGuidedQuestionId(null);
            window.dispatchEvent(new Event("norvar:assessments-updated"));
          } else if (ev.type === "saved") {
            applyAssessment(assessment);
          }
          return;
        }

        if (ev.type === "warning") {
          setError(ev.text ?? "Assessment saved with warnings.");
          return;
        }

        if (ev.type === "error") {
          if (receivedStarted) {
            setError(ev.text ?? "Assessment interrupted. Showing saved progress.");
            return;
          }
          throw new Error(ev.text);
        }
      });

      if (!receivedDone && !receivedStarted) {
        throw new Error("Assessment did not complete. The connection may have timed out — please try again.");
      }
      if (!receivedDone && receivedStarted) {
        setError("Connection interrupted. Resuming from your saved assessment...");
      }
    } catch (e: unknown) {
      typewriterRef.current?.reset();
      if (!receivedStarted) {
        setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
        setMessages(prev => prev.filter(m => m.role !== "thinking"));
      } else {
        setError(e instanceof Error ? e.message : "Assessment interrupted. Showing saved progress.");
      }
      return null;
    } finally {
      if (receivedDone) setLoading(false);
    }

    return summaryText.trim() || null;
  };

  const startFromMonitoringSignal = async (signalId: string) => {
    const res = await fetch(`/api/monitor/signals?signal=${encodeURIComponent(signalId)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.signal) {
      throw new Error(data.error || "Monitoring alert not found");
    }

    const signal = data.signal as MonitoringInquirySignal;
    const desc = buildMonitoringAssessmentDescription(signal);
    const resolvedDomains = mapMonitoringDomainsToAssessment(signal.domains ?? []);

    setError("");
    setPendingDesc(desc);
    setPreScopePhase(null);
    setGuidedActive(false);
    setActiveGuidedQuestionId(null);
    setGuidedTyping(false);
    clearAll();
    if (resolvedDomains.length) setDomains(resolvedDomains);

    const tags = buildTagsFromValues([], resolvedDomains, [], "");

    setMessages([{
      role: "user",
      content: `Run a compliance assessment for monitoring alert: ${signal.title}`,
    }]);

    await runAssessment(
      desc,
      tags,
      resolvedDomains,
      [],
      [],
      "",
      folderId,
      { guidedScoping: false, userMessage: desc },
    );
  };

  const startMonitoringAssessmentRef = useRef(startFromMonitoringSignal);
  startMonitoringAssessmentRef.current = startFromMonitoringSignal;

  useEffect(() => {
    if (!monitorId || searchParams.get("id") || monitorBootRef.current) return;

    monitorBootRef.current = true;
    setError("");

    void (async () => {
      try {
        await startMonitoringAssessmentRef.current(monitorId);
        router.replace("/assess", { scroll: false });
      } catch (e: unknown) {
        monitorBootRef.current = false;
        setError(e instanceof Error ? e.message : "Could not start assessment from monitoring alert");
        router.replace("/assess", { scroll: false });
      }
    })();
  }, [monitorId, router, searchParams]);

  const handleAssessment = async (text: string): Promise<string | null> => {
    const priorDesc = buildConversationDescription(messages);
    const fullDesc = buildConversationDescription(messages, text);

    if (fullDesc) setPendingDesc(fullDesc);

    if (preScopePhase === "chat" && priorDesc && isAffirmativeAssessmentConfirm(text)) {
      setMessages(prev => [...prev, { role: "user", content: text }]);
      setPendingDesc(priorDesc);
      return handleAssessmentConfirm(ASSESSMENT_CONFIRM_YES, true, priorDesc);
    }

    if (
      looksLikeAssessmentDescription(text)
      || conversationLooksLikeAssessment(messages, text)
    ) {
      setMessages(prev => [...prev, { role: "user", content: text }]);
      setPendingDesc(fullDesc || text);
      setPreScopePhase("confirm");
      presentAssessmentConfirmation();
      return buildAssessmentConfirmationText();
    }

    setPreScopePhase("chat");
    return handlePreScopeChat(text);
  };

  const handleFollowUp = async (text: string): Promise<string | null> => {
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);
    setMessages(prev => [...prev, { role: "chat", text: "" }]);

    typewriterRef.current?.reset();
    typewriterRef.current = createTypewriterDrain(ch => {
      setMessages(prev => {
        const next = [...prev];
        const idx  = next.findLastIndex(m => m.role === "chat");
        if (idx >= 0) {
          const msg = next[idx] as Extract<Message, { role: "chat" }>;
          next[idx] = { ...msg, text: msg.text + ch };
        }
        return next;
      });
    });

    const history: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of messages) {
      if (m.role === "user") {
        history.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        const a = m.assessment;
        history.push({
          role: "assistant",
          content: `[Compliance Assessment] ${a.title}. Risk: ${normalizeRiskTier(a.risk_tier ?? a.risk_score?.tier ?? a.risk ?? "low")}. ${a.summary} Key gaps: ${(a.gaps || []).slice(0, 3).map(g => `${normalizeGapSeverity(g.severity)}: ${g.title}`).join("; ")}.`,
        });
      } else if (m.role === "chat" && m.text) {
        history.push({ role: "assistant", content: m.text });
      }
    }
    history.push({ role: "user", content: text });

    let chatText = "";

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history,
          assessment_id: assessmentId,
          new_user_message: text,
          document_ids: selectedDocumentIds.length ? selectedDocumentIds : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Chat failed");
      }

      await readSSEStream(res, (event) => {
        if (event.type === "token") {
          chatText += event.text ?? "";
          typewriterRef.current?.enqueue(event.text ?? "");
        } else if (event.type === "done") {
          const messageId = (event as { message_id?: string }).message_id;
          if (messageId) {
            setMessages(prev => {
              const next = [...prev];
              const idx = next.findLastIndex(m => m.role === "chat");
              if (idx >= 0) {
                const msg = next[idx] as Extract<Message, { role: "chat" }>;
                next[idx] = { ...msg, text: chatText || msg.text, id: messageId };
              }
              return next;
            });
          }
        } else if (event.type === "error") {
          throw new Error(event.text);
        }
      });

      return chatText || null;
    } catch (e: unknown) {
      typewriterRef.current?.reset();
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages(prev => prev.filter(m => m.role !== "chat" || m.text));
      return null;
    } finally {
      setLoading(false);
    }
  };

  followUpRef.current = handleFollowUp;

  const handleSend = async (textOverride?: string, fromVoice = false): Promise<string | null> => {
    const text = (textOverride ?? input).trim();
    const minLen = fromVoice ? 1 : 1;
    if (text.length < minLen) return null;
    if (!fromVoice && loading) return null;
    if (!textOverride) setInput("");
    setError("");

    if (hasAssessment) {
      if (text.length < 3) return null;
      return handleFollowUp(text);
    }
    if (guidedActive) {
      return handleGuidedTextAnswer(text);
    }
    if (preScopePhase === "confirm") {
      return handleAssessmentConfirmText(text);
    }
    return handleAssessment(text);
  };

  handleSendRef.current = (text: string) => handleSend(text, true);

  const sendWithVoice = async (text?: string) => {
    const response = await handleSend(text, false);
    if (response) voice.speakAfterResponse(response);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendWithVoice(); }
  };

  const isHome = messages.length === 0 && !loading && !loadingSaved;

  const threadLayoutClass = !isHome && !loadingSaved && isMobileView
    ? ` mobile-thread-layout${hideMobileGuidedComposer ? " mobile-thread-layout--guided-options" : ""}`
    : "";

  const hasAttachedDocs = !!contractName || selectedDocumentIds.length > 0;

  const guidedComposerPlaceholder = hasAssessment
    ? "Follow-up question?"
    : guidedActive && activeGuidedQuestion?.type === "text"
    ? "Type your answer..."
    : guidedActive
    ? "Select an option above..."
    : preScopePhase === "confirm"
    ? "Reply yes or no, or use the buttons above..."
    : "Follow-up question?";

  const attachControl = (
    <DocumentPicker
      selectedIds={selectedDocumentIds}
      onChange={setSelectedDocumentIds}
      folderId={folderId}
      disabled={loading || fileExtracting}
      variant="icon"
      onUpload={() => fileRef.current?.click()}
      uploading={fileExtracting}
      uploadAttached={!!contractName}
    />
  );

  const voiceControl = (
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
      agentName={ASSESS_AGENT.name}
    />
  );

  const threadVoiceControl = (
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
      agentName={ASSESS_AGENT.name}
    />
  );

  const attachedDocsHeader = hasAttachedDocs ? (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8, padding: isMobileView ? undefined : "0 2px" }}>
      <SelectedDocumentChips
        documents={selectedDocumentIds.map(id => ({ id, name: docCatalog[id] ?? "Document" }))}
        onRemove={id => setSelectedDocumentIds(prev => prev.filter(x => x !== id))}
      />
      {contractName && (
        <span style={{ fontSize: 11, color: "var(--fg2)", background: "var(--card2)", padding: "2px 9px", borderRadius: 20, border: "0.5px solid var(--bdr2)", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'Sora', sans-serif" }}>
          <FileText size={10} strokeWidth={2} />
          {contractName}
          <button type="button" onClick={() => { setContractText(""); setContractName(""); }} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
            <X size={10} strokeWidth={2} color="var(--fg3)" />
          </button>
        </span>
      )}
    </div>
  ) : undefined;

  const InputBar = (
    <HomeComposerWrap isMobileView={isMobileView}>
      <AgentComposer
        variant="home"
        mode="assess"
        attachPlacement="end"
        value={input}
        onChange={setInput}
        onKeyDown={handleKey}
        inputRef={textareaRef}
        loading={loading}
        canSend={canSend}
        onSend={() => { void sendWithVoice(); }}
        showSendButton={showSendButton}
        attachControl={attachControl}
        voiceControl={voiceControl}
        extraToolbarStart={examplesControl}
        header={attachedDocsHeader}
      />
      <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt" style={{ display: "none" }} onChange={handleFileUpload} />
      {fileError && (
        <p style={{ fontSize: 11, color: "var(--rh)", marginTop: 8, fontFamily: "'Sora', sans-serif" }}>{fileError}</p>
      )}
      {voice.voiceError && (
        <VoiceErrorBanner message={voice.voiceError} onDismiss={voice.clearError} />
      )}
    </HomeComposerWrap>
  );

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
          <div className={`main-area${threadLayoutClass}`}>

            {loadingSaved && (
              <div className={`home-body${isMobileView ? " mobile-home-layout" : ""}`}>
                <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
                  <span className="loading-dot" />
                  <span className="loading-dot" />
                  <span className="loading-dot" />
                </div>
              </div>
            )}

            {isHome && (
              <div className={`home-body${isMobileView ? " mobile-home-layout" : ""}`}>
                <HomeHero
                  isMobileView={isMobileView}
                  title="What are you building?"
                  infoTip={`Chat with ${ASSESS_AGENT.name} about your project. When you're ready, he'll confirm and ask a few scoping questions before running your assessment.`}
                />
                {InputBar}
                {error && <p style={{ marginTop: 14, fontSize: 12, color: "var(--rh)", textAlign: isMobileView ? "center" : undefined }}>{error}</p>}
              </div>
            )}

            {!isHome && !loadingSaved && (
              <>
                <div className="assessment-scroll-shell">
                <div ref={scrollRef} className="main-scroll">
                <div className="chat-scroll">
                  {messages.map((msg, i) => {
                    if (msg.role === "user") {
                      return (
                        <div key={i} className="msg-user fade-up">
                          <div>{msg.content}</div>
                          {msg.tags && msg.tags.length > 0 && (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 7 }}>
                              {msg.tags.map(t => (
                                <span key={t} style={{ fontSize: 10, color: "var(--fg3)", background: "var(--card2)", padding: "1px 7px", borderRadius: 10, border: "0.5px solid var(--bdr)", fontFamily: "'Sora', sans-serif" }}>{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (msg.role === "nora") {
                      return (
                        <div key={i} className="msg-ai fade-up">
                          <div className="msg-ai-card">
                            <div className="msg-ai-label">
                              <ShieldAlert size={11} color="var(--fg3)" />
                              Nora transcript
                            </div>
                            <FormattedMessage content={msg.content} />
                            {i === firstDisclaimerIndex && (
                              <AiDisclaimer agentName={CHAT_AGENT.name} />
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (msg.role === "thinking") {
                      const isFollowUp = msg.isFollowUp && msg.followUpOptions;
                      const isGuidedQuestion = !!msg.guidedQuestionId;
                      const isTypingGuided = isGuidedQuestion && guidedTyping && i === messages.length - 1;
                      const showFollowUpOptions = isFollowUp && msg.followUpOptions && !isTypingGuided;
                      return (
                        <div key={i} className="msg-ai fade-up">
                          <div className="msg-ai-card">
                            <div className="msg-ai-label">
                              <ShieldAlert size={11} color="var(--fg3)" />
                              {msg.status ? (
                                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <Loader2 size={11} className="spin" color="var(--fg3)" />
                                  {msg.status}
                                </span>
                              ) : isFollowUp || msg.guidedText ? ASSESS_AGENT.name : `${ASSESS_AGENT.name} is analysing...`}
                              {msg.riskTag && (
                                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--rh)", letterSpacing: ".04em", textTransform: "uppercase" }}>
                                  {msg.riskTag}
                                </span>
                              )}
                            </div>
                            {msg.text ? (
                              <p style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.7, letterSpacing: "-0.01em", whiteSpace: "pre-wrap" }}>
                                {msg.text}
                                {((!isFollowUp && loading) || isTypingGuided) && streamCursor}
                              </p>
                            ) : (
                              <div style={{ display: "flex", gap: 5, padding: "8px 0" }}>
                                <span className="loading-dot" />
                                <span className="loading-dot" />
                                <span className="loading-dot" />
                              </div>
                            )}
                            {msg.text && !msg.status && !isTypingGuided && i === firstDisclaimerIndex && (
                              <AiDisclaimer agentName={ASSESS_AGENT.name} />
                            )}
                            {showFollowUpOptions && (
                              <div className="assess-guided-options" style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                                {(msg.followUpOptions ?? []).map(opt => {
                                  const question = msg.guidedQuestionId
                                    ? ASSESSMENT_QUESTIONS.find(q => q.id === msg.guidedQuestionId)
                                    : null;
                                  const optValue = question?.options?.find(o => o.label === opt)?.value;
                                  const selected = !!(msg.guidedMulti && optValue && guidedMultiSelections.includes(optValue));
                                  const isContinue = opt === "Continue";
                                  return (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => {
                                      if (msg.assessmentConfirm) void handleAssessmentConfirm(opt);
                                      else handleGuidedOption(opt);
                                    }}
                                    style={{
                                      fontSize: 11, padding: "5px 12px", borderRadius: 16,
                                      border: selected || isContinue ? "0.5px solid var(--red)" : "0.5px solid var(--bdr2)",
                                      background: selected ? "rgba(139,26,26,0.09)" : isContinue ? "var(--lift)" : "var(--card2)",
                                      color: selected || isContinue ? "var(--fg)" : "var(--fg2)",
                                      cursor: "pointer",
                                      fontFamily: "'Sora', sans-serif",
                                      fontWeight: isContinue ? 500 : 400,
                                    }}
                                  >
                                    {opt}
                                  </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (msg.role === "assistant") {
                      const isStreaming = loading && msg.assessment.status === "processing";
                      return (
                        <div key={i} className="msg-ai">
                          <AssessmentCard
                            a={msg.assessment}
                            scopedDomains={domains}
                            onNew={startNew}
                            assessmentId={assessmentId}
                            gapChats={gapChats}
                            onGapChatsUpdate={(key, msgs) => setGapChats(prev => ({ ...prev, [key]: msgs }))}
                            streamingText={isStreaming ? assessmentStreamText : undefined}
                            streamActive={isStreaming}
                          />
                        </div>
                      );
                    }

                    if (msg.role === "chat") {
                      return (
                        <div key={i} className="msg-ai fade-up">
                          <div className="msg-ai-card">
                            <div className="msg-ai-label">
                              <ShieldAlert size={11} color="var(--fg3)" />
                              {ASSESS_AGENT.name}
                            </div>
                            <FormattedMessage content={msg.text || ""} />
                            {(loading) && i === messages.length - 1 && streamCursor}
                            {!(loading && i === messages.length - 1) && i === firstDisclaimerIndex && (
                              <AiDisclaimer agentName={ASSESS_AGENT.name} />
                            )}
                            {!(loading && i === messages.length - 1) && (
                              <MessageFeedback
                                messageId={msg.id}
                                feedback={msg.feedback}
                                disabled={loading}
                                source="assessment"
                                containerId={assessmentId}
                                messageContent={msg.text || ""}
                                userMessage={[...messages.slice(0, i)].reverse().find(m => m.role === "user")?.content}
                                agent="nora"
                                onFeedbackChange={rating => {
                                  setMessages(prev => prev.map((m, j) => (
                                    j === i && m.role === "chat" ? { ...m, feedback: rating } : m
                                  )));
                                }}
                              />
                            )}
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                  {error && <p style={{ fontSize: 12, color: "var(--rh)" }}>{error}</p>}
                </div>
                </div>
                <AssessmentScrollHint
                  containerRef={scrollRef}
                  visible={showAssessmentScrollHint}
                />
                </div>

                <div className="chat-input-row">
                  <div className="chat-input-inner">
                    <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
                    {attachedDocsHeader}
                    <AgentComposer
                      variant="thread"
                      mode="assess"
                      attachPlacement="end"
                      value={input}
                      onChange={setInput}
                      onKeyDown={handleKey}
                      inputRef={textareaRef}
                      placeholder={guidedComposerPlaceholder}
                      loading={loading}
                      canSend={canSend}
                      onSend={() => { void sendWithVoice(); }}
                      showSendButton={showSendButton}
                      attachControl={attachControl}
                      voiceControl={threadVoiceControl}
                      extraToolbarStart={examplesControl}
                    />
                    {voice.voiceError && (
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
        <LandingPage />
      </Show>
    </>
  );
}
