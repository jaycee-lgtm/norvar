"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Show } from "@clerk/nextjs";
import Sidebar from "@/components/Sidebar";
import ModeSelector from "@/components/ModeSelector";
import LandingPage from "@/components/LandingPage";
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

const DOMAIN_OPTIONS = [
  { value: "ai",       label: "Artificial Intelligence" },
  { value: "privacy",  label: "Privacy"                 },
  { value: "cyber",    label: "Cybersecurity"           },
  { value: "cv",       label: "Computer Vision"         },
  { value: "adm",      label: "Auto Decisioning"        },
  { value: "robotics", label: "Robotics"                },
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
  severity:     "critical" | "high" | "medium";
  title:        string;
  detail?:      string;
  description?: string;
  remediation?: string;
  frameworks:   string[];
};

type Assessment = {
  id?:          string;
  title:        string;
  summary:      string;
  risk:         string;
  risk_summary?: string;
  risk_score:   { composite: number; tier: string };
  gaps:         Gap[];
  frameworks?:  string[];
};

type Message =
  | { role: "user"; content: string; tags?: string[] }
  | { role: "assistant"; assessment: Assessment }
  | { role: "thinking"; text: string; status?: string }
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
    `Risk: ${a.risk_score?.tier} (${a.risk_score?.composite}/100)`,
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

function AssessmentCard({ a, onNew }: { a: Assessment; onNew: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<"gaps" | "frameworks">("gaps");
  const score   = a.risk_score?.composite ?? 0;
  const gaps    = a.gaps ?? [];
  const ordered = [
    ...gaps.filter(g => g.severity === "critical"),
    ...gaps.filter(g => g.severity === "high"),
    ...gaps.filter(g => g.severity === "medium"),
  ];

  return (
    <div className="msg-ai-card fade-up">
      <div className="msg-ai-label">
        <ShieldAlert size={11} strokeWidth={2} color="var(--fg3)" />
        Norvar assessment
      </div>

      <div className="score-row">
        <span className="score-number">{score}</span>
        <span className="score-denom">/100</span>
        <span className="risk-badge">{a.risk_score?.tier ?? a.risk} risk</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg3)" }}>
          {gaps.length} gaps, {a.frameworks?.length ?? 0} frameworks
        </span>
      </div>

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
            {t === "gaps"       && `Gaps (${gaps.length})`}
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
              </div>
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) {
      setMessages([]);
      setError("");
      setAssessmentId(null);
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
    : input.trim().length > 10 && !loading;

  const handleAssessment = async (text: string, tags: string[]) => {
    setMessages(prev => [...prev, { role: "user", content: text, tags }]);
    setLoading(true);
    setMessages(prev => [...prev, { role: "thinking", text: "", status: "Retrieving regulations..." }]);

    let streamingText = "";

    try {
      const res = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description:   text,
          domains,
          jurisdictions,
          data_types:    dataTypes,
          sector:        sector[0] ?? "",
          deployments:   [],
          contract_text: contractText || undefined,
          tags,
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

  const handleFollowUp = async (text: string) => {
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
          content: `[Compliance Assessment] ${a.title}. Risk: ${a.risk_score?.tier} (${a.risk_score?.composite}/100). ${a.summary} Key gaps: ${(a.gaps || []).slice(0, 3).map(g => `${g.severity}: ${g.title}`).join("; ")}.`,
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
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setMessages(prev => prev.filter(m => m.role !== "chat" || m.text));
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!canSend) return;
    const text = input.trim();
    setInput("");
    setError("");
    setOpenChip(null);

    if (hasAssessment) {
      await handleFollowUp(text);
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
          {contractName ? "Replace contract" : "Upload contract"}
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display: "none" }} onChange={handleFileUpload} />
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
                <div className="home-logo">N</div>
                <h1 className="home-heading">What are you building?</h1>
                <p className="home-sub">
                  Describe your deployment and Norvar will map it to the regulations
                  that apply, score your risk, and surface compliance gaps.
                </p>
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
                <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "24px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
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
                              ) : "Norvar is analysing..."}
                            </div>
                            {msg.text ? (
                              <p style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.7, letterSpacing: "-0.01em" }}>
                                {msg.text}
                                {streamCursor}
                              </p>
                            ) : (
                              <div style={{ display: "flex", gap: 5, padding: "8px 0" }}>
                                <span className="loading-dot" />
                                <span className="loading-dot" />
                                <span className="loading-dot" />
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    }

                    if (msg.role === "assistant") {
                      return (
                        <div key={i} className="msg-ai">
                          <AssessmentCard a={msg.assessment} onNew={startNew} />
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

                <div className="chat-input-row">
                  <div className="chat-input-inner">
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
