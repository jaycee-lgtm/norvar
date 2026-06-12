"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle, Loader2, MessageSquare, Shield } from "lucide-react";
import { ESCALATION_STEPS, escalationStepIndex, formatDuration } from "@/lib/escalation";
import type { GapChatMessage } from "@/components/GapChat";

type AssessmentResult = {
  summary?: string;
  gaps?: Array<{
    title: string;
    severity: string;
    domain: string;
    detail?: string;
    frameworks?: string[];
    remediation?: string;
  }>;
  risk_tier?: string;
};

type EscalationData = {
  item: {
    id: string;
    assessment_id: string;
    project_title: string | null;
    assessment_number: string | null;
    gap_title: string;
    gap_severity: string;
    gap_domain: string;
    gap_detail: string | null;
    gap_frameworks: string[];
    remediation_steps: string | null;
    messages: GapChatMessage[];
    escalation_email: string;
    escalation_recipient_name: string | null;
    escalation_role: string | null;
    escalation_question: string | null;
    escalation_note: string | null;
    escalated_at: string | null;
    escalation_status: string | null;
    assignee_meta: Record<string, { role?: string; since: string }>;
    assigned_to: string[];
  };
  assessment: {
    id: string;
    title: string;
    description: string | null;
    risk_tier: string | null;
    result: AssessmentResult | null;
    created_at: string;
  } | null;
  users: Record<string, { id: string; name: string; email: string }>;
  activity: Array<{ id: string; action: string; detail: string | null; created_at: string }>;
};

const DOMAIN_LABELS: Record<string, string> = {
  privacy:       "Privacy",
  ai_governance: "AI Governance",
  cybersecurity: "Cybersecurity",
};

function SevBadge({ sev }: { sev: string }) {
  const colors: Record<string, string> = {
    critical: "var(--rh)", high: "var(--rm)", medium: "var(--rl)", low: "var(--fg3)",
  };
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
      color: colors[sev] ?? "var(--fg3)", textTransform: "uppercase",
    }}>
      {sev}
    </span>
  );
}

export default function EscalationViewPage({ token }: { token: string }) {
  const [data, setData]       = useState<EscalationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");
  const [response, setResponse] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/escalation/${token}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Not found");
      setData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  const patch = async (body: Record<string, unknown>) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/escalation/${token}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Update failed");
      }
      await load();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <Loader2 size={20} className="spin" color="var(--fg3)" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 24 }}>
        <p style={{ color: "var(--fg3)", fontSize: 13 }}>{error || "Escalation not found"}</p>
      </div>
    );
  }

  const { item, assessment, users, activity } = data;
  const stepIdx = escalationStepIndex(item.escalation_status as typeof ESCALATION_STEPS[number]["value"]);
  const result  = assessment?.result;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", color: "var(--fg)" }}>
      <header style={{
        padding: "14px 24px", borderBottom: "0.5px solid var(--bdr)",
        display: "flex", alignItems: "center", gap: 12, background: "var(--card)",
      }}>
        <Shield size={16} color="var(--fg3)" />
        <span style={{ fontSize: 13, fontWeight: 500 }}>Norvar escalation</span>
        <Link href="/remediation" style={{ marginLeft: "auto", fontSize: 11, color: "var(--fg3)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft size={11} /> Open in Norvar
        </Link>
      </header>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 20px 48px" }}>
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <SevBadge sev={item.gap_severity} />
            <span style={{ fontSize: 10, color: "var(--fg3)" }}>
              {DOMAIN_LABELS[item.gap_domain] ?? item.gap_domain}
            </span>
            {item.project_title && (
              <span style={{ fontSize: 10, color: "var(--fg2)" }}>{item.project_title}</span>
            )}
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 8px", lineHeight: 1.3 }}>{item.gap_title}</h1>
          {item.gap_detail && (
            <p style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.6, margin: 0 }}>{item.gap_detail}</p>
          )}
        </div>

        {/* Progress */}
        <div style={{
          padding: "14px 16px", background: "var(--card)", border: "0.5px solid var(--bdr2)",
          borderRadius: 8, marginBottom: 16,
        }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
            Escalation progress
          </div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 10 }}>
            {ESCALATION_STEPS.map((step, i) => (
              <span key={step.value} style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 4,
                background: stepIdx >= i ? "var(--rl-bg)" : "var(--card2)",
                color: stepIdx >= i ? "var(--rl)" : "var(--fg3)",
                border: `0.5px solid ${stepIdx >= i ? "var(--rl-bdr)" : "var(--bdr2)"}`,
              }}>
                {step.label}
              </span>
            ))}
          </div>
          {item.escalated_at && (
            <p style={{ fontSize: 11, color: "var(--fg3)", margin: 0 }}>
              Open for {formatDuration(item.escalated_at)}
            </p>
          )}
        </div>

        {/* Assignees */}
        {item.assigned_to.length > 0 && (
          <div style={{ ...sectionStyle, marginBottom: 16 }}>
            <h2 style={sectionTitleStyle}>People with this gap</h2>
            {item.assigned_to.map(id => {
              const profile = users[id];
              const meta    = item.assignee_meta?.[id];
              return (
                <div key={id} style={{ fontSize: 12, marginBottom: 8 }}>
                  <strong>{profile?.name ?? "Assignee"}</strong>
                  <span style={{ color: "var(--fg3)" }}>
                    {meta?.role ? ` · ${meta.role}` : ""}
                    {meta?.since ? ` · held ${formatDuration(meta.since)}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Question */}
        {(item.escalation_question || item.escalation_note) && (
          <div style={{ ...sectionStyle, marginBottom: 16, borderColor: "var(--rm-bdr)", background: "var(--rm-bg)" }}>
            <h2 style={{ ...sectionTitleStyle, color: "var(--rm)" }}>
              <AlertTriangle size={12} style={{ display: "inline", marginRight: 6 }} />
              Question for you
            </h2>
            {item.escalation_question && (
              <p style={{ fontSize: 13, color: "var(--fg)", margin: "0 0 8px", lineHeight: 1.55 }}>{item.escalation_question}</p>
            )}
            {item.escalation_note && (
              <p style={{ fontSize: 12, color: "var(--fg2)", margin: 0, lineHeight: 1.55 }}>{item.escalation_note}</p>
            )}
          </div>
        )}

        {/* Remediation chat */}
        <div style={{ ...sectionStyle, marginBottom: 16 }}>
          <h2 style={sectionTitleStyle}>
            <MessageSquare size={12} style={{ display: "inline", marginRight: 6 }} />
            Remediation chat
          </h2>
          {item.messages?.length ? item.messages.map((m, i) => (
            <div key={i} style={{
              marginBottom: 10, padding: "8px 10px", borderRadius: 6,
              background: m.role === "user" ? "var(--lift)" : "var(--card2)",
              border: "0.5px solid var(--bdr)",
            }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", marginBottom: 4 }}>
                {m.role === "user" ? "Team" : "Norvar"}
              </div>
              <p style={{ fontSize: 12, color: "var(--fg2)", margin: 0, lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{m.content}</p>
            </div>
          )) : (
            <p style={{ fontSize: 12, color: "var(--fg3)", margin: 0 }}>No chat messages yet.</p>
          )}
        </div>

        {/* Remediation steps */}
        {item.remediation_steps && (
          <div style={{ ...sectionStyle, marginBottom: 16 }}>
            <h2 style={sectionTitleStyle}>Recommended remediation</h2>
            <p style={{ fontSize: 12, color: "var(--fg2)", margin: 0, lineHeight: 1.55 }}>{item.remediation_steps}</p>
          </div>
        )}

        {/* Assessment */}
        {assessment && (
          <div style={{ ...sectionStyle, marginBottom: 16 }}>
            <h2 style={sectionTitleStyle}>Parent assessment</h2>
            <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 4px" }}>{assessment.title}</p>
            {assessment.risk_tier && (
              <p style={{ fontSize: 11, color: "var(--fg3)", margin: "0 0 8px" }}>
                Overall risk: {assessment.risk_tier}
              </p>
            )}
            {result?.summary && (
              <p style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.55, margin: "0 0 12px" }}>{result.summary}</p>
            )}
            {result?.gaps && result.gaps.length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", marginBottom: 8 }}>
                  All gaps ({result.gaps.length})
                </p>
                {result.gaps.map((g, i) => (
                  <div key={i} style={{
                    padding: "8px 10px", marginBottom: 6, borderRadius: 6,
                    border: `0.5px solid ${g.title === item.gap_title ? "var(--rm-bdr)" : "var(--bdr2)"}`,
                    background: g.title === item.gap_title ? "var(--rm-bg)" : "var(--card2)",
                  }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                      <SevBadge sev={g.severity} />
                      <span style={{ fontSize: 12, fontWeight: 500 }}>{g.title}</span>
                    </div>
                    {g.detail && <p style={{ fontSize: 11, color: "var(--fg3)", margin: 0 }}>{g.detail}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Activity */}
        {activity.length > 0 && (
          <div style={{ ...sectionStyle, marginBottom: 16 }}>
            <h2 style={sectionTitleStyle}>Activity log</h2>
            {activity.map(a => (
              <div key={a.id} style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 6 }}>
                {a.detail ?? a.action}
                <span style={{ marginLeft: 8, opacity: 0.7 }}>
                  {new Date(a.created_at).toLocaleString("en-GB")}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Recipient actions */}
        <div style={{ ...sectionStyle }}>
          <h2 style={sectionTitleStyle}>Your response</h2>
          <textarea
            value={response}
            onChange={e => setResponse(e.target.value)}
            placeholder="Add your review notes or answer..."
            style={{
              width: "100%", minHeight: 80, padding: "10px 12px", borderRadius: 6,
              border: "0.5px solid var(--bdr2)", background: "var(--card2)",
              color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif",
              resize: "vertical", marginBottom: 10,
            }}
          />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" disabled={submitting} onClick={() => patch({ status: "in_review" })} style={btnStyle}>
              Start review
            </button>
            <button
              type="button"
              disabled={submitting || !response.trim()}
              onClick={() => { patch({ response_note: response.trim() }); setResponse(""); }}
              style={{ ...btnStyle, background: "var(--fg)", color: "var(--bg)", border: "none" }}
            >
              <CheckCircle size={11} style={{ display: "inline", marginRight: 4 }} />
              Submit response
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const sectionStyle: React.CSSProperties = {
  padding: "14px 16px", background: "var(--card)",
  border: "0.5px solid var(--bdr2)", borderRadius: 8,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: "var(--fg2)",
  textTransform: "uppercase", letterSpacing: "0.06em",
  margin: "0 0 10px",
};

const btnStyle: React.CSSProperties = {
  padding: "7px 14px", borderRadius: 6, fontSize: 12,
  border: "0.5px solid var(--bdr2)", background: "transparent",
  color: "var(--fg2)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
};
