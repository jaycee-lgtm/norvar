"use client";

import { useState } from "react";
import { Shield, AlertTriangle, CheckCircle, XCircle, Copy, Check } from "lucide-react";
import type { RedlineClause, RedlineOutput, RedlineStatus } from "@/lib/redline";

const SEV_STYLES = {
  high:   { bg: "var(--rh-bg, #FCEBEB)",  color: "var(--rh, #A32D2D)",  bdr: "var(--rh-bdr, #E8C4C4)", label: "High"   },
  medium: { bg: "var(--rm-bg, #FAEEDA)",  color: "var(--rm, #854F0B)",  bdr: "var(--rm-bdr, #DEBB88)", label: "Medium" },
  low:    { bg: "var(--card2, #f5f0eb)",  color: "var(--fg3, #a8998e)", bdr: "var(--bdr2, #e8e0d8)",  label: "Low"    },
};

const STATUS_STYLES: Record<RedlineStatus, { label: string; color: string }> = {
  non_compliant: { label: "Non-compliant", color: "var(--rh, #A32D2D)"  },
  missing:       { label: "Missing",       color: "var(--rh, #A32D2D)"  },
  weak:          { label: "Weak",          color: "var(--rm, #854F0B)"  },
  recommend:     { label: "Recommend",     color: "var(--rl, #3B6D11)"  },
  compliant:     { label: "Compliant",     color: "var(--fg3, #a8998e)" },
};

const OVERALL_STYLES = {
  do_not_sign:        { label: "Do Not Sign",        bg: "var(--rh-bg)",  color: "var(--rh)",  icon: <XCircle size={14} /> },
  significant_issues: { label: "Significant Issues", bg: "var(--rm-bg)",  color: "var(--rm)",  icon: <AlertTriangle size={14} /> },
  needs_work:         { label: "Needs Work",          bg: "var(--rl-bg)",  color: "var(--rl)",  icon: <AlertTriangle size={14} /> },
  clean:              { label: "Clean",               bg: "var(--card2)",  color: "var(--fg3)", icon: <CheckCircle size={14} /> },
};

const DOMAIN_LABELS: Record<string, string> = {
  privacy: "Privacy", ai_governance: "AI Governance", cybersecurity: "Cybersecurity",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{
        display: "flex", alignItems: "center", gap: 4,
        padding: "3px 8px", borderRadius: 4, border: "0.5px solid var(--bdr2)",
        background: "var(--card2)", color: "var(--fg3)", fontSize: 10,
        fontWeight: 500, cursor: "pointer", flexShrink: 0,
      }}
    >
      {copied ? <Check size={10} /> : <Copy size={10} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function ClauseCard({ clause, index }: { clause: RedlineClause; index: number }) {
  const [open, setOpen] = useState(index < 3);
  const sev    = SEV_STYLES[clause.severity] ?? SEV_STYLES.low;
  const status = STATUS_STYLES[clause.status] ?? STATUS_STYLES.compliant;

  return (
    <div style={{
      border: `0.5px solid ${sev.bdr}`,
      borderLeft: `3px solid ${sev.color}`,
      borderRadius: 8, background: "var(--card)", marginBottom: 8, overflow: "hidden",
    }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10 }}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
          background: sev.bg, color: sev.color, border: `0.5px solid ${sev.bdr}`,
          textTransform: "uppercase", letterSpacing: "0.5px", flexShrink: 0, marginTop: 1,
        }}>
          {sev.label}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10, color: "var(--fg3)", fontWeight: 500 }}>{clause.clause_number}</span>
            <span style={{ fontSize: 10, color: "var(--fg3)" }}>·</span>
            <span style={{ fontSize: 10, color: status.color, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.4px" }}>
              {status.label}
            </span>
            <span style={{ fontSize: 10, color: "var(--fg3)" }}>·</span>
            <span style={{ fontSize: 10, color: "var(--fg3)" }}>
              {DOMAIN_LABELS[clause.domain] ?? clause.domain}
            </span>
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", lineHeight: 1.35 }}>
            {clause.clause_title}
          </div>
        </div>

        <span style={{
          color: "var(--fg3)", fontSize: 13, display: "inline-block",
          transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.15s", flexShrink: 0,
        }}>▾</span>
      </div>

      {open && (
        <div style={{ borderTop: "0.5px solid var(--bdr)", padding: "14px 16px" }}>
          {clause.original_text && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
                Current language
              </div>
              <div style={{
                fontSize: 12, color: "var(--fg2)", lineHeight: 1.6,
                padding: "10px 12px", background: "var(--card2)",
                border: "0.5px solid var(--bdr)", borderRadius: 6, fontStyle: "italic",
              }}>
                &ldquo;{clause.original_text}&rdquo;
              </div>
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>
              Issue
            </div>
            <div style={{ fontSize: 13, color: "var(--fg)", lineHeight: 1.6 }}>{clause.issue}</div>
          </div>

          {clause.suggested_text && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.8px" }}>
                  Suggested language
                </div>
                <CopyButton text={clause.suggested_text} />
              </div>
              <div style={{
                fontSize: 12, color: "var(--fg)", lineHeight: 1.7,
                padding: "10px 12px",
                background: "rgba(59, 109, 17, 0.05)",
                border: "0.5px solid rgba(59, 109, 17, 0.2)",
                borderRadius: 6,
              }}>
                {clause.suggested_text}
              </div>
            </div>
          )}

          {clause.frameworks?.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {clause.frameworks.map((fw, i) => (
                <span key={i} style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 4,
                  background: "var(--card2)", color: "var(--fg3)",
                  border: "0.5px solid var(--bdr2)", fontWeight: 500,
                }}>
                  {fw}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function RedlineCard({ redline }: { redline: RedlineOutput }) {
  const overall = OVERALL_STYLES[redline.overall_status] ?? OVERALL_STYLES.needs_work;
  const agentLabel = redline.redline_by === "nora" ? "Nora" : "Cassius";
  const highCount   = redline.clauses.filter(c => c.severity === "high").length;
  const mediumCount = redline.clauses.filter(c => c.severity === "medium").length;

  return (
    <div style={{ fontFamily: "var(--font-sora, 'Sora', sans-serif)" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6, marginBottom: 12,
        fontSize: 11, color: "var(--fg3)", fontWeight: 500,
      }}>
        <Shield size={11} color="var(--fg3)" />
        {agentLabel} · Agreement Review
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", borderRadius: 8, marginBottom: 16,
        background: overall.bg, border: `0.5px solid ${overall.color}20`,
      }}>
        <span style={{ color: overall.color }}>{overall.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: overall.color }}>{overall.label}</div>
          <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2 }}>
            {redline.agreement_type}
            {redline.governing_law ? ` · ${redline.governing_law}` : ""}
            {redline.parties?.length > 0 ? ` · ${redline.parties.join(" — ")}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {highCount > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--rm)" }}>{highCount}</div>
              <div style={{ fontSize: 9, color: "var(--fg3)", textTransform: "uppercase" }}>High</div>
            </div>
          )}
          {mediumCount > 0 && (
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--rl)" }}>{mediumCount}</div>
              <div style={{ fontSize: 9, color: "var(--fg3)", textTransform: "uppercase" }}>Medium</div>
            </div>
          )}
        </div>
      </div>

      <p style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.7, marginBottom: 20 }}>{redline.summary}</p>

      {redline.missing_clauses?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>
            Missing clauses
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {redline.missing_clauses.map((m, i) => (
              <span key={i} style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 4,
                background: "var(--rh-bg)", color: "var(--rh)",
                border: "0.5px solid var(--rh-bdr)", fontWeight: 500,
              }}>
                ✕ {m}
              </span>
            ))}
          </div>
        </div>
      )}

      {redline.clauses?.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 10 }}>
            Clause review · {redline.clauses.length} issue{redline.clauses.length !== 1 ? "s" : ""}
          </div>
          {redline.clauses.map((clause, i) => (
            <ClauseCard key={i} clause={clause} index={i} />
          ))}
        </div>
      )}

      {redline.positive_clauses?.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>
            Well drafted
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {redline.positive_clauses.map((p, i) => (
              <span key={i} style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 4,
                background: "var(--rl-bg)", color: "var(--rl)",
                border: "0.5px solid var(--rl-bdr)", fontWeight: 500,
              }}>
                ✓ {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {redline.frameworks?.length > 0 && (
        <div style={{ paddingTop: 12, borderTop: "0.5px solid var(--bdr)" }}>
          <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>
            Applicable frameworks
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {redline.frameworks.map((fw, i) => (
              <span key={i} style={{
                fontSize: 10, padding: "2px 7px", borderRadius: 4,
                background: "var(--card2)", color: "var(--fg3)",
                border: "0.5px solid var(--bdr2)", fontWeight: 500,
              }}>
                {fw}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
