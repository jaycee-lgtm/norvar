"use client";

import { Suspense, useState, useRef, useEffect } from "react";
import { Show, SignInButton } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import {
  ArrowUp, Globe, Layers, Database,
  FileText, Loader2, AlertTriangle,
  AlertCircle, Info, ShieldAlert,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type Gap = {
  severity:    "critical" | "high" | "medium";
  title:       string;
  detail?:     string;
  description?: string;
  remediation?: string;
  frameworks:  string[];
};

type Assessment = {
  title:       string;
  summary:     string;
  risk:        string;
  risk_summary?: string;
  risk_score:  { composite: number; tier: string };
  gaps:        Gap[];
  metrics?:    { label: string; value: string }[];
  frameworks?: string[];
};

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; assessment: Assessment };

// ── Gap severity icon ──────────────────────────────────────────────────────────

function SevIcon({ sev }: { sev: string }) {
  if (sev === "critical") return <AlertTriangle size={9} strokeWidth={2.5} />;
  if (sev === "high")     return <AlertCircle   size={9} strokeWidth={2.5} />;
  return <Info size={9} strokeWidth={2.5} />;
}

// ── Assessment card ────────────────────────────────────────────────────────────

function AssessmentCard({ a }: { a: Assessment }) {
  const [tab, setTab] = useState<"gaps" | "actions" | "frameworks">("gaps");
  const score = a.risk_score?.composite ?? 0;
  const gaps  = a.gaps ?? [];
  const crits = gaps.filter(g => g.severity === "critical");
  const highs = gaps.filter(g => g.severity === "high");
  const meds  = gaps.filter(g => g.severity === "medium");

  return (
    <div className="msg-ai-card fade-up">
      <div className="msg-ai-label">
        <ShieldAlert size={11} strokeWidth={2} color="var(--fg3)" />
        Norvar assessment
      </div>

      {/* Score */}
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

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "0.5px solid var(--bdr)", marginBottom: 12 }}>
        {(["gaps","actions","frameworks"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 10px", fontSize: 11, cursor: "pointer",
            background: "transparent", border: "none",
            fontFamily: "'Sora', sans-serif", letterSpacing: "-0.01em",
            color: tab === t ? "var(--fg)" : "var(--fg3)",
            fontWeight: tab === t ? 500 : 400,
            borderBottom: tab === t ? "1.5px solid var(--fg)" : "1.5px solid transparent",
            marginBottom: -1,
          }}>
            {t === "gaps"       && `Gaps (${gaps.length})`}
            {t === "actions"    && "Actions"}
            {t === "frameworks" && `Frameworks (${a.frameworks?.length ?? 0})`}
          </button>
        ))}
      </div>

      {/* Gap list */}
      {tab === "gaps" && (
        <div>
          {gaps.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--fg3)", padding: "8px 0" }}>No compliance gaps identified.</p>
          )}
          {[...crits, ...highs, ...meds].map((gap, i) => (
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

      {tab === "actions" && (
        <p style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.65 }}>
          Prioritised action plan coming in the next release.
        </p>
      )}

      {tab === "frameworks" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(a.frameworks ?? []).map(f => (
            <span key={f} style={{
              fontSize: 11, color: "var(--fg2)", background: "var(--card2)",
              padding: "3px 10px", borderRadius: 5,
              border: "0.5px solid var(--bdr)", fontFamily: "'JetBrains Mono', monospace",
            }}>{f}</span>
          ))}
        </div>
      )}

      {/* Action chips */}
      <div className="section-divider" />
      <div className="result-actions">
        <span className="result-action">Export PDF</span>
        <span className="result-action">Save to history</span>
        <span className="result-action">New assessment</span>
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
  const assessmentId = searchParams.get("id");

  const [messages,    setMessages]    = useState<Message[]>([]);
  const [input,       setInput]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [error,       setError]       = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef   = useRef<HTMLDivElement>(null);

  // Load saved assessment from history / sidebar links
  useEffect(() => {
    if (!assessmentId) {
      setMessages([]);
      setError("");
      return;
    }

    setLoadingSaved(true);
    setError("");

    fetch(`/api/assessments/${assessmentId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setMessages([
          { role: "user", content: data.description || data.title || "" },
          { role: "assistant", assessment: data },
        ]);
      })
      .catch((e: unknown) => {
        setMessages([]);
        setError(e instanceof Error ? e.message : "Failed to load assessment");
      })
      .finally(() => setLoadingSaved(false));
  }, [assessmentId]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const canSend = input.trim().length > 10 && !loading;

  const handleSend = async () => {
    if (!canSend) return;
    const text = input.trim();
    setInput("");
    setError("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const res  = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Assessment failed");
      setMessages(prev => [...prev, { role: "assistant", assessment: data }]);
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

  return (
    <div className="app-shell">
      <Show when="signed-in">
        <Sidebar />
        <div className="main-area">

          {/* HOME STATE */}
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
              <div className="input-wrap">
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
                  <button className="send-btn" onClick={handleSend} disabled={!canSend}>
                    {loading
                      ? <Loader2 size={16} className="spin" />
                      : <ArrowUp size={16} strokeWidth={2.5} />}
                  </button>
                </div>
                <div className="input-chips">
                  <span className="chip"><Globe    size={11} strokeWidth={1.75} />Jurisdictions</span>
                  <span className="chip"><Layers   size={11} strokeWidth={1.75} />Domains</span>
                  <span className="chip"><Database size={11} strokeWidth={1.75} />Data types</span>
                  <span className="chip"><FileText size={11} strokeWidth={1.75} />Upload contract</span>
                </div>
              </div>
              {error && (
                <p style={{ marginTop: 16, fontSize: 12, color: "var(--rh)" }}>{error}</p>
              )}
            </div>
          )}

          {/* CHAT STATE */}
          {!isHome && !loadingSaved && (
            <>
              <div className="chat-scroll" ref={scrollRef} style={{ maxWidth: "100%", padding: "24px 32px" }}>
                {messages.map((msg, i) => (
                  <div key={i} className={msg.role === "user" ? "msg-user fade-up" : "msg-ai"}>
                    {msg.role === "user"
                      ? msg.content
                      : <AssessmentCard a={msg.assessment} />}
                  </div>
                ))}
                {loading && (
                  <div className="msg-ai fade-up">
                    <div className="msg-ai-card">
                      <div className="msg-ai-label"><ShieldAlert size={11} color="var(--fg3)" />Norvar is assessing...</div>
                      <div style={{ display: "flex", gap: 5, padding: "8px 0" }}>
                        <span className="loading-dot" />
                        <span className="loading-dot" />
                        <span className="loading-dot" />
                      </div>
                    </div>
                  </div>
                )}
                {error && (
                  <p style={{ fontSize: 12, color: "var(--rh)", padding: "4px 0" }}>{error}</p>
                )}
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
                    <button className="chat-send-btn" onClick={handleSend} disabled={!canSend}>
                      {loading
                        ? <Loader2 size={14} className="spin" />
                        : <ArrowUp size={14} strokeWidth={2.5} />}
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
            <button className="btn-primary">Sign in to get started</button>
          </SignInButton>
        </div>
      </Show>
    </div>
  );
}
