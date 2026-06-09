"use client";

import Sidebar from "@/components/Sidebar";
import { Search } from "lucide-react";
import { useState } from "react";
import FRAMEWORKS from "@/lib/frameworks";

const DOMAIN_LABELS: Record<string, string> = {
  ai: "AI", privacy: "Privacy", cyber: "Cybersecurity",
  cv: "Computer Vision", adm: "Auto Decisioning",
  robotics: "Robotics", standards: "Standards",
};

const STATUS_COLORS: Record<string, { color: string; bg: string; bdr: string }> = {
  in_force:  { color: "var(--rl)",  bg: "var(--rl-bg)",  bdr: "var(--rl-bdr)"  },
  upcoming:  { color: "var(--rm)",  bg: "var(--rm-bg)",  bdr: "var(--rm-bdr)"  },
  advancing: { color: "var(--rm)",  bg: "var(--rm-bg)",  bdr: "var(--rm-bdr)"  },
  watch:     { color: "var(--fg3)", bg: "var(--card2)",  bdr: "var(--bdr)"     },
};

export default function FrameworksPage() {
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("all");

  const filtered = FRAMEWORKS.filter(f => {
    const matchSearch = !search ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.abbr.toLowerCase().includes(search.toLowerCase()) ||
      f.jurisdiction.toLowerCase().includes(search.toLowerCase());
    const matchDomain = domain === "all" || f.domain === domain;
    return matchSearch && matchDomain;
  });

  const domains = ["all", ...Array.from(new Set(FRAMEWORKS.map(f => f.domain)))];

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area" style={{ overflowY: "auto" }}>
        <div className="page-body" style={{ margin: "0 auto" }}>

          <div style={{ marginBottom: 24 }}>
            <p className="stag" style={{ marginBottom: 8 }}>Regulatory corpus</p>
            <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.04em", marginBottom: 4, fontFamily: "'Sora', sans-serif" }}>
              Frameworks
            </h1>
            <p style={{ fontSize: 13, color: "var(--fg2)", fontFamily: "'Sora', sans-serif" }}>
              {FRAMEWORKS.length} frameworks across 6 regulatory domains
            </p>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--card)", border: "0.5px solid var(--bdr2)",
              borderRadius: 7, padding: "7px 12px", flex: 1, minWidth: 200,
            }}>
              <Search size={13} strokeWidth={2} color="var(--fg3)" />
              <input
                placeholder="Search frameworks..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  flex: 1, background: "transparent", border: "none",
                  outline: "none", fontSize: 13, color: "var(--fg)",
                  fontFamily: "'Sora', sans-serif", letterSpacing: "-0.01em",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {domains.map(d => (
                <button key={d} onClick={() => setDomain(d)} style={{
                  padding: "7px 12px", borderRadius: 6, fontSize: 12,
                  border: "0.5px solid var(--bdr2)",
                  background: domain === d ? "var(--lift)" : "transparent",
                  color: domain === d ? "var(--fg)" : "var(--fg3)",
                  fontWeight: domain === d ? 500 : 400,
                  cursor: "pointer", fontFamily: "'Sora', sans-serif",
                  letterSpacing: "-0.01em",
                }}>
                  {d === "all" ? "All" : DOMAIN_LABELS[d] || d}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
            {filtered.map(fw => {
              const sc = STATUS_COLORS[fw.status] || STATUS_COLORS.watch;
              return (
                <div key={fw.abbr} className="card" style={{ padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", letterSpacing: "-0.02em", fontFamily: "'Sora', sans-serif" }}>
                        {fw.abbr}
                      </p>
                      <p style={{ fontSize: 10, color: "var(--fg3)", fontFamily: "'Sora', sans-serif", marginTop: 1 }}>
                        {fw.jurisdiction}
                      </p>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 500, padding: "2px 7px",
                      borderRadius: 4, whiteSpace: "nowrap",
                      color: sc.color, background: sc.bg, border: `0.5px solid ${sc.bdr}`,
                      fontFamily: "'Sora', sans-serif",
                    }}>
                      {fw.status.replace("_", " ")}
                    </span>
                  </div>
                  <p style={{ fontSize: 11.5, color: "var(--fg2)", lineHeight: 1.55, marginBottom: 10, fontFamily: "'Sora', sans-serif" }}>
                    {fw.tagline}
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {fw.controls.slice(0, 3).map(c => (
                      <span key={c} style={{
                        fontSize: 9, color: "var(--fg3)", background: "var(--card2)",
                        padding: "2px 7px", borderRadius: 4, border: "0.5px solid var(--bdr)",
                        fontFamily: "'JetBrains Mono', monospace",
                      }}>{c}</span>
                    ))}
                    {fw.controls.length > 3 && (
                      <span style={{ fontSize: 9, color: "var(--fg4)", padding: "2px 4px", fontFamily: "'Sora', sans-serif" }}>
                        +{fw.controls.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      </div>
    </div>
  );
}
