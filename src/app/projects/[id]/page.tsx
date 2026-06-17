"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/AppShell";
import HoverTip from "@/components/HoverTip";
import { fmtProjectDate } from "@/lib/projects";
import { normalizeGapSeverity, normalizeRiskTier } from "@/lib/risk-tiers";
import {
  ArrowLeft, FileSearch, ShieldAlert, MessageSquare, Upload,
  Plus, Trash2, X, ExternalLink,
} from "lucide-react";

type ProjectDetail = {
  folder: {
    id: string; name: string; description: string | null; color: string; created_at: string;
  };
  assessments: Array<{
    id: string; title: string; assessment_number: string | null;
    risk_tier: string; risk_score: number; created_at: string;
  }>;
  documents: Array<{
    id: string; name: string; file_type: string | null; file_size: number | null; created_at: string;
  }>;
  gaps: Array<{
    id: string; gap_title: string; gap_severity: string; status: string;
    assessment_number: string | null; created_at: string;
  }>;
  chats: Array<{ id: string; title: string | null; updated_at: string }>;
  counts: {
    assessments: number; documents: number; gaps: number; open_gaps: number; chats: number;
  };
};

function AddItemModal({
  title,
  items,
  emptyLabel,
  onClose,
  onAdd,
}: {
  title:      string;
  items:      Array<{ id: string; label: string; meta?: string }>;
  emptyLabel: string;
  onClose:    () => void;
  onAdd:      (id: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="app-modal-backdrop" style={{
      position: "fixed", inset: 0, background: "var(--overlay)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }}>
      <div className="app-modal-panel" style={{
        background: "var(--card)", border: "0.5px solid var(--bdr2)",
        borderRadius: 12, padding: "20px 24px", width: 440, maxHeight: "70vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 13, fontWeight: 500 }}>{title}</span>
          <HoverTip label="Close">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg3)" }}
            >
              <X size={15} />
            </button>
          </HoverTip>
        </div>
        {items.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--fg3)" }}>{emptyLabel}</p>
        ) : (
          items.map(item => (
            <button
              key={item.id}
              type="button"
              disabled={busy === item.id}
              onClick={async () => {
                setBusy(item.id);
                await onAdd(item.id);
                setBusy(null);
                onClose();
              }}
              style={{
                width: "100%", textAlign: "left", padding: "10px 12px", marginBottom: 6,
                borderRadius: 6, border: "0.5px solid var(--bdr2)", background: "var(--card2)",
                cursor: busy === item.id ? "wait" : "pointer", fontFamily: "'Sora', sans-serif",
              }}
            >
              <div style={{ fontSize: 12, color: "var(--fg)" }}>{item.label}</div>
              {item.meta && <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 2 }}>{item.meta}</div>}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export default function ProjectDetailPage() {
  const params   = useParams();
  const router   = useRouter();
  const id       = params.id as string;

  const [data, setData]           = useState<ProjectDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [addType, setAddType]     = useState<"assessment" | "document" | "chat" | null>(null);
  const [available, setAvailable] = useState<Array<{ id: string; label: string; meta?: string }>>([]);

  const load = async () => {
    setLoading(true);
    try {
      const res  = await fetch(`/api/folders?id=${id}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Not found");
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const patchItem = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/folders", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id, ...body }),
    });
    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error || "Update failed");
    }
    await load();
  };

  const deleteProject = async () => {
    if (!data || !confirm(`Delete project "${data.folder.name}"? Assessments and documents will be kept but unlinked.`)) return;
    await fetch("/api/folders", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id }),
    });
    router.push("/projects");
  };

  const openAddModal = async (type: "assessment" | "document" | "chat") => {
    setAddType(type);
    const inProject = new Set(
      type === "assessment" ? data?.assessments.map(a => a.id)
      : type === "document" ? data?.documents.map(d => d.id)
      : data?.chats.map(c => c.id),
    );

    if (type === "assessment") {
      const res = await fetch("/api/assessments?limit=50");
      const json = await res.json();
      setAvailable((json.assessments ?? [])
        .filter((a: { id: string; folder_id?: string | null }) => !a.folder_id && !inProject.has(a.id))
        .map((a: { id: string; title: string; assessment_number?: string | null }) => ({
          id:    a.id,
          label: a.title,
          meta:  a.assessment_number ?? undefined,
        })));
    } else if (type === "document") {
      const res = await fetch("/api/documents?status=active");
      const json = await res.json();
      setAvailable((json.documents ?? [])
        .filter((d: { id: string }) => !inProject.has(d.id))
        .map((d: { id: string; name: string; file_type: string | null; folder_id?: string | null }) => ({
          id:    d.id,
          label: d.name,
          meta:  d.file_type?.toUpperCase() ?? undefined,
        })));
    } else {
      const res = await fetch("/api/conversations?limit=50");
      const json = await res.json();
      setAvailable((json.conversations ?? [])
        .filter((c: { id: string }) => !inProject.has(c.id))
        .map((c: { id: string; title: string | null }) => ({
          id:    c.id,
          label: c.title || "Untitled chat",
        })));
    }
  };

  if (loading) {
    return (
      <AppShell>
        <main className="main-area"><div style={{ padding: 40, color: "var(--fg3)", fontSize: 12 }}>Loading...</div></main>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <main className="main-area"><div style={{ padding: 40, color: "var(--fg3)", fontSize: 12 }}>Project not found</div></main>
      </AppShell>
    );
  }

  const { folder, assessments, documents, gaps, chats, counts } = data;

  return (
    <AppShell>
      <main className="main-area">
        <div className="main-scroll">
          <div className="chat-scroll">
            <Link href="/projects" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--fg3)", textDecoration: "none", marginBottom: 16 }}>
              <ArrowLeft size={12} /> All projects
            </Link>

            <div className="project-header" style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 20 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: `${folder.color}22`,
                  borderTop: `3px solid ${folder.color}`, display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <FileSearch size={18} color={folder.color} />
                </div>
                <div>
                  <h1 style={{ fontSize: 20, fontWeight: 500, margin: "0 0 4px", letterSpacing: "-0.03em" }}>{folder.name}</h1>
                  {folder.description && <p style={{ fontSize: 12, color: "var(--fg3)", margin: "0 0 6px" }}>{folder.description}</p>}
                  <p style={{ fontSize: 10, color: "var(--fg4)", margin: 0 }}>Created {fmtProjectDate(folder.created_at)}</p>
                </div>
              </div>
              <div className="project-header-actions">
              <button type="button" onClick={deleteProject} style={{
                display: "inline-flex", alignItems: "center", gap: 4, padding: "6px 10px",
                borderRadius: 6, border: "0.5px solid var(--bdr2)", background: "transparent",
                color: "var(--fg3)", fontSize: 11, cursor: "pointer",
              }}>
                <Trash2 size={12} /> Delete project
              </button>
              </div>
            </div>

            <div style={{
              display: "flex", gap: 16, flexWrap: "wrap", padding: "12px 16px", marginBottom: 20,
              background: "var(--card2)", border: "0.5px solid var(--bdr2)", borderRadius: 8,
            }}>
              {[
                { label: "Assessments", value: counts.assessments },
                { label: "Open gaps",   value: counts.open_gaps },
                { label: "Documents",   value: counts.documents },
                { label: "Chats",       value: counts.chats },
              ].map(({ label, value }) => (
                <div key={label} style={{ fontSize: 11, color: "var(--fg3)" }}>
                  <span style={{ fontWeight: 600, color: "var(--fg)", marginRight: 4 }}>{value}</span>{label}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
              <Link href={`/assess?folder=${id}`} className="btn-primary" style={{ fontSize: 11, padding: "6px 12px", gap: 5 }}>
                <Plus size={11} /> New assessment
              </Link>
              <Link href={`/documents?folder=${id}`} className="btn-secondary" style={{ fontSize: 11, padding: "6px 12px", gap: 5 }}>
                <Upload size={11} /> Upload document
              </Link>
              <Link href={`/chat?folder=${id}`} className="btn-secondary" style={{ fontSize: 11, padding: "6px 12px", gap: 5 }}>
                <MessageSquare size={11} /> New chat
              </Link>
            </div>

            <ProjectSection
              title="Assessments"
              count={assessments.length}
              onAdd={() => openAddModal("assessment")}
              empty="No assessments in this project yet."
            >
              {assessments.map(a => (
                <ProjectRow
                  key={a.id}
                  href={`/assess?id=${a.id}`}
                  title={a.title}
                  meta={`${a.assessment_number ?? "—"} · ${normalizeRiskTier(a.risk_tier)} risk`}
                  onRemove={() => patchItem({ remove_item: { type: "assessment", id: a.id } })}
                />
              ))}
            </ProjectSection>

            <ProjectSection
              title="Remediation gaps"
              count={gaps.length}
              empty="Gaps appear here when assessments in this project are added to the remediation queue."
            >
              {gaps.map(g => (
                <ProjectRow
                  key={g.id}
                  href="/remediation"
                  title={g.gap_title}
                  meta={`${normalizeGapSeverity(g.gap_severity)} · ${g.status.replace("_", " ")}${(g as { gap_id?: string | null }).gap_id ? ` · ${(g as { gap_id?: string | null }).gap_id}` : g.assessment_number ? ` · ${g.assessment_number}` : ""}`}
                />
              ))}
            </ProjectSection>

            <ProjectSection
              title="Documents"
              count={documents.length}
              onAdd={() => openAddModal("document")}
              empty="No documents in this project yet."
            >
              {documents.map(d => (
                <ProjectRow
                  key={d.id}
                  href="/documents"
                  title={d.name}
                  meta={d.file_type?.toUpperCase() ?? "FILE"}
                  onRemove={() => patchItem({ remove_item: { type: "document", id: d.id } })}
                />
              ))}
            </ProjectSection>

            <ProjectSection
              title="GRC chats"
              count={chats.length}
              onAdd={() => openAddModal("chat")}
              empty="No chats linked to this project yet."
            >
              {chats.map(c => (
                <ProjectRow
                  key={c.id}
                  href={`/chat?id=${c.id}`}
                  title={c.title || "Untitled chat"}
                  meta={fmtProjectDate(c.updated_at)}
                  onRemove={() => patchItem({ remove_item: { type: "chat", id: c.id } })}
                />
              ))}
            </ProjectSection>
          </div>
        </div>
      </main>

      {addType && (
        <AddItemModal
          title={`Add ${addType} to project`}
          items={available}
          emptyLabel={`No unlinked ${addType}s available.`}
          onClose={() => setAddType(null)}
          onAdd={async itemId => patchItem({ add_item: { type: addType, id: itemId } })}
        />
      )}
    </AppShell>
  );
}

function ProjectSection({
  title, count, onAdd, empty, children,
}: {
  title: string; count: number; onAdd?: () => void; empty: string; children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <h2 style={{ fontSize: 11, fontWeight: 600, color: "var(--fg2)", textTransform: "uppercase", letterSpacing: "0.08em", margin: 0 }}>
          {title} ({count})
        </h2>
        {onAdd && (
          <button type="button" onClick={onAdd} style={{
            fontSize: 10, color: "var(--fg3)", background: "none", border: "none",
            cursor: "pointer", fontFamily: "'Sora', sans-serif",
          }}>
            + Add existing
          </button>
        )}
      </div>
      {count === 0 ? (
        <p style={{ fontSize: 12, color: "var(--fg3)", margin: 0, padding: "12px 14px", background: "var(--card2)", borderRadius: 8, border: "0.5px solid var(--bdr2)" }}>
          {empty}
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
      )}
    </section>
  );
}

function ProjectRow({
  href, title, meta, onRemove,
}: {
  href: string; title: string; meta?: string; onRemove?: () => void;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px", background: "var(--card)", border: "0.5px solid var(--bdr2)", borderRadius: 8,
    }}>
      <Link href={href} style={{ flex: 1, minWidth: 0, textDecoration: "none", color: "inherit" }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>
        {meta && <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 2 }}>{meta}</div>}
      </Link>
      <HoverTip label={`Open ${title}`}>
        <Link href={href} style={{ color: "var(--fg3)", flexShrink: 0 }} aria-label={`Open ${title}`}>
          <ExternalLink size={12} />
        </Link>
      </HoverTip>
      {onRemove && (
        <HoverTip label="Remove from project">
          <button type="button" onClick={onRemove} aria-label="Remove from project" style={{
            background: "none", border: "none", color: "var(--fg3)", cursor: "pointer", flexShrink: 0,
          }}>
            <X size={12} />
          </button>
        </HoverTip>
      )}
    </div>
  );
}
