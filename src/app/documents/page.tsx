"use client";

import { useState, useEffect, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import {
  Upload, Archive, Trash2, FolderOpen,
  Download, Search, ChevronDown, X,
} from "lucide-react";

interface Document {
  id:          string;
  name:        string;
  description: string | null;
  file_path:   string;
  file_size:   number | null;
  file_type:   string | null;
  status:      "active" | "archived" | "deleted";
  tags:        string[];
  folder_id:   string | null;
  created_at:  string;
}

interface Folder {
  id:    string;
  name:  string;
  color: string;
}

function fmt_size(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmt_date(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fileIcon(type: string | null) {
  if (!type) return "FILE";
  if (type === "pdf")  return "PDF";
  if (type === "docx" || type === "doc") return "DOC";
  if (type === "txt")  return "TXT";
  return type.toUpperCase().slice(0, 4);
}

function UploadModal({ folders, onClose, onUploaded }: {
  folders:    Folder[];
  onClose:    () => void;
  onUploaded: () => void;
}) {
  const fileRef                 = useRef<HTMLInputElement>(null);
  const [file, setFile]         = useState<File | null>(null);
  const [name, setName]         = useState("");
  const [desc, setDesc]         = useState("");
  const [folderId, setFolderId] = useState("");
  const [tags, setTags]         = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError]       = useState("");

  const handleFile = (f: File) => {
    setFile(f);
    setName(f.name);
  };

  const submit = async () => {
    if (!file || !name.trim()) { setError("File and name required"); return; }
    setUploading(true);
    setError("");
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
      const res = await fetch("/api/documents", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:        name.trim(),
          description: desc.trim() || null,
          file_type:   ext,
          file_size:   file.size,
          folder_id:   folderId || null,
          tags:        tags.split(",").map(t => t.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");

      await fetch(data.uploadUrl, {
        method:  "PUT",
        body:    file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });

      onUploaded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
    }}>
      <div style={{
        background: "var(--card)", border: "0.5px solid var(--bdr2)",
        borderRadius: 12, padding: "24px 28px", width: 440, maxWidth: "95vw",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>Upload document</span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--fg3)" }}>
            <X size={16} />
          </button>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          style={{
            border: `1.5px dashed ${file ? "var(--bdr3)" : "var(--bdr2)"}`,
            borderRadius: 8, padding: "20px 16px", textAlign: "center",
            cursor: "pointer", marginBottom: 16,
            background: file ? "var(--lift)" : "transparent",
            transition: "all 0.15s",
          }}
        >
          <Upload size={18} color="var(--fg3)" style={{ margin: "0 auto 6px" }} />
          {file
            ? <p style={{ fontSize: 12, color: "var(--fg)", fontWeight: 500 }}>{file.name}</p>
            : <p style={{ fontSize: 12, color: "var(--fg3)" }}>Click or drag to upload — PDF, DOCX, TXT</p>
          }
          <input ref={fileRef} type="file" accept=".pdf,.docx,.doc,.txt" style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </div>

        {[
          { label: "Name", value: name, set: setName, placeholder: "Document name" },
          { label: "Description", value: desc, set: setDesc, placeholder: "Optional description" },
          { label: "Tags", value: tags, set: setTags, placeholder: "Comma-separated tags" },
        ].map(({ label, value, set, placeholder }) => (
          <div key={label} style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
              {label}
            </label>
            <input
              value={value} onChange={e => set(e.target.value)} placeholder={placeholder}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6,
                border: "0.5px solid var(--bdr2)", background: "var(--card2)",
                color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif",
              }}
            />
          </div>
        ))}

        {folders.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>
              Folder
            </label>
            <select
              value={folderId} onChange={e => setFolderId(e.target.value)}
              style={{
                width: "100%", padding: "8px 10px", borderRadius: 6,
                border: "0.5px solid var(--bdr2)", background: "var(--card2)",
                color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif",
              }}
            >
              <option value="">No folder</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}

        {error && <p style={{ fontSize: 11, color: "var(--rh)", marginBottom: 12 }}>{error}</p>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} style={{
            padding: "7px 16px", borderRadius: 6, border: "0.5px solid var(--bdr2)",
            background: "transparent", color: "var(--fg2)", fontSize: 12, cursor: "pointer",
          }}>Cancel</button>
          <button type="button" onClick={submit} disabled={uploading || !file} style={{
            padding: "7px 16px", borderRadius: 6, border: "none",
            background: uploading || !file ? "var(--lift)" : "var(--fg)",
            color: uploading || !file ? "var(--fg3)" : "var(--bg)",
            fontSize: 12, fontWeight: 500, cursor: uploading || !file ? "not-allowed" : "pointer",
          }}>
            {uploading ? "Uploading..." : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocRow({ doc, onAction }: {
  doc:      Document;
  onAction: (id: string, action: "archive" | "delete" | "restore") => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 16px",
      background: "var(--card)", border: "0.5px solid var(--bdr2)",
      borderRadius: 8,
    }}
      onMouseEnter={e => (e.currentTarget.style.background = "var(--lift)")}
      onMouseLeave={e => (e.currentTarget.style.background = "var(--card)")}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 6, background: "var(--card2)",
        border: "0.5px solid var(--bdr2)", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <span style={{ fontSize: 8, fontWeight: 700, color: "var(--fg3)", letterSpacing: "0.05em" }}>
          {fileIcon(doc.file_type)}
        </span>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {doc.name}
        </div>
        <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 1 }}>
          {fmt_size(doc.file_size)} · {fmt_date(doc.created_at)}
          {doc.tags.length > 0 && (
            <span style={{ marginLeft: 8 }}>
              {doc.tags.map(t => (
                <span key={t} style={{
                  fontSize: 10, padding: "1px 6px", borderRadius: 10, marginRight: 4,
                  background: "var(--card2)", color: "var(--fg3)", border: "0.5px solid var(--bdr)",
                }}>{t}</span>
              ))}
            </span>
          )}
        </div>
      </div>

      {doc.status === "archived" && (
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "var(--card2)", color: "var(--fg3)", border: "0.5px solid var(--bdr)" }}>
          Archived
        </span>
      )}

      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          style={{ background: "none", border: "0.5px solid var(--bdr2)", borderRadius: 5, padding: "4px 8px", cursor: "pointer", color: "var(--fg3)", display: "flex", alignItems: "center", gap: 3 }}
        >
          <span style={{ fontSize: 11 }}>Actions</span>
          <ChevronDown size={10} />
        </button>
        {open && (
          <div style={{
            position: "absolute", right: 0, top: "calc(100% + 4px)", width: 160,
            background: "var(--card)", border: "0.5px solid var(--bdr2)",
            borderRadius: 8, overflow: "hidden", zIndex: 50,
          }}>
            {[
              { label: "Download", icon: <Download size={12} />, action: () => {} },
              doc.status === "active"
                ? { label: "Archive", icon: <Archive size={12} />, action: () => { onAction(doc.id, "archive"); setOpen(false); } }
                : { label: "Restore", icon: <FolderOpen size={12} />, action: () => { onAction(doc.id, "restore"); setOpen(false); } },
              { label: "Delete", icon: <Trash2 size={12} />, action: () => { onAction(doc.id, "delete"); setOpen(false); }, danger: true },
            ].map(({ label, icon, action, danger }) => (
              <button key={label} type="button" onClick={action} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "8px 12px", background: "none", border: "none",
                fontSize: 12, color: danger ? "var(--rh)" : "var(--fg2)", cursor: "pointer",
                textAlign: "left", fontFamily: "'Sora', sans-serif",
              }}
                onMouseEnter={e => (e.currentTarget.style.background = "var(--lift)")}
                onMouseLeave={e => (e.currentTarget.style.background = "none")}
              >
                {icon}{label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  const [docs, setDocs]                 = useState<Document[]>([]);
  const [folders, setFolders]           = useState<Folder[]>([]);
  const [loading, setLoading]           = useState(true);
  const [showUpload, setShowUpload]     = useState(false);
  const [search, setSearch]             = useState("");
  const [filterStatus, setFilterStatus] = useState<"active" | "archived">("active");
  const [filterFolder, setFilterFolder] = useState("");

  const load = async () => {
    setLoading(true);
    const [docsRes, foldersRes] = await Promise.all([
      fetch(`/api/documents?status=${filterStatus}${filterFolder ? `&folder_id=${filterFolder}` : ""}`),
      fetch("/api/folders"),
    ]);
    const docsData    = await docsRes.json();
    const foldersData = await foldersRes.json();
    setDocs(docsData.documents ?? []);
    setFolders(foldersData.folders ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [filterStatus, filterFolder]);

  const handleAction = async (id: string, action: "archive" | "delete" | "restore") => {
    const statusMap = { archive: "archived", delete: "deleted", restore: "active" } as const;
    await fetch("/api/documents", {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ id, status: statusMap[action] }),
    });
    load();
  };

  const filtered = docs.filter(d =>
    !search || d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
  );

  const folderFilters = folders.length > 0 ? (
    <>
      <div className="sidebar-section">Folders</div>
      <button
        type="button"
        onClick={() => setFilterFolder("")}
        className={`sidebar-nav-item${!filterFolder ? " active" : ""}`}
        style={{ width: "100%", textAlign: "left" }}
      >
        All folders
      </button>
      {folders.map(f => (
        <button
          key={f.id}
          type="button"
          onClick={() => setFilterFolder(filterFolder === f.id ? "" : f.id)}
          className={`sidebar-nav-item${filterFolder === f.id ? " active" : ""}`}
          style={{ width: "100%", textAlign: "left" }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 2, background: f.color, flexShrink: 0 }} />
          {f.name}
        </button>
      ))}
    </>
  ) : null;

  return (
    <div className="app-shell">
      <Sidebar extra={folderFilters} />
      <main className="main-area">
        <div style={{
          padding: "16px 24px", borderBottom: "0.5px solid var(--bdr)",
          display: "flex", alignItems: "center", gap: 12,
          background: "var(--card)", flexShrink: 0,
        }}>
          <FolderOpen size={14} color="var(--fg3)" />
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", flex: 1 }}>Documents</span>

          <div style={{ position: "relative" }}>
            <Search size={12} color="var(--fg3)" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)" }} />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search documents..."
              style={{
                paddingLeft: 28, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
                borderRadius: 6, border: "0.5px solid var(--bdr2)", background: "var(--card2)",
                color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif", width: 220,
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 4 }}>
            {(["active", "archived"] as const).map(s => (
              <button key={s} type="button" onClick={() => setFilterStatus(s)} style={{
                padding: "5px 12px", borderRadius: 5, fontSize: 11, fontWeight: 500,
                border: `0.5px solid ${filterStatus === s ? "var(--bdr3)" : "var(--bdr2)"}`,
                background: filterStatus === s ? "var(--lift)" : "transparent",
                color: filterStatus === s ? "var(--fg)" : "var(--fg3)", cursor: "pointer",
                fontFamily: "'Sora', sans-serif", textTransform: "capitalize",
              }}>{s}</button>
            ))}
          </div>

          <button type="button" onClick={() => setShowUpload(true)} style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 6,
            background: "var(--fg)", color: "var(--bg)",
            border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer",
            fontFamily: "'Sora', sans-serif",
          }}>
            <Upload size={12} /> Upload
          </button>
        </div>

        <div style={{
          padding: "10px 24px", borderBottom: "0.5px solid var(--bdr)",
          display: "flex", gap: 20, background: "var(--card2)",
          flexShrink: 0,
        }}>
          {[
            { label: "Total",    value: docs.length },
            { label: "Active",   value: docs.filter(d => d.status === "active").length },
            { label: "Archived", value: docs.filter(d => d.status === "archived").length },
          ].map(({ label, value }) => (
            <div key={label} style={{ fontSize: 11, color: "var(--fg3)" }}>
              <span style={{ fontWeight: 600, color: "var(--fg)", marginRight: 4 }}>{value}</span>{label}
            </div>
          ))}
        </div>

        <div className="chat-scroll">
          {loading && (
            <div style={{ textAlign: "center", color: "var(--fg3)", fontSize: 12, padding: "40px 0" }}>
              Loading...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <FolderOpen size={28} color="var(--fg4)" style={{ margin: "0 auto 12px" }} />
              <p style={{ fontSize: 13, color: "var(--fg3)" }}>
                {search ? "No documents match your search" : "No documents yet — upload your first one"}
              </p>
            </div>
          )}
          {!loading && filtered.map(doc => (
            <DocRow key={doc.id} doc={doc} onAction={handleAction} />
          ))}
        </div>
      </main>

      {showUpload && (
        <UploadModal folders={folders} onClose={() => setShowUpload(false)} onUploaded={load} />
      )}
    </div>
  );
}
