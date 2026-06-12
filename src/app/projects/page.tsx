"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { PROJECT_COLORS, fmtProjectDate } from "@/lib/projects";
import {
  Briefcase, Plus, FolderOpen, FileSearch, ShieldAlert,
  MessageSquare, ChevronRight, X,
} from "lucide-react";

type ProjectCounts = {
  assessments: number;
  documents:   number;
  gaps:        number;
  open_gaps:   number;
  chats:       number;
};

type Project = {
  id:          string;
  name:        string;
  description: string | null;
  color:       string;
  created_at:  string;
  counts:      ProjectCounts;
};

function CreateProjectModal({ onClose, onCreated }: {
  onClose:    () => void;
  onCreated:  (id: string) => void;
}) {
  const [name, setName]       = useState("");
  const [desc, setDesc]       = useState("");
  const [color, setColor]     = useState(PROJECT_COLORS[0]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const submit = async () => {
    if (!name.trim()) { setError("Project name is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/folders", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ name: name.trim(), description: desc.trim(), color }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Create failed");
      onCreated(data.folder.id);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }}>
      <div style={{
        background: "var(--card)", border: "0.5px solid var(--bdr2)",
        borderRadius: 12, padding: "24px 28px", width: 420,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>New project</span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg3)" }}>
            <X size={15} />
          </button>
        </div>

        <label style={labelStyle}>Name</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. EU AI Act rollout"
          style={inputStyle}
        />

        <label style={{ ...labelStyle, marginTop: 12 }}>Description</label>
        <textarea
          value={desc}
          onChange={e => setDesc(e.target.value)}
          placeholder="What this project covers..."
          style={{ ...inputStyle, minHeight: 72, resize: "vertical" }}
        />

        <label style={{ ...labelStyle, marginTop: 12 }}>Colour</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {PROJECT_COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              style={{
                width: 22, height: 22, borderRadius: "50%", background: c,
                border: color === c ? "2px solid var(--fg)" : "2px solid transparent",
                cursor: "pointer",
              }}
            />
          ))}
        </div>

        {error && <p style={{ fontSize: 11, color: "var(--rh)", marginBottom: 10 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={ghostBtn}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving} style={primaryBtn}>
            {saving ? "Creating..." : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = () => {
    setLoading(true);
    fetch("/api/folders")
      .then(r => r.json())
      .then(d => { setProjects(d.folders ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <AppShell>
      <main className="main-area">
        <div className="main-scroll">
          <div className="chat-scroll">
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <p className="stag" style={{ marginBottom: 8 }}>Projects</p>
                <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.04em" }}>
                  Your compliance projects
                </h1>
                <p style={{ fontSize: 12, color: "var(--fg3)", marginTop: 6, maxWidth: 480 }}>
                  Group assessments, remediation gaps, documents, and GRC chats into project folders.
                </p>
              </div>
              <button type="button" className="btn-primary" style={{ fontSize: 12, padding: "8px 14px", gap: 6 }} onClick={() => setShowCreate(true)}>
                <Plus size={13} /> New project
              </button>
            </div>

            {loading && (
              <div style={{ textAlign: "center", color: "var(--fg3)", fontSize: 12, padding: "40px 0" }}>
                Loading projects...
              </div>
            )}

            {!loading && projects.length === 0 && (
              <div className="card" style={{ textAlign: "center", padding: "56px 24px" }}>
                <Briefcase size={32} color="var(--fg4)" style={{ margin: "0 auto 14px" }} />
                <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 8 }}>No projects yet</p>
                <p style={{ fontSize: 12, color: "var(--fg3)", marginBottom: 20 }}>
                  Create a project to organise assessments, gaps, and documents in one place.
                </p>
                <button type="button" className="btn-primary" onClick={() => setShowCreate(true)}>
                  Create your first project
                </button>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {projects.map(p => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="project-card"
                  style={{ borderTopColor: p.color }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, background: `${p.color}22`,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    }}>
                      <FolderOpen size={15} color={p.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)", marginBottom: 2 }}>
                        {p.name}
                      </div>
                      {p.description && (
                        <p style={{ fontSize: 11, color: "var(--fg3)", lineHeight: 1.45, margin: 0 }}>
                          {p.description}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={14} color="var(--fg3)" style={{ flexShrink: 0, marginTop: 2 }} />
                  </div>

                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 10, color: "var(--fg3)" }}>
                    <span><FileSearch size={10} style={{ display: "inline", marginRight: 3 }} />{p.counts.assessments} assessments</span>
                    <span><ShieldAlert size={10} style={{ display: "inline", marginRight: 3 }} />{p.counts.open_gaps} open gaps</span>
                    <span>{p.counts.documents} docs</span>
                    <span><MessageSquare size={10} style={{ display: "inline", marginRight: 3 }} />{p.counts.chats} chats</span>
                  </div>

                  <div style={{ fontSize: 10, color: "var(--fg4)", marginTop: 10 }}>
                    Created {fmtProjectDate(p.created_at)}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={id => { load(); window.location.href = `/projects/${id}`; }}
        />
      )}
    </AppShell>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, color: "var(--fg3)",
  textTransform: "uppercase", letterSpacing: "0.08em",
  display: "block", marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 10px", borderRadius: 6,
  border: "0.5px solid var(--bdr2)", background: "var(--card2)",
  color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif",
};

const ghostBtn: React.CSSProperties = {
  padding: "7px 16px", borderRadius: 6, border: "0.5px solid var(--bdr2)",
  background: "transparent", color: "var(--fg2)", fontSize: 12, cursor: "pointer",
};

const primaryBtn: React.CSSProperties = {
  padding: "7px 16px", borderRadius: 6, border: "none",
  background: "var(--fg)", color: "var(--bg)", fontSize: 12, fontWeight: 500, cursor: "pointer",
};
