"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, FileText, FolderOpen, Loader2, Plus, Search, Upload, X } from "lucide-react";
import type { UserDocument } from "@/lib/documents";
import { useFloatingMenuStyles } from "@/hooks/useFloatingMenuStyles";
import HoverTip from "@/components/HoverTip";

type DocumentPickerProps = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  folderId?: string | null;
  disabled?: boolean;
  label?: string;
  variant?: "chip" | "icon";
  menuAlign?: "start" | "end";
  onUpload?: () => void;
  uploading?: boolean;
  uploadAttached?: boolean;
};

function fileLabel(type: string | null) {
  if (!type) return "FILE";
  return type.toUpperCase().slice(0, 4);
}

export default function DocumentPicker({
  selectedIds,
  onChange,
  folderId,
  disabled = false,
  label = "Attach doc",
  variant = "chip",
  menuAlign = "end",
  onUpload,
  uploading = false,
  uploadAttached = false,
}: DocumentPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen]           = useState(false);
  const [view, setView]           = useState<"menu" | "library">("menu");
  const [docs, setDocs]           = useState<UserDocument[]>([]);
  const [loading, setLoading]     = useState(false);
  const [query, setQuery]         = useState("");

  const isIcon = variant === "icon";
  const attachmentCount = selectedIds.length + (uploadAttached ? 1 : 0);
  const libraryActive = open && (!isIcon || view === "library");
  const pickerWidth = view === "library" ? 320 : 220;
  const floatingMenuStyle = useFloatingMenuStyles(open && isIcon, ref, {
    placement: "top",
    align:     menuAlign,
    width:     pickerWidth,
  });

  useEffect(() => {
    if (!libraryActive) return;
    setLoading(true);
    const params = new URLSearchParams({ status: "active" });
    if (folderId) params.set("folder_id", folderId);
    fetch(`/api/documents?${params}`)
      .then(r => r.json())
      .then(d => setDocs(d.documents ?? []))
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [libraryActive, folderId]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (ref.current?.contains(target)) return;
      if (target instanceof Element && target.closest(".doc-picker-menu--floating, .doc-picker-popover--floating")) {
        return;
      }
      setOpen(false);
      setView("menu");
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const close = () => {
    setOpen(false);
    setView("menu");
    setQuery("");
  };

  const stopMenuEvent = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
  };

  const toggle = () => {
    if (open) {
      close();
      return;
    }
    setOpen(true);
    setView(isIcon ? "menu" : "library");
  };

  const openLibrary = () => setView("library");

  const handleUpload = () => {
    onUpload?.();
    close();
  };

  const filtered = docs.filter(d =>
    !query.trim() || d.name.toLowerCase().includes(query.toLowerCase()),
  );

  const toggleDoc = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter(x => x !== id)
        : [...selectedIds, id],
    );
  };

  const libraryPanel = (
    <div className="doc-picker-panel">
      {isIcon && (
        <button type="button" className="doc-picker-back" onClick={() => setView("menu")}>
          <ChevronLeft size={14} strokeWidth={2} />
          Back
        </button>
      )}
      <div style={{ padding: "10px 12px", borderBottom: "0.5px solid var(--bdr)" }}>
        <div style={{ position: "relative" }}>
          <Search size={12} color="var(--fg3)" style={{ position: "absolute", left: 8, top: 9 }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search documents..."
            style={{
              width: "100%", padding: "7px 10px 7px 28px", borderRadius: 6,
              border: "0.5px solid var(--bdr2)", background: "var(--card2)",
              color: "var(--fg)", fontSize: 12, fontFamily: "'Sora', sans-serif",
            }}
          />
        </div>
      </div>

      <div style={{ overflowY: "auto", padding: 6 }}>
        {loading && (
          <p style={{ fontSize: 11, color: "var(--fg3)", padding: "8px 10px" }}>Loading...</p>
        )}
        {!loading && filtered.length === 0 && (
          <p style={{ fontSize: 11, color: "var(--fg3)", padding: "8px 10px" }}>
            {folderId ? "No documents in this project yet." : "No documents found. Upload some in Documents."}
          </p>
        )}
        {!loading && filtered.map(doc => {
          const checked = selectedIds.includes(doc.id);
          return (
            <button
              key={doc.id}
              type="button"
              onClick={() => toggleDoc(doc.id)}
              style={{
                width: "100%", textAlign: "left", padding: "8px 10px",
                borderRadius: 6, border: "none", cursor: "pointer",
                background: checked ? "var(--lift)" : "transparent",
                fontFamily: "'Sora', sans-serif",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  width: 14, height: 14, borderRadius: 3, flexShrink: 0,
                  border: `0.5px solid ${checked ? "var(--fg)" : "var(--bdr2)"}`,
                  background: checked ? "var(--fg)" : "transparent",
                }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{
                    fontSize: 12, color: "var(--fg)", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {doc.name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--fg3)", marginTop: 1 }}>
                    {fileLabel(doc.file_type)}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedIds.length > 0 && (
        <div style={{
          padding: "8px 10px", borderTop: "0.5px solid var(--bdr)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 10, color: "var(--fg3)" }}>
            {selectedIds.length} selected
          </span>
          <button
            type="button"
            onClick={() => onChange([])}
            style={{
              fontSize: 10, color: "var(--fg3)", background: "transparent",
              border: "none", cursor: "pointer", fontFamily: "'Sora', sans-serif",
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );

  const floatingSurfaceStyle = {
    ...floatingMenuStyle,
    background:   "var(--card)",
    border:       "0.5px solid var(--bdr2)",
    borderRadius: 10,
    boxShadow:    "var(--shadow-md)",
  } as const;

  const attachMenu = open && isIcon && view === "menu" ? (
    <div className="doc-picker-menu doc-picker-menu--floating" style={floatingSurfaceStyle}>
      <button type="button" className="doc-picker-menu-item" onClick={openLibrary}>
        <FolderOpen size={14} strokeWidth={1.75} />
        From documents
      </button>
      {onUpload && (
        <button type="button" className="doc-picker-menu-item" onClick={handleUpload} disabled={uploading}>
          <Upload size={14} strokeWidth={1.75} />
          {uploading ? "Reading file…" : "Upload file"}
        </button>
      )}
    </div>
  ) : null;

  const libraryPopover = open && (!isIcon || view === "library") ? (
    <div
      className={`doc-picker-popover${isIcon ? " doc-picker-popover--wide doc-picker-popover--floating" : ""}`}
      style={isIcon ? floatingSurfaceStyle : undefined}
    >
      {libraryPanel}
    </div>
  ) : null;

  return (
    <div ref={ref} className="doc-picker-wrap">
      {isIcon ? (
        <HoverTip label="Attach a document or upload a file">
          <button
            type="button"
            className="attach-icon-btn attach-plus-btn"
            disabled={disabled || uploading}
            onPointerDown={stopMenuEvent}
            onClick={(e) => {
              stopMenuEvent(e);
              toggle();
            }}
            aria-label="Attach a document or upload a file"
          >
            {uploading
              ? <Loader2 size={22} className="spin" strokeWidth={2} />
              : <Plus size={22} strokeWidth={2} />}
            {attachmentCount > 0 && (
              <span className="attach-icon-badge">{attachmentCount}</span>
            )}
          </button>
        </HoverTip>
      ) : (
        <button
          type="button"
          className="chip"
          disabled={disabled}
          onClick={toggle}
        >
          <FileText size={11} strokeWidth={1.75} />
          {label}
          {selectedIds.length > 0 && (
            <span style={{
              fontSize: 9, background: "var(--fg)", color: "var(--bg)",
              padding: "0 5px", borderRadius: 10, fontWeight: 600,
            }}>
              {selectedIds.length}
            </span>
          )}
        </button>
      )}

      {isIcon && typeof document !== "undefined" && createPortal(
        <>
          {attachMenu}
          {libraryPopover}
        </>,
        document.body,
      )}

      {!isIcon && attachMenu}
      {!isIcon && libraryPopover}
    </div>
  );
}

export function SelectedDocumentChips({
  documents,
  onRemove,
}: {
  documents: Array<{ id: string; name: string }>;
  onRemove: (id: string) => void;
}) {
  if (!documents.length) return null;
  return (
    <>
      {documents.map(doc => (
        <span
          key={doc.id}
          style={{
            fontSize: 11, color: "var(--fg2)", background: "var(--card2)",
            padding: "2px 9px", borderRadius: 20, border: "0.5px solid var(--bdr2)",
            display: "inline-flex", alignItems: "center", gap: 5,
            fontFamily: "'Sora', sans-serif",
          }}
        >
          <FileText size={10} strokeWidth={2} />
          {doc.name}
          <HoverTip label={`Remove ${doc.name}`}>
            <button
              type="button"
              onClick={() => onRemove(doc.id)}
              aria-label={`Remove ${doc.name}`}
              style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
            >
              <X size={10} strokeWidth={2} color="var(--fg3)" />
            </button>
          </HoverTip>
        </span>
      ))}
    </>
  );
}
