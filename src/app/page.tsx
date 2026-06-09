"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Show, SignInButton } from "@clerk/nextjs";
import Sidebar from "@/components/Sidebar";
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
  | { role: "assistant"; assessment: Assessment };

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

// ── Export helper ──────────────────────────────────────────────────────────────

function exportAssessment(a: Assessment) {
  const lines: string[] = [
    `NORVAR COMPLIANCE ASSESSMENT`,
    `${"=".repeat(50)}`,
    ``,
    `Title: ${a.title}`,
    `Risk tier: ${a.risk_score?.tier ?? a.risk}`,
    `Risk score: ${a.risk_score?.composite ?? 0}/100`,
    ``,
    `SUMMARY`,
    `${"-".repeat(30)}`,
    a.summary,
    ``,
    `APPLICABLE FRAMEWORKS`,
    `${"-".repeat(30)}`,
    (a.frameworks ?? []).join(", ") || "None listed",
    ``,
    `COMPLIANCE GAPS (${a.gaps?.length ?? 0})`,
    `${"-".repeat(30)}`,
  ];

  const ordered = [
    ...(a.gaps ?? []).filter(g => g.severity === "critical"),
    ...(a.gaps ?? []).filter(g => g.severity === "high"),
    ...(a.gaps ?? []).filter(g => g.severity === "medium"),
  ];

  ordered.forEach((gap, i) => {
    lines.push(``, `${i + 1}. [${gap.severity.toUpperCase()}] ${gap.title}`);
    lines.push(`   Frameworks: ${gap.frameworks?.join(", ") || "N/A"}`);
    if (gap.detail || gap.description) lines.push(`   Issue: ${gap.detail || gap.description}`);
    if (gap.remediation) lines.push(`   Fix: ${gap.remediation}`);
  });

  lines.push(``, `${"=".repeat(50)}`, `Generated by Norvar, norvar.io`, new Date().toLocaleString());

  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = `norvar-assessment-${(a.title || "report").toLowerCase().replace(/\s+/g, "-")}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

// ── Assessment card ────────────────────────────────────────────────────────────

function AssessmentCard({
  a, onNewAssessment,
}: {
  a:               Assessment;
  onNewAssessment: () => void;
}) {
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
            <p style={{ fontSize: 12, color: "var(--fg3)", padding: "8px 0" }}>No compliance gaps identified.</p>
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
        <button
          type="button"
          className="result-action"
          onClick={() => exportAssessment(a)}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
        >
          <Download size={11} strokeWidth={2} />
          Export
        </button>
        <button
          type="button"
          className="result-action"
          onClick={() => router.push("/history")}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
        >
          <History size={11} strokeWidth={2} />
          View history
        </button>
        <button
          type="button"
          className="result-action"
          onClick={onNewAssessment}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer" }}
        >
          <SquarePen size={11} strokeWidth={2} />
          New assessment
        </button>
      </div>
    </div>
  );
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

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);
  const fileRef     = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) {
      setMessages([]);
      setError("");
      return;
    }

    setLoadingSaved(true);
    setError("");

    fetch(`/api/assessments?id=${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        if (!d.assessment) throw new Error("Assessment not found");
        const row = d.assessment;
        const result = (row.result ?? row) as Assessment;
        setMessages([
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
        ]);
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setContractName(file.name);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      setContractText(text || "");
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const clearContract = () => { setContractText(""); setContractName(""); };

  function toggleValue(
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    multi: boolean,
  ) {
    return (v: string) => setter(prev =>
      multi
        ? prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
        : prev.includes(v) ? [] : [v]
    );
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

  function clearGuidedInputs() {
    setJurisdictions([]); setDomains([]); setDataTypes([]); setSector([]);
  }

  function startNewAssessment() {
    setMessages([]);
    setInput("");
    setError("");
    clearGuidedInputs();
    clearContract();
    router.push("/");
  }

  const canSend = input.trim().length > 10 && !loading;

  const handleSend = async () => {
    if (!canSend) return;
    const text = input.trim();
    const tags = buildTags();
    setInput("");
    setError("");
    setOpenChip(null);
    setMessages(prev => [...prev, { role: "user", content: text, tags }]);
    setLoading(true);

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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Assessment failed");
      setMessages(prev => [...prev, { role: "assistant", assessment: data }]);
      clearContract();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
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
            <span key={tag} style={{
              fontSize: 11, color: "var(--fg2)", background: "var(--card2)",
              padding: "2px 9px", borderRadius: 20, border: "0.5px solid var(--bdr2)",
              fontFamily: "'Sora', sans-serif",
            }}>{tag}</span>
          ))}
          {contractName && (
            <span style={{
              fontSize: 11, color: "var(--fg2)", background: "var(--card2)",
              padding: "2px 9px", borderRadius: 20, border: "0.5px solid var(--bdr2)",
              display: "inline-flex", alignItems: "center", gap: 5,
              fontFamily: "'Sora', sans-serif",
            }}>
              <FileText size={10} strokeWidth={2} />
              {contractName}
              <button type="button" onClick={clearContract} style={{ background:"transparent", border:"none", cursor:"pointer", padding:0, display:"flex", alignItems:"center" }}>
                <X size={10} strokeWidth={2} color="var(--fg3)" />
              </button>
            </span>
          )}
          {hasGuidedInputs && (
            <button type="button" onClick={clearGuidedInputs} style={{
              fontSize: 10, color: "var(--fg3)", background: "transparent",
              border: "none", cursor: "pointer", padding: "2px 4px",
              fontFamily: "'Sora', sans-serif", display: "flex", alignItems: "center", gap: 3,
            }}>
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
          {loading
            ? <Loader2 size={16} className="spin" />
            : <ArrowUp size={16} strokeWidth={2.5} />}
        </button>
      </div>

      <div className="input-chips">

        {openChip === "jurisdictions" ? (
          <ChipDropdown icon={<Globe size={11} strokeWidth={1.75} />} label="Jurisdictions"
            options={JURISDICTION_OPTIONS} selected={jurisdictions}
            onToggle={toggleValue(setJurisdictions, true)} onClose={() => setOpenChip(null)} />
        ) : (
          <button type="button" className="chip" onClick={() => setOpenChip("jurisdictions")}>
            <Globe size={11} strokeWidth={1.75} /> Jurisdictions
            {jurisdictions.length > 0 && <span style={{ fontSize:9, background:"var(--fg)", color:"var(--bg)", padding:"0 5px", borderRadius:10, fontWeight:600 }}>{jurisdictions.length}</span>}
          </button>
        )}

        {openChip === "domains" ? (
          <ChipDropdown icon={<Layers size={11} strokeWidth={1.75} />} label="Domains"
            options={DOMAIN_OPTIONS} selected={domains}
            onToggle={toggleValue(setDomains, true)} onClose={() => setOpenChip(null)} />
        ) : (
          <button type="button" className="chip" onClick={() => setOpenChip("domains")}>
            <Layers size={11} strokeWidth={1.75} /> Domains
            {domains.length > 0 && <span style={{ fontSize:9, background:"var(--fg)", color:"var(--bg)", padding:"0 5px", borderRadius:10, fontWeight:600 }}>{domains.length}</span>}
          </button>
        )}

        {openChip === "datatypes" ? (
          <ChipDropdown icon={<Database size={11} strokeWidth={1.75} />} label="Data types"
            options={DATA_TYPE_OPTIONS} selected={dataTypes}
            onToggle={toggleValue(setDataTypes, true)} onClose={() => setOpenChip(null)} />
        ) : (
          <button type="button" className="chip" onClick={() => setOpenChip("datatypes")}>
            <Database size={11} strokeWidth={1.75} /> Data types
            {dataTypes.length > 0 && <span style={{ fontSize:9, background:"var(--fg)", color:"var(--bg)", padding:"0 5px", borderRadius:10, fontWeight:600 }}>{dataTypes.length}</span>}
          </button>
        )}

        {openChip === "sector" ? (
          <ChipDropdown icon={<Briefcase size={11} strokeWidth={1.75} />} label="Sector"
            options={SECTOR_OPTIONS} selected={sector}
            onToggle={toggleValue(setSector, false)} onClose={() => setOpenChip(null)} multi={false} />
        ) : (
          <button type="button" className="chip" onClick={() => setOpenChip("sector")}>
            <Briefcase size={11} strokeWidth={1.75} /> Sector
            {sector.length > 0 && <span style={{ fontSize:9, background:"var(--fg)", color:"var(--bg)", padding:"0 5px", borderRadius:10, fontWeight:600 }}>1</span>}
          </button>
        )}

        <button type="button" className="chip" onClick={() => fileRef.current?.click()}>
          <FileText size={11} strokeWidth={1.75} />
          {contractName ? "Replace contract" : "Upload contract"}
        </button>
        <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt" style={{ display:"none" }} onChange={handleFileUpload} />

      </div>
    </div>
  );

  return (
    <div className="app-shell">
      <Show when="signed-in">
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
              {InputBar}
              {error && <p style={{ marginTop: 14, fontSize: 12, color: "var(--rh)" }}>{error}</p>}
            </div>
          )}

          {!isHome && !loadingSaved && (
            <>
              <div ref={scrollRef} style={{
                flex: 1, overflowY: "auto", padding: "24px 32px",
                display: "flex", flexDirection: "column", gap: 16,
              }}>
                {messages.map((msg, i) => (
                  <div key={i} className={msg.role === "user" ? "msg-user fade-up" : "msg-ai"}>
                    {msg.role === "user" ? (
                      <div>
                        <div>{msg.content}</div>
                        {msg.tags && msg.tags.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 7 }}>
                            {msg.tags.map(t => (
                              <span key={t} style={{
                                fontSize: 10, color: "var(--fg3)", background: "rgba(255,255,255,.05)",
                                padding: "1px 7px", borderRadius: 10, border: "0.5px solid var(--bdr)",
                                fontFamily: "'Sora', sans-serif",
                              }}>{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <AssessmentCard a={msg.assessment} onNewAssessment={startNewAssessment} />
                    )}
                  </div>
                ))}

                {loading && (
                  <div className="msg-ai fade-up">
                    <div className="msg-ai-card">
                      <div className="msg-ai-label"><ShieldAlert size={11} color="var(--fg3)" /> Norvar is assessing...</div>
                      <div style={{ display:"flex", gap:5, padding:"8px 0" }}>
                        <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
                      </div>
                    </div>
                  </div>
                )}
                {error && <p style={{ fontSize: 12, color: "var(--rh)" }}>{error}</p>}
              </div>

              <div className="chat-input-row">
                <div className="chat-input-inner">
                  <div className="chat-input-bar">
                    <input
                      className="chat-input-field"
                      placeholder="Ask a follow-up or describe another deployment..."
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
      </Show>

      <Show when="signed-out">
        <div style={{
          flex: 1, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          padding: 32, textAlign: "center", background: "var(--bg)",
        }}>
          <div className="home-logo">N</div>
          <h1 className="home-heading">Norvar</h1>
          <p className="home-sub" style={{ marginBottom: 28 }}>
            Governance, Risk and Compliance Intelligence. Sign in to run your first assessment.
          </p>
          <SignInButton>
            <button type="button" className="btn-primary">Sign in to get started</button>
          </SignInButton>
        </div>
      </Show>
    </div>
  );
}
