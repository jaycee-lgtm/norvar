"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ExternalLink, Search } from "lucide-react";
import {
  CATALOG_DOMAIN_LABELS,
  CATALOG_STATUS_LABELS,
  filterCatalogEntries,
  groupCatalog,
  REGULATORY_CATALOG,
  type CatalogDomain,
  type RegulatoryCatalogEntry,
} from "@/lib/regulatory-catalog";
import {
  fetchUserAiSettings,
  saveUserAiSettings,
  type UserAiSettings,
} from "@/lib/user-ai-settings";

const STATUS_COLORS: Record<string, { color: string; bg: string; bdr: string }> = {
  in_force:  { color: "var(--rl)",  bg: "var(--rl-bg)",  bdr: "var(--rl-bdr)"  },
  upcoming:  { color: "var(--rm)",  bg: "var(--rm-bg)",  bdr: "var(--rm-bdr)"  },
  advancing: { color: "var(--rm)",  bg: "var(--rm-bg)",  bdr: "var(--rm-bdr)"  },
  watch:     { color: "var(--fg3)", bg: "var(--card2)",  bdr: "var(--bdr)"     },
};

type FrameworkRowProps = {
  entry:      RegulatoryCatalogEntry;
  selected:   boolean;
  onToggle:   (abbr: string) => void;
};

function FrameworkRow({ entry, selected, onToggle }: FrameworkRowProps) {
  const sc = STATUS_COLORS[entry.status] || STATUS_COLORS.watch;

  return (
    <div
      className="card"
      style={{
        padding: "12px 14px",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 10,
        alignItems: "start",
      }}
    >
      <button
        type="button"
        aria-pressed={selected}
        aria-label={`${selected ? "Deselect" : "Select"} ${entry.abbr}`}
        onClick={() => onToggle(entry.abbr)}
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          border: `0.5px solid ${selected ? "var(--accent)" : "var(--bdr2)"}`,
          background: selected ? "var(--accent)" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          flexShrink: 0,
          marginTop: 2,
        }}
      >
        {selected && <Check size={11} strokeWidth={2.5} color="var(--on-red)" />}
      </button>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "6px 8px", marginBottom: 4 }}>
          <p style={{
            fontSize: 13, fontWeight: 600, color: "var(--fg)",
            letterSpacing: "-0.02em", fontFamily: "'Sora', sans-serif", margin: 0,
          }}>
            {entry.abbr}
          </p>
          <span style={{
            fontSize: 9, fontWeight: 500, padding: "2px 6px",
            borderRadius: 4, whiteSpace: "nowrap",
            color: sc.color, background: sc.bg, border: `0.5px solid ${sc.bdr}`,
            fontFamily: "'Sora', sans-serif",
          }}>
            {CATALOG_STATUS_LABELS[entry.status] ?? entry.status}
          </span>
          {entry.year && (
            <span style={{ fontSize: 10, color: "var(--fg4)", fontFamily: "'Sora', sans-serif" }}>
              {entry.year}
            </span>
          )}
        </div>
        <p style={{
          fontSize: 11.5, color: "var(--fg2)", lineHeight: 1.5, margin: "0 0 4px",
          fontFamily: "'Sora', sans-serif",
        }}>
          {entry.name}
        </p>
        {entry.notes && (
          <p style={{
            fontSize: 11, color: "var(--fg3)", lineHeight: 1.45, margin: 0,
            fontFamily: "'Sora', sans-serif",
          }}>
            {entry.notes}
          </p>
        )}
      </div>

      {entry.sourceUrl ? (
        <a
          href={entry.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open official framework text"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "var(--accent)",
            textDecoration: "none",
            whiteSpace: "nowrap",
            padding: "4px 8px",
            borderRadius: 5,
            border: "0.5px solid var(--bdr2)",
            background: "var(--card2)",
            fontFamily: "'Sora', sans-serif",
          }}
        >
          Source
          <ExternalLink size={11} strokeWidth={2} />
        </a>
      ) : (
        <span style={{ fontSize: 10, color: "var(--fg4)" }}>—</span>
      )}
    </div>
  );
}

export default function FrameworkCatalogPanel() {
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState<CatalogDomain | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [savedSelected, setSavedSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [scopeMode, setScopeMode] = useState<"all" | "selected">("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await fetchUserAiSettings();
        if (cancelled) return;
        const abbrs = settings.selectedFrameworkAbbrs ?? [];
        const next = new Set(abbrs);
        setSelected(next);
        setSavedSelected(new Set(next));
        setScopeMode(abbrs.length > 0 ? "selected" : "all");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filteredEntries = useMemo(
    () => filterCatalogEntries(search, domain),
    [search, domain],
  );

  const grouped = useMemo(() => groupCatalog(filteredEntries), [filteredEntries]);

  const isDirty = useMemo(() => {
    if (selected.size !== savedSelected.size) return true;
    for (const abbr of selected) {
      if (!savedSelected.has(abbr)) return true;
    }
    return false;
  }, [selected, savedSelected]);

  const toggleAbbr = useCallback((abbr: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(abbr)) next.delete(abbr);
      else next.add(abbr);
      return next;
    });
    setScopeMode("selected");
  }, []);

  const selectVisible = useCallback(() => {
    setSelected(prev => {
      const next = new Set(prev);
      for (const entry of filteredEntries) next.add(entry.abbr);
      return next;
    });
    setScopeMode("selected");
  }, [filteredEntries]);

  const clearSelection = useCallback(() => {
    setSelected(new Set());
    setScopeMode("all");
  }, []);

  const useAllFrameworks = useCallback(() => {
    setSelected(new Set());
    setScopeMode("all");
  }, []);

  const persistSelection = useCallback(async (abbrs: string[]) => {
    setSaving(true);
    setSaveError(null);
    try {
      const settings: UserAiSettings = await saveUserAiSettings({
        selectedFrameworkAbbrs: abbrs,
      });
      const next = new Set(settings.selectedFrameworkAbbrs);
      setSelected(next);
      setSavedSelected(new Set(next));
      setScopeMode(next.size > 0 ? "selected" : "all");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save selection");
    } finally {
      setSaving(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    const abbrs = scopeMode === "all" ? [] : [...selected];
    await persistSelection(abbrs);
  }, [persistSelection, scopeMode, selected]);

  const domainFilters: (CatalogDomain | "all")[] = ["all", "privacy", "ai", "cyber"];

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <p className="stag" style={{ marginBottom: 8 }}>Regulatory corpus</p>
        <h1 style={{
          fontSize: 22, fontWeight: 500, letterSpacing: "-0.04em",
          marginBottom: 4, fontFamily: "'Sora', sans-serif",
        }}>
          Frameworks
        </h1>
        <p style={{ fontSize: 13, color: "var(--fg2)", fontFamily: "'Sora', sans-serif" }}>
          {REGULATORY_CATALOG.length} frameworks across privacy, AI, and cybersecurity — grouped by jurisdiction
        </p>
      </div>

      {/* Output scope */}
      <div className="card" style={{ padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)", marginBottom: 4, fontFamily: "'Sora', sans-serif" }}>
              Output scope
            </p>
            <p style={{ fontSize: 11.5, color: "var(--fg3)", margin: 0, fontFamily: "'Sora', sans-serif", maxWidth: 520 }}>
              {scopeMode === "all" || selected.size === 0
                ? "Assessments and chat use the full corpus. Select specific frameworks to limit citations and RAG retrieval."
                : `${selected.size} framework${selected.size !== 1 ? "s" : ""} selected for assessments and chat output.`}
            </p>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            <button
              type="button"
              onClick={useAllFrameworks}
              style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 11.5,
                border: `0.5px solid ${scopeMode === "all" ? "var(--accent)" : "var(--bdr2)"}`,
                background: scopeMode === "all" ? "var(--lift)" : "transparent",
                color: "var(--fg2)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
              }}
            >
              Use all
            </button>
            <button
              type="button"
              onClick={selectVisible}
              disabled={filteredEntries.length === 0}
              style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 11.5,
                border: "0.5px solid var(--bdr2)", background: "transparent",
                color: "var(--fg2)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
              }}
            >
              Select visible
            </button>
            <button
              type="button"
              onClick={clearSelection}
              style={{
                padding: "6px 12px", borderRadius: 6, fontSize: 11.5,
                border: "0.5px solid var(--bdr2)", background: "transparent",
                color: "var(--fg2)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading || !isDirty}
              style={{
                padding: "6px 14px", borderRadius: 6, fontSize: 11.5, fontWeight: 500,
                border: "0.5px solid var(--accent)", background: "var(--accent)",
                color: "var(--on-red)", cursor: saving || !isDirty ? "not-allowed" : "pointer",
                opacity: saving || !isDirty ? 0.6 : 1,
                fontFamily: "'Sora', sans-serif",
              }}
            >
              {saving ? "Saving..." : "Save selection"}
            </button>
          </div>
        </div>
        {saveError && (
          <p style={{ fontSize: 11, color: "var(--rh)", marginTop: 10, marginBottom: 0 }}>
            {saveError}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="framework-filters" style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
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
          {domainFilters.map(d => (
            <button key={d} onClick={() => setDomain(d)} style={{
              padding: "7px 12px", borderRadius: 6, fontSize: 12,
              border: "0.5px solid var(--bdr2)",
              background: domain === d ? "var(--lift)" : "transparent",
              color: domain === d ? "var(--fg)" : "var(--fg3)",
              fontWeight: domain === d ? 500 : 400,
              cursor: "pointer", fontFamily: "'Sora', sans-serif",
              letterSpacing: "-0.01em",
            }}>
              {d === "all" ? "All domains" : CATALOG_DOMAIN_LABELS[d]}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <p style={{ fontSize: 12, color: "var(--fg3)", fontFamily: "'Sora', sans-serif" }}>
          Loading your framework preferences...
        </p>
      )}

      {!loading && grouped.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--fg3)" }}>No frameworks match your search.</p>
      )}

      {!loading && grouped.map(section => (
        <section key={section.domain} style={{ marginBottom: 28 }}>
          <h2 style={{
            fontSize: 15, fontWeight: 600, color: "var(--fg)",
            letterSpacing: "-0.03em", marginBottom: 14,
            fontFamily: "'Sora', sans-serif",
            borderBottom: "0.5px solid var(--bdr)",
            paddingBottom: 8,
          }}>
            {section.domainLabel}
            <span style={{ fontSize: 11, fontWeight: 400, color: "var(--fg3)", marginLeft: 8 }}>
              {section.jurisdictions.reduce((n, j) => n + j.frameworks.length, 0)} frameworks
            </span>
          </h2>

          {section.jurisdictions.map(jurisdiction => (
            <div key={`${section.domain}-${jurisdiction.label}`} style={{ marginBottom: 18 }}>
              <h3 style={{
                fontSize: 12, fontWeight: 500, color: "var(--fg2)",
                letterSpacing: "-0.02em", marginBottom: 8,
                fontFamily: "'Sora', sans-serif",
              }}>
                {jurisdiction.label}
                <span style={{ color: "var(--fg4)", fontWeight: 400, marginLeft: 6 }}>
                  ({jurisdiction.frameworks.length})
                </span>
              </h3>
              <div style={{ display: "grid", gap: 8 }}>
                {jurisdiction.frameworks.map(entry => (
                  <FrameworkRow
                    key={entry.id}
                    entry={entry}
                    selected={selected.has(entry.abbr)}
                    onToggle={toggleAbbr}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
