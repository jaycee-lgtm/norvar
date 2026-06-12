"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Show } from "@clerk/nextjs";
import Sidebar from "@/components/Sidebar";
import ModeSelector from "@/components/ModeSelector";
import LandingPage from "@/components/LandingPage";
import Logo from "@/components/Logo";
import GapChat, { type GapChatMessage } from "@/components/GapChat";
import VoiceControls, { VoiceErrorBanner } from "@/components/VoiceControls";
import { useVoice } from "@/hooks/useVoice";
import {
  ArrowUp, Globe, Layers, Database, FileText,
  Loader2, AlertTriangle, AlertCircle, Info,
  ShieldAlert, X, Check, ChevronDown, Download,
  History, SquarePen, Briefcase,
} from "lucide-react";

// ── Option sets ────────────────────────────────────────────────────────────────

const JURISDICTION_OPTIONS = [
  { value: "eu",         label: "EU / EEA"      },
  { value: "uk",         label: "UK"            },
  { value: "us_federal", label: "US Federal"    },
  { value: "us_state",   label: "US States"     },
  { value: "canada",     label: "Canada"        },
  { value: "apac",       label: "Asia-Pacific"  },
  { value: "latam",      label: "Latin America" },
  { value: "mena",       label: "MENA"          },
];

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
  severity:     "critical" | "high" | "medium" | "low";
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
  assessment_number?: string;
  gaps:            Gap[];
  frameworks?:     string[];
};

type Message =
  | { role: "user"; content: string; tags?: string[] }
  | { role: "assistant"; assessment: Assessment }
  | { role: "thinking"; text: string; status?: string; isFollowUp?: boolean; followUpOptions?: string[] }
  | { role: "chat"; text: string };

type StoredMessage =
  | { role: "user"; content: string; tags?: string[] }
  | { role: "assistant"; assessment: Assessment }
  | { role: "chat"; text: string };

function restoreMessages(
  row: {
    id: string;
    title: string;
    description: string;
    risk_tier: string;
    risk_score: number;
    result?: Assessment;
    messages?: StoredMessage[];
  },
): Message[] {
  if (Array.isArray(row.messages) && row.messages.length > 0) {
    return row.messages.flatMap((m): Message[] => {
      if (m.role === "user") {
        return [{ role: "user", content: m.content, tags: m.tags }];
      }
      if (m.role === "chat") {
        return [{ role: "chat", text: m.text }];
      }
      if (m.role === "assistant" && m.assessment) {
        const a = m.assessment;
        return [{
          role: "assistant",
          assessment: {
            ...a,
            id: row.id,
            title: a.title ?? row.title,
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
  return [
    { role: "user", content: row.description || row.title || "" },
    {
      role: "assistant",
      assessment: {
        ...result,
        id: row.id,
        title: result.title ?? row.title,
        risk_score: result.risk_score ?? {
          composite: row.risk_score,
          tier: row.risk_tier,
        },
      },
    },
  ];
}

type SSEEvent =
  | { type: "status"; text: string }
  | { type: "token"; text: string }
  | { type: "summary"; text: string }
  | { type: "done"; assessment?: Assessment; text?: string }
  | { type: "error"; text: string };

// ── Chip dropdown ──────────────────────────────────────────────────────────────

function ChipDropdown({
  icon, label, options, selected, onToggle, onClose, multi = true,
}: {
  icon:     React.ReactNode;
  label:    string;
  options:  { value: string; label: string }[];
  selected: string[];
  onToggle: (v: string) => void;
  onClose:  () => void;
  multi?:   boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={onClose}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "6px 12px", borderRadius: 20,
          border: `0.5px solid ${selected.length > 0 ? "var(--bdr3)" : "var(--bdr2)"}`,
          background: selected.length > 0 ? "var(--lift)" : "var(--card)",
          fontSize: 11, color: selected.length > 0 ? "var(--fg)" : "var(--fg2)",
          fontWeight: selected.length > 0 ? 500 : 400,
          cursor: "pointer", fontFamily: "'Sora', sans-serif", letterSpacing: "-0.01em",
        }}
      >
        {icon}
        {label}
        {selected.length > 0 && (
          <span style={{ fontSize:9, background:"var(--fg)", color:"var(--bg)", padding:"0 5px", borderRadius:10, fontWeight:600 }}>
            {selected.length}
          </span>
        )}
        <ChevronDown size={10} strokeWidth={2} />
      </button>
      <div style={{
        position: "absolute", bottom: "calc(100% + 8px)", left: 0,
        minWidth: 200, background: "var(--card)", border: "0.5px solid var(--bdr2)",
        borderRadius: 8, overflow: "hidden", zIndex: 100,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      }}>
        <div style={{
          padding: "7px 12px", borderBottom: "0.5px solid var(--bdr)",
          fontSize: 10, fontWeight: 600, letterSpacing: ".08em",
          textTransform: "uppercase" as const, color: "var(--fg3)",
          fontFamily: "'Sora', sans-serif",
        }}>{label}</div>
        {options.map(opt => (
          <button
            key={opt.value}
            type="button"
            onClick={() => { onToggle(opt.value); if (!multi) onClose(); }}
            style={{
              width: "100%", display: "flex", alignItems: "center",
              justifyContent: "space-between", padding: "8px 12px",
              background: "transparent", border: "none", fontSize: 13,
              fontFamily: "'Sora', sans-serif", letterSpacing: "-0.01em",
              cursor: "pointer", textAlign: "left" as const,
              color: selected.includes(opt.value) ? "var(--fg)" : "var(--fg2)",
              fontWeight: selected.includes(opt.value) ? 500 : 400,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--lift)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            {opt.label}
            {selected.includes(opt.value) && <Check size={13} strokeWidth={2.5} color="var(--fg3)" />}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Severity icon ──────────────────────────────────────────────────────────────

function SevIcon({ sev }: { sev: string }) {
  if (sev === "critical") return <AlertTriangle size={9} strokeWidth={2.5} />;
  if (sev === "high")     return <AlertCircle   size={9} strokeWidth={2.5} />;
  return <Info size={9} strokeWidth={2.5} />;
}

// ── Export ─────────────────────────────────────────────────────────────────────

function exportAssessment(a: Assessment) {
  const lines: string[] = [
    "NORVAR COMPLIANCE ASSESSMENT",
    "=".repeat(50),
    "",
    `Title: ${a.title}`,
    `Risk: ${a.risk_tier ?? a.risk_score?.tier ?? a.risk ?? "low"}`,
    "",
    "SUMMARY",
    "-".repeat(30),
    a.summary,
    "",
    "FRAMEWORKS",
    "-".repeat(30),
    (a.frameworks ?? []).join(", ") || "None",
    "",
    `GAPS (${a.gaps?.length ?? 0})`,
    "-".repeat(30),
  ];

  [
    ...(a.gaps ?? []).filter(g => g.severity === "critical"),
    ...(a.gaps ?? []).filter(g => g.severity === "high"),
    ...(a.gaps ?? []).filter(g => g.severity === "medium"),
  ].forEach((g, i) => {
    lines.push("", `${i + 1}. [${g.severity.toUpperCase()}] ${g.title}`);
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

// ── Assessment card ────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
  const t = tier?.toLowerCase() ?? "low";
  const styles: Record<string, { bg: string; color: string }> = {
    critical: { bg: "var(--color-background-danger,  #FCEBEB)", color: "var(--color-text-danger,  #A32D2D)" },
    high:     { bg: "var(--color-background-warning, #FAEEDA)", color: "var(--color-text-warning, #854F0B)" },
    medium:   { bg: "var(--color-background-info,    #E6F1FB)", color: "var(--color-text-info,    #185FA5)" },
    low:      { bg: "var(--color-background-success, #EAF3DE)", color: "var(--color-text-success, #3B6D11)" },
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

function AssessmentCard({ a, onNew, assessmentId, gapChats, onGapChatsUpdate }: {
  a:                 Assessment;
  onNew:             () => void;
  assessmentId?:     string | null;
  gapChats?:         Record<string, GapChatMessage[]>;
  onGapChatsUpdate?: (key: string, messages: GapChatMessage[]) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"gaps" | "frameworks">("gaps");

  const overallTier = a.risk_tier ?? a.risk_score?.tier ?? a.risk ?? "low";
  const byDomain    = a.risk_by_domain ?? null;
  const gaps        = a.gaps ?? [];
  const ordered     = [
    ...gaps.filter(g => g.severity === "critical"),
    ...gaps.filter(g => g.severity === "high"),
    ...gaps.filter(g => g.severity === "medium"),
    ...gaps.filter(g => g.severity === "low"),
  ];

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
          gaps:              indices.map(i => ({
            ...ordered[i],
            gap_key: String(i),
          })),
        }),
      });
      setQueued(prev => { const next = new Set(prev); indices.forEach(i => next.add(i)); return next; });
      if (indices.length > 1) setQueuedAll(true);
    } finally {
      setQueueing(null);
    }
  };

  return (
    <div className="msg-ai-card fade-up">
      <div className="msg-ai-label">
        <ShieldAlert size={11} strokeWidth={2} color="var(--fg3)" />
        Norvar assessment
      </div>

      <div className="score-row">
        <TierBadge tier={overallTier} />
        <span style={{ fontSize: 12, color: "var(--fg2)", fontWeight: 500, marginLeft: 6 }}>
          {overallTier.charAt(0).toUpperCase() + overallTier.slice(1)} risk
        </span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg3)" }}>
          {gaps.length} gap{gaps.length !== 1 ? "s" : ""} · {a.frameworks?.length ?? 0} frameworks
        </span>
      </div>

      {byDomain && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 4, flexWrap: "wrap" }}>
          {Object.entries(byDomain).map(([domain, info]) => (
            <div key={domain} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "4px 10px", borderRadius: 6,
              border: "0.5px solid var(--bdr)",
              background: "var(--card2)", fontSize: 11,
            }}>
              <span style={{ color: "var(--fg3)" }}>{DOMAIN_LABELS[domain] ?? domain}</span>
              <TierBadge tier={info.tier} />
              {info.gap_count > 0 && (
                <span style={{ fontSize: 10, color: "var(--fg3)" }}>
                  {info.gap_count} gap{info.gap_count !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="assessment-summary">{a.summary}</p>
      <div className="section-divider" />

      <div style={{ display: "flex", borderBottom: "0.5px solid var(--bdr)", marginBottom: 12 }}>
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
                {tab === "gaps" && ordered.length > 0 && !queuedAll && (
                  <span
                    onClick={e => { e.stopPropagation(); addToQueue(ordered.map((_, i) => i)); }}
                    style={{
                      fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 10,
                      background: "var(--card2)", color: "var(--fg3)", border: "0.5px solid var(--bdr2)",
                      cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase",
                    }}
                  >
                    + Add all
                  </span>
                )}
                {queuedAll && (
                  <span style={{ fontSize: 9, color: "var(--rl)", fontWeight: 600 }}>✓ All queued</span>
                )}
              </span>
            )}
            {t === "frameworks" && `Frameworks (${a.frameworks?.length ?? 0})`}
          </button>
        ))}
      </div>

      {tab === "gaps" && (
        <div>
          {ordered.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--fg3)", padding: "8px 0" }}>No gaps identified.</p>
          )}
          {ordered.map((gap, i) => (
            <div key={i} className="gap-item">
              <span className={`gap-sev ${gap.severity}`}>
                <SevIcon sev={gap.severity} />
                {gap.severity.charAt(0).toUpperCase() + gap.severity.slice(1)}
              </span>
              <div style={{ flex: 1 }}>
                <p className="gap-title">{gap.title}</p>
                <p className="gap-reg">{gap.frameworks?.join(", ")}</p>
                {(gap.detail || gap.description) && (
                  <p className="gap-detail">{gap.detail || gap.description}</p>
                )}
                {gap.remediation && (
                  <div className="gap-fix">
                    <div className="gap-fix-label">Fix</div>
                    {gap.remediation}
                  </div>
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
                  gapKey={String(i)}
                  initialMessages={gapChats?.[String(i)] ?? []}
                  onMessagesChange={msgs => onGapChatsUpdate?.(String(i), msgs)}
                />
              </div>
              <button
                type="button"
                onClick={() => addToQueue([i])}
                disabled={queued.has(i) || queueing === i}
                style={{
                  flexShrink: 0, alignSelf: "flex-start", marginTop: 2,
                  fontSize: 10, fontWeight: 500, padding: "3px 9px", borderRadius: 5,
                  border: `0.5px solid ${queued.has(i) ? "var(--rl-bdr)" : "var(--bdr2)"}`,
                  background: queued.has(i) ? "var(--rl-bg)" : "transparent",
                  color: queued.has(i) ? "var(--rl)" : "var(--fg3)",
                  cursor: queued.has(i) ? "default" : "pointer",
                  fontFamily: "'Sora', sans-serif",
                  transition: "all 0.15s",
                }}
              >
                {queueing === i ? "..." : queued.has(i) ? "✓ Queued" : "+ Queue"}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === "frameworks" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(a.frameworks ?? []).length === 0 && (
            <p style={{ fontSize: 12, color: "var(--fg3)" }}>No frameworks listed.</p>
          )}
          {(a.frameworks ?? []).map(f => (
            <span key={f} style={{
              fontSize: 11, color: "var(--fg2)", background: "var(--card2)",
              padding: "3px 10px", borderRadius: 5, border: "0.5px solid var(--bdr)",
              fontFamily: "'JetBrains Mono', monospace",
            }}>{f}</span>
          ))}
        </div>
      )}

      <div className="section-divider" />

      <div className="result-actions">
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

// ── Stream reader ──────────────────────────────────────────────────────────────

async function readSSEStream(response: Response, onEvent: (event: SSEEvent) => void) {
  const reader  = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer    = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data: ")) continue;
      try {
        onEvent(JSON.parse(line.slice(6)) as SSEEvent);
      } catch {
        // ignore malformed chunks
      }
    }
  }
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

function InfoTip({ text }: { text: string }) {
  return (
    <div
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={e => {
        const t = e.currentTarget.querySelector(".tip") as HTMLElement;
        if (t) t.style.opacity = "1";
      }}
      onMouseLeave={e => {
        const t = e.currentTarget.querySelector(".tip") as HTMLElement;
        if (t) t.style.opacity = "0";
      }}
    >
      <Info size={14} strokeWidth={1.75} color="var(--fg3)" style={{ cursor: "default" }} />
      <div
        className="tip"
        style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%",
          transform: "translateX(-50%)", background: "var(--card)",
          border: "0.5px solid var(--bdr2)", borderRadius: 7,
          padding: "10px 14px", width: 280, fontSize: 12,
          color: "var(--fg2)", lineHeight: 1.65, fontFamily: "'Sora', sans-serif",
          letterSpacing: "-.01em", opacity: 0, transition: "opacity 0.15s",
          pointerEvents: "none", zIndex: 50,
          boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
        }}
      >
        {text}
      </div>
    </div>
  );
}

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

  const [messages,      setMessages]      = useState<Message[]>([]);
  const [input,         setInput]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [loadingSaved,  setLoadingSaved]  = useState(false);
  const [error,         setError]         = useState("");
  const [contractText,  setContractText]  = useState("");
  const [contractName,  setContractName]  = useState("");
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [domains,       setDomains]       = useState<string[]>([]);
  const [dataTypes,     setDataTypes]     = useState<string[]>([]);
  const [sector,        setSector]        = useState<string[]>([]);
  const [openChip,      setOpenChip]      = useState<string | null>(null);
  const [assessmentId,  setAssessmentId]  = useState<string | null>(null);
  const [gapChats,      setGapChats]      = useState<Record<string, GapChatMessage[]>>({});

  const [inferring,       setInferring]       = useState(false);
  const [pendingDesc,     setPendingDesc]     = useState("");
  const [followUp,        setFollowUp]        = useState<{
    dimension: "jurisdictions" | "data_types" | "sector";
    question:  string;
    options:   { value: string; label: string }[];
  } | null>(null);
  const [inferredContext, setInferredContext] = useState<{
    domains:       string[];
    jurisdictions: string[];
    data_types:    string[];
    sector:        string;
  } | null>(null);

  const textareaRef    = useRef<HTMLTextAreaElement>(null);
  const scrollRef      = useRef<HTMLDivElement>(null);
  const fileRef        = useRef<HTMLInputElement>(null);
  const followUpRef    = useRef<(text: string) => Promise<string | null>>(async () => null);
  const speakAfterRef  = useRef<(text: string) => void>(() => {});

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) {
      setMessages([]);
      setError("");
      setAssessmentId(null);
      setGapChats({});
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
        setMessages(restoreMessages(d.assessment));
      })
      .catch((e: unknown) => {
        setMessages([]);
        setError(e instanceof Error ? e.message : "Failed to load assessment");
      })
      .finally(() => setLoadingSaved(false));
  }, [searchParams]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  function toggleMulti(setter: React.Dispatch<React.SetStateAction<string[]>>) {
    return (v: string) => setter(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v]);
  }

  function toggleSingle(setter: React.Dispatch<React.SetStateAction<string[]>>) {
    return (v: string) => setter(p => p.includes(v) ? [] : [v]);
  }

  function buildTags() {
    return [
      ...jurisdictions.map(v => JURISDICTION_OPTIONS.find(x => x.value === v)?.label ?? v),
      ...domains.map(v => DOMAIN_OPTIONS.find(x => x.value === v)?.label ?? v),
      ...dataTypes.map(v => DATA_TYPE_OPTIONS.find(x => x.value === v)?.label ?? v),
      ...sector.map(v => SECTOR_OPTIONS.find(x => x.value === v)?.label ?? v),
    ];
  }

  const hasGuidedInputs = jurisdictions.length > 0 || domains.length > 0 || dataTypes.length > 0 || sector.length > 0;
  const hasAssessment   = messages.some(m => m.role === "assistant");

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
    setAssessmentId(null);
    setGapChats({});
    setInferring(false);
    setPendingDesc("");
    setFollowUp(null);
    setInferredContext(null);
    router.push("/");
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setContractName(file.name);
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload  = ev => resolve(ev.target?.result as string || "");
      r.onerror = reject;
      r.readAsText(file);
    })
      .then(text => setContractText(text))
      .catch(() => {});
    e.target.value = "";
  };

  const canSend = hasAssessment
    ? input.trim().length > 2 && !loading
    : input.trim().length > 10 && !loading && !inferring;

  const voice = useVoice({
    onTranscript: text => setInput(text),
    onAutoSend: async text => {
      const response = await followUpRef.current(text);
      if (response) speakAfterRef.current(response);
    },
    disabled: loading || !hasAssessment,
  });

  speakAfterRef.current = voice.speakAfterResponse;

  const awaitingInference = messages.some(m => m.role === "thinking" && m.isFollowUp);

  const FOLLOWUP_OPTIONS: Record<string, { question: string; options: { value: string; label: string }[] }> = {
    jurisdictions: {
      question: "Where are your users or data subjects located?",
      options: JURISDICTION_OPTIONS,
    },
    data_types: {
      question: "What types of personal data does your system process?",
      options: DATA_TYPE_OPTIONS,
    },
    sector: {
      question: "What industry or sector does your product operate in?",
      options: SECTOR_OPTIONS,
    },
  };

  const runAssessment = async (
    text: string,
    tags: string[],
    resolvedDomains: string[],
    resolvedJurisdictions: string[],
    resolvedDataTypes: string[],
    resolvedSector: string,
    folderId?: string | null,
  ) => {
    setMessages(prev => [...prev, { role: "thinking", text: "", status: "Retrieving regulations..." }]);
    setLoading(true);
    let streamingText = "";
    try {
      const res = await fetch("/api/assess", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description:   text,
          domains:       resolvedDomains,
          jurisdictions: resolvedJurisdictions,
          data_types:    resolvedDataTypes,
          sector:        resolvedSector,
          contract_text: contractText || undefined,
          tags,
          folder_id:     folderId || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Assessment failed");
      }
      await readSSEStream(res, (event) => {
        if (event.type === "status") {
          setMessages(prev => updateLastMessage(prev, "thinking", { status: event.text }));
        } else if (event.type === "token") {
          streamingText += event.text;
          setMessages(prev => updateLastMessage(prev, "thinking", { text: streamingText, status: undefined }));
        } else if (event.type === "summary") {
          streamingText = event.text;
          setMessages(prev => updateLastMessage(prev, "thinking", { text: streamingText, status: undefined }));
        } else if (event.type === "done") {
          if (!event.assessment) throw new Error("Assessment failed");
          if (event.assessment.id) setAssessmentId(event.assessment.id);
          setMessages(prev => {
            const next = [...prev];
            const idx  = next.findLastIndex(m => m.role === "thinking");
            if (idx >= 0) next[idx] = { role: "assistant", assessment: event.assessment! };
            else next.push({ role: "assistant", assessment: event.assessment! });
            return next;
          });
          clearAll();
          setContractText("");
          setContractName("");
          setInferredContext(null);
          setFollowUp(null);
          setPendingDesc("");
        } else if (event.type === "error") {
          throw new Error(event.text);
        }
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setMessages(prev => prev.filter(m => m.role !== "thinking"));
    } finally {
      setLoading(false);
    }
  };

  const handleFollowUpSelection = async (selected: string) => {
    if (!followUp || !inferredContext) return;

    const option = FOLLOWUP_OPTIONS[followUp.dimension].options.find(
      o => o.label === selected || o.label.toLowerCase().includes(selected.toLowerCase()),
    );
    const value = option?.value ?? selected.toLowerCase().replace(/\s+/g, "_");

    let updated = { ...inferredContext };
    if (followUp.dimension === "jurisdictions") updated.jurisdictions = [...updated.jurisdictions, value];
    if (followUp.dimension === "data_types")    updated.data_types    = [...updated.data_types, value];
    if (followUp.dimension === "sector")         updated.sector        = value;
    setInferredContext(updated);

    const remainingGaps: Array<"jurisdictions" | "data_types" | "sector"> = [];
    if (updated.jurisdictions.length === 0) remainingGaps.push("jurisdictions");
    if (updated.data_types.length    === 0) remainingGaps.push("data_types");
    if (!updated.sector)                     remainingGaps.push("sector");

    if (remainingGaps.length > 0) {
      const dim = remainingGaps[0];
      const { question, options } = FOLLOWUP_OPTIONS[dim];
      setFollowUp({ dimension: dim, question, options });
      setMessages(prev => [...prev, {
        role:            "thinking",
        text:            question,
        isFollowUp:      true,
        followUpOptions: options.map(o => o.label),
      }]);
    } else {
      setFollowUp(null);
      const tags = [...updated.domains, ...updated.jurisdictions, ...updated.data_types, updated.sector].filter(Boolean);
      await runAssessment(pendingDesc, tags, updated.domains, updated.jurisdictions, updated.data_types, updated.sector, folderId);
    }
  };

  const handleInferenceOption = async (selected: string) => {
    setMessages(prev => prev.filter(m => !(m.role === "thinking" && m.isFollowUp)));
    setMessages(prev => [...prev, { role: "user", content: selected, tags: [] }]);

    if (selected === "Looks right — run assessment" && inferredContext && pendingDesc) {
      const tags = [
        ...inferredContext.domains,
        ...inferredContext.jurisdictions,
        ...inferredContext.data_types,
        inferredContext.sector,
      ].filter(Boolean);
      setFollowUp(null);
      await runAssessment(
        pendingDesc,
        tags,
        inferredContext.domains,
        inferredContext.jurisdictions,
        inferredContext.data_types,
        inferredContext.sector,
        folderId,
      );
      return;
    }

    if (selected === "Let me correct something") {
      setInferring(false);
      setFollowUp(null);
      return;
    }

    await handleFollowUpSelection(selected);
  };

  const handleAssessment = async (text: string, tags: string[]) => {
    setMessages(prev => [...prev, { role: "user", content: text, tags }]);
    setInferring(true);
    setPendingDesc(text);

    try {
      setMessages(prev => [...prev, { role: "thinking", text: "", status: "Understanding your deployment..." }]);
      const res  = await fetch("/api/infer", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ description: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Inference failed");
      const { inferred } = data;

      const resolvedDomains       = domains.length       > 0 ? domains       : (inferred.domains?.values       ?? []);
      const resolvedJurisdictions = jurisdictions.length > 0 ? jurisdictions : (inferred.jurisdictions?.values ?? []);
      const resolvedDataTypes     = dataTypes.length     > 0 ? dataTypes     : (inferred.data_types?.values    ?? []);
      const resolvedSector        = sector.length        > 0 ? sector[0]     : (inferred.sector?.values?.[0]   ?? "");

      setInferredContext({
        domains:       resolvedDomains,
        jurisdictions: resolvedJurisdictions,
        data_types:    resolvedDataTypes,
        sector:        resolvedSector,
      });

      setMessages(prev => prev.filter(m => m.role !== "thinking"));

      const gaps: Array<"jurisdictions" | "data_types" | "sector"> = [];
      if (inferred.jurisdictions?.confidence === "low" || resolvedJurisdictions.length === 0) gaps.push("jurisdictions");
      if (inferred.data_types?.confidence    === "low" || resolvedDataTypes.length    === 0) gaps.push("data_types");
      if (inferred.sector?.confidence        === "low" || !resolvedSector)                   gaps.push("sector");

      const mediumDims: string[] = [];
      if (inferred.domains?.confidence       === "medium") mediumDims.push(`domain: ${resolvedDomains.join(", ")}`);
      if (inferred.jurisdictions?.confidence === "medium" && !gaps.includes("jurisdictions")) mediumDims.push(`jurisdiction: ${resolvedJurisdictions.join(", ")}`);
      if (inferred.sector?.confidence        === "medium" && !gaps.includes("sector"))        mediumDims.push(`sector: ${resolvedSector}`);

      if (mediumDims.length > 0) {
        const confirmMsg = [
          `Based on your description, I'm assuming:\n`,
          ...mediumDims.map(d => `• ${d}`),
          `\nDoes that look right? You can confirm or correct below.`,
        ].join("\n");
        setMessages(prev => [...prev, {
          role:            "thinking",
          text:            confirmMsg,
          isFollowUp:      true,
          followUpOptions: ["Looks right — run assessment", "Let me correct something"],
        }]);
        setInferring(false);
        return;
      }

      if (gaps.length > 0) {
        const dim = gaps[0];
        const { question, options } = FOLLOWUP_OPTIONS[dim];
        setFollowUp({ dimension: dim, question, options });
        setMessages(prev => [...prev, {
          role:            "thinking",
          text:            question,
          isFollowUp:      true,
          followUpOptions: options.map(o => o.label),
        }]);
        setInferring(false);
        return;
      }

      setInferring(false);
      await runAssessment(text, tags, resolvedDomains, resolvedJurisdictions, resolvedDataTypes, resolvedSector, folderId);
    } catch {
      setMessages(prev => prev.filter(m => m.role !== "thinking"));
      setInferring(false);
      await runAssessment(text, tags, domains, jurisdictions, dataTypes, sector[0] ?? "", folderId);
    }
  };

  const handleFollowUp = async (text: string): Promise<string | null> => {
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);
    setMessages(prev => [...prev, { role: "chat", text: "" }]);

    const history: { role: "user" | "assistant"; content: string }[] = [];
    for (const m of messages) {
      if (m.role === "user") {
        history.push({ role: "user", content: m.content });
      } else if (m.role === "assistant") {
        const a = m.assessment;
        history.push({
          role: "assistant",
          content: `[Compliance Assessment] ${a.title}. Risk: ${a.risk_tier ?? a.risk_score?.tier ?? a.risk ?? "low"}. ${a.summary} Key gaps: ${(a.gaps || []).slice(0, 3).map(g => `${g.severity}: ${g.title}`).join("; ")}.`,
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
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Chat failed");
      }

      await readSSEStream(res, (event) => {
        if (event.type === "token") {
          chatText += event.text;
          setMessages(prev => updateLastMessage(prev, "chat", { text: chatText }));
        } else if (event.type === "error") {
          throw new Error(event.text);
        }
      });

      return chatText || null;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages(prev => prev.filter(m => m.role !== "chat" || m.text));
      return null;
    } finally {
      setLoading(false);
    }
  };

  followUpRef.current = handleFollowUp;

  const handleSend = async () => {
    if (!canSend) return;
    const text = input.trim();
    setInput("");
    setError("");
    setOpenChip(null);

    if (hasAssessment) {
      const response = await handleFollowUp(text);
      if (response) voice.speakAfterResponse(response);
    } else if (awaitingInference || followUp) {
      await handleInferenceOption(text);
    } else {
      await handleAssessment(text, buildTags());
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const isHome = messages.length === 0 && !loading && !loadingSaved;

  const InputBar = (
    <div className="input-wrap">
      {(hasGuidedInputs || contractName) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8, padding: "0 2px" }}>
          {buildTags().map(tag => (
            <span key={tag} style={{ fontSize: 11, color: "var(--fg2)", background: "var(--card2)", padding: "2px 9px", borderRadius: 20, border: "0.5px solid var(--bdr2)", fontFamily: "'Sora', sans-serif" }}>{tag}</span>
          ))}
          {contractName && (
            <span style={{ fontSize: 11, color: "var(--fg2)", background: "var(--card2)", padding: "2px 9px", borderRadius: 20, border: "0.5px solid var(--bdr2)", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "'Sora', sans-serif" }}>
              <FileText size={10} strokeWidth={2} />
              {contractName}
              <button type="button" onClick={() => { setContractText(""); setContractName(""); }} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}>
                <X size={10} strokeWidth={2} color="var(--fg3)" />
              </button>
            </span>
          )}
          {hasGuidedInputs && (
            <button type="button" onClick={clearAll} style={{ fontSize: 10, color: "var(--fg3)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px", fontFamily: "'Sora', sans-serif", display: "flex", alignItems: "center", gap: 3 }}>
              <X size={10} strokeWidth={2} /> Clear all
            </button>
          )}
        </div>
      )}

      <div className="input-bar">
        <textarea
          ref={textareaRef}
          className="input-textarea"
          placeholder="Describe your product or deployment..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          rows={1}
        />
        <button type="button" className="send-btn" onClick={handleSend} disabled={!canSend}>
          {loading ? <Loader2 size={16} className="spin" /> : <ArrowUp size={16} strokeWidth={2.5} />}
        </button>
      </div>

      <div className="input-chips">
        {openChip === "jurisdictions"
          ? <ChipDropdown icon={<Globe size={11} strokeWidth={1.75} />} label="Jurisdictions" options={JURISDICTION_OPTIONS} selected={jurisdictions} onToggle={toggleMulti(setJurisdictions)} onClose={() => setOpenChip(null)} />
          : <button type="button" className="chip" onClick={() => setOpenChip("jurisdictions")}><Globe size={11} strokeWidth={1.75} /> Jurisdictions{jurisdictions.length > 0 && <span style={{ fontSize:9, background:"var(--fg)", color:"var(--bg)", padding:"0 5px", borderRadius:10, fontWeight:600 }}>{jurisdictions.length}</span>}</button>
        }
        {openChip === "domains"
          ? <ChipDropdown icon={<Layers size={11} strokeWidth={1.75} />} label="Domains" options={DOMAIN_OPTIONS} selected={domains} onToggle={toggleMulti(setDomains)} onClose={() => setOpenChip(null)} />
          : <button type="button" className="chip" onClick={() => setOpenChip("domains")}><Layers size={11} strokeWidth={1.75} /> Domains{domains.length > 0 && <span style={{ fontSize:9, background:"var(--fg)", color:"var(--bg)", padding:"0 5px", borderRadius:10, fontWeight:600 }}>{domains.length}</span>}</button>
        }
        {openChip === "datatypes"
          ? <ChipDropdown icon={<Database size={11} strokeWidth={1.75} />} label="Data types" options={DATA_TYPE_OPTIONS} selected={dataTypes} onToggle={toggleMulti(setDataTypes)} onClose={() => setOpenChip(null)} />
          : <button type="button" className="chip" onClick={() => setOpenChip("datatypes")}><Database size={11} strokeWidth={1.75} /> Data types{dataTypes.length > 0 && <span style={{ fontSize:9, background:"var(--fg)", color:"var(--bg)", padding:"0 5px", borderRadius:10, fontWeight:600 }}>{dataTypes.length}</span>}</button>
        }
        {openChip === "sector"
          ? <ChipDropdown icon={<Briefcase size={11} strokeWidth={1.75} />} label="Sector" options={SECTOR_OPTIONS} selected={sector} onToggle={toggleSingle(setSector)} onClose={() => setOpenChip(null)} multi={false} />
          : <button type="button" className="chip" onClick={() => setOpenChip("sector")}><Briefcase size={11} strokeWidth={1.75} /> Sector{sector.length > 0 && <span style={{ fontSize:9, background:"var(--fg)", color:"var(--bg)", padding:"0 5px", borderRadius:10, fontWeight:600 }}>1</span>}</button>
        }
        <button type="button" className="chip" onClick={() => fileRef.current?.click()}>
          <FileText size={11} strokeWidth={1.75} />
          {contractName ? "Replace doc" : "Upload doc"}
        </button>
        <input ref={fileRef} type="file" accept=".docx,.doc,.txt" style={{ display: "none" }} onChange={handleFileUpload} />
      </div>
    </div>
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
        <div className="app-shell">
          <Sidebar />
          <div className="main-area">

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
              <div className="home-body">
                <Logo size={40} />
                <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
                  <h1 className="home-heading">What are you building?</h1>
                  <InfoTip text="Describe your deployment and Norvar will map it to the regulations that apply, score your risk, and surface compliance gaps." />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <ModeSelector current="assess" />
                </div>
                {InputBar}
                {error && <p style={{ marginTop: 14, fontSize: 12, color: "var(--rh)" }}>{error}</p>}
              </div>
            )}

            {!isHome && !loadingSaved && (
              <>
                <div style={{ padding: "14px 32px 0", flexShrink: 0 }}>
                  <ModeSelector current="assess" />
                </div>
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
                                <span key={t} style={{ fontSize: 10, color: "var(--fg3)", background: "rgba(255,255,255,.05)", padding: "1px 7px", borderRadius: 10, border: "0.5px solid var(--bdr)", fontFamily: "'Sora', sans-serif" }}>{t}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (msg.role === "thinking") {
                      const isFollowUp = msg.isFollowUp && msg.followUpOptions;
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
                              ) : isFollowUp ? "Norvar" : "Norvar is analysing..."}
                            </div>
                            {msg.text ? (
                              <p style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.7, letterSpacing: "-0.01em", whiteSpace: "pre-wrap" }}>
                                {msg.text}
                                {!isFollowUp && loading && streamCursor}
                              </p>
                            ) : (
                              <div style={{ display: "flex", gap: 5, padding: "8px 0" }}>
                                <span className="loading-dot" />
                                <span className="loading-dot" />
                                <span className="loading-dot" />
                              </div>
                            )}
                            {isFollowUp && msg.followUpOptions && (
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                                {msg.followUpOptions.map(opt => (
                                  <button
                                    key={opt}
                                    type="button"
                                    onClick={() => handleInferenceOption(opt)}
                                    style={{
                                      fontSize: 11, padding: "5px 12px", borderRadius: 16,
                                      border: "0.5px solid var(--bdr2)", background: "var(--card2)",
                                      color: "var(--fg2)", cursor: "pointer",
                                      fontFamily: "'Sora', sans-serif",
                                    }}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (msg.role === "assistant") {
                      return (
                        <div key={i} className="msg-ai">
                          <AssessmentCard
                            a={msg.assessment}
                            onNew={startNew}
                            assessmentId={assessmentId}
                            gapChats={gapChats}
                            onGapChatsUpdate={(key, msgs) => setGapChats(prev => ({ ...prev, [key]: msgs }))}
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
                              Norvar
                            </div>
                            <p style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.75, letterSpacing: "-0.01em", whiteSpace: "pre-wrap" }}>
                              {msg.text || ""}
                              {loading && i === messages.length - 1 && streamCursor}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                  {error && <p style={{ fontSize: 12, color: "var(--rh)" }}>{error}</p>}
                </div>
                </div>

                <div className="chat-input-row">
                  <div className="chat-input-inner">
                    <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
                      <VoiceControls
                        speakEnabled={voice.settings.speakResponses}
                        conversationEnabled={voice.settings.voiceConversation}
                        onToggleSpeak={voice.toggleSpeakResponses}
                        onToggleConversation={voice.toggleVoiceConversation}
                        isListening={voice.isListening}
                        isSpeaking={voice.isSpeaking}
                        onStartListening={voice.startListening}
                        onStopListening={voice.stopListening}
                        onStopSpeaking={voice.stopSpeak}
                        ttsSupported={voice.support.tts}
                        sttSupported={voice.support.stt}
                        configured={voice.support.configured}
                        disabled={loading}
                      />
                      {!voice.support.configured && (
                        <p style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 6, fontFamily: "'Sora', sans-serif" }}>
                          Install the ElevenLabs integration on Vercel to enable AI voice.
                        </p>
                      )}
                      {voice.voiceError && (
                        <VoiceErrorBanner message={voice.voiceError} onDismiss={voice.clearError} />
                      )}
                    <div className="chat-input-bar">
                      <input
                        className="chat-input-field"
                        placeholder={hasAssessment ? "Ask a follow-up question about this assessment..." : "Describe another deployment..."}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKey}
                      />
                      <button type="button" className="chat-send-btn" onClick={handleSend} disabled={!canSend}>
                        {loading ? <Loader2 size={14} className="spin" /> : <ArrowUp size={14} strokeWidth={2.5} />}
                      </button>
                    </div>
                    </div>
                  </div>
                </div>
              </>
            )}

          </div>
        </div>
      </Show>

      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}
