"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { User, UserPlus, X, ArrowRightLeft, Search, Loader2 } from "lucide-react";
import type { UserProfile } from "@/lib/clerk-users";

type OrgInfo = { id: string; name: string };

type AssigneeManagerProps = {
  itemId:        string;
  assessmentId:  string;
  projectTitle?: string | null;
  assignedTo:    string[];
  profiles:      Record<string, UserProfile>;
  onUpdate:      () => void;
};

export default function AssigneeManager({
  itemId,
  assessmentId,
  projectTitle,
  assignedTo,
  profiles,
  onUpdate,
}: AssigneeManagerProps) {
  const [mode, setMode]           = useState<"idle" | "add" | "reassign">("idle");
  const [scope, setScope]         = useState<"gap" | "project">("gap");
  const [query, setQuery]         = useState("");
  const [email, setEmail]         = useState("");
  const [members, setMembers]     = useState<UserProfile[]>([]);
  const [organization, setOrganization] = useState<OrgInfo | null>(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState("");

  useEffect(() => {
    if (mode === "idle") return;

    const timer = setTimeout(async () => {
      setLoadingMembers(true);
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set("q", query.trim());
        const res  = await fetch(`/api/org/members?${params}`);
        const data = await res.json();
        setMembers(data.members ?? []);
        setOrganization(data.organization ?? null);
      } catch {
        setMembers([]);
      } finally {
        setLoadingMembers(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [mode, query]);

  const patch = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const payload = scope === "project"
        ? { ...body, assessment_id: assessmentId, scope: "project" }
        : { id: itemId, ...body };

      const res = await fetch("/api/remediation", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      setQuery("");
      setEmail("");
      setMode("idle");
      onUpdate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const remove = (uid: string) => {
    if (assignedTo.length <= 1) {
      setError("At least one assignee is required. Add someone else first, or use Reassign.");
      return;
    }
    patch({ remove_assignee: uid });
  };

  const addMember = (member: UserProfile) => {
    if (scope === "gap" && assignedTo.includes(member.id)) {
      setError(`${member.name} is already assigned`);
      return;
    }
    patch({ add_assignee: member.id });
  };

  const reassignMember = (member: UserProfile) => patch({ reassign_to: member.id });

  const addByEmail = () => patch({ add_assignee_email: email });
  const reassignByEmail = () => patch({ reassign_email: email });

  const label = (uid: string) => profiles[uid]?.name ?? "Unknown user";

  const visibleMembers = members.filter(m =>
    mode === "reassign" || scope === "project" || !assignedTo.includes(m.id),
  );

  const closePanel = () => {
    setMode("idle");
    setScope("gap");
    setQuery("");
    setEmail("");
    setError("");
  };

  const scopeLabel = scope === "project"
    ? projectTitle ?? "this project"
    : "this gap";

  return (
    <div onClick={e => e.stopPropagation()}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 8, gap: 8, flexWrap: "wrap",
      }}>
        <div style={{
          fontSize: 10, fontWeight: 600, color: "var(--fg3)",
          textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          Assigned to ({assignedTo.length})
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => { setMode(m => m === "add" ? "idle" : "add"); setScope("gap"); setError(""); setQuery(""); }}
            style={actionBtnStyle}
          >
            <UserPlus size={10} /> Add
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => { setMode(m => m === "reassign" ? "idle" : "reassign"); setScope("gap"); setError(""); setQuery(""); }}
            style={actionBtnStyle}
          >
            <ArrowRightLeft size={10} /> Reassign
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: mode !== "idle" ? 10 : 0 }}>
        {assignedTo.map(uid => (
          <span key={uid} style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontSize: 11, padding: "3px 8px 3px 6px", borderRadius: 20,
            background: "var(--card2)", color: "var(--fg2)", border: "0.5px solid var(--bdr2)",
          }}>
            <User size={9} />
            {label(uid)}
            <button
              type="button"
              disabled={busy}
              onClick={() => remove(uid)}
              title="Remove assignee"
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "none", cursor: busy ? "not-allowed" : "pointer",
                padding: 0, color: "var(--fg3)", marginLeft: 2,
              }}
            >
              <X size={10} />
            </button>
          </span>
        ))}
      </div>

      {mode !== "idle" && (
        <div className="assignee-picker">
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {(["gap", "project"] as const).map(s => (
              <button
                key={s}
                type="button"
                disabled={busy}
                onClick={() => setScope(s)}
                style={{
                  ...actionBtnStyle,
                  borderColor: scope === s ? "var(--bdr3)" : "var(--bdr2)",
                  background:  scope === s ? "var(--lift)" : "transparent",
                  color:       scope === s ? "var(--fg)" : "var(--fg3)",
                }}
              >
                {s === "gap" ? "This gap" : "Entire project"}
              </button>
            ))}
          </div>

          {organization ? (
            <>
              <div style={{ fontSize: 10, color: "var(--fg3)", marginBottom: 8 }}>
                {mode === "reassign" ? "Reassign" : "Add to"} {scopeLabel}
                {organization.name && <> · {organization.name}</>}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
                <Search size={12} color="var(--fg3)" style={{ flexShrink: 0 }} />
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search by name or email..."
                  disabled={busy}
                  autoFocus
                  style={inputStyle}
                />
              </div>

              <div className="assignee-picker-list">
                {loadingMembers && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 4px", color: "var(--fg3)", fontSize: 11 }}>
                    <Loader2 size={12} className="spin" /> Searching...
                  </div>
                )}
                {!loadingMembers && visibleMembers.length === 0 && (
                  <p style={{ fontSize: 11, color: "var(--fg3)", padding: "8px 4px" }}>
                    {query.trim() ? "No members match your search." : "No other members found."}
                  </p>
                )}
                {!loadingMembers && visibleMembers.map(member => (
                  <button
                    key={member.id}
                    type="button"
                    disabled={busy}
                    onClick={() => mode === "add" ? addMember(member) : reassignMember(member)}
                    className="assignee-picker-row"
                  >
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--fg)" }}>{member.name}</span>
                    {member.email && (
                      <span style={{ fontSize: 10, color: "var(--fg3)" }}>{member.email}</span>
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p style={{ fontSize: 11, color: "var(--fg3)", marginBottom: 8, lineHeight: 1.5 }}>
                No organization selected. Use the org switcher in the sidebar, or add by email below.
              </p>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="Colleague's email address"
                  disabled={busy}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (mode === "add") addByEmail();
                      else reassignByEmail();
                    }
                  }}
                  style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                />
                <button
                  type="button"
                  disabled={busy || !email.trim()}
                  onClick={mode === "add" ? addByEmail : reassignByEmail}
                  style={primaryBtnStyle(busy || !email.trim())}
                >
                  {busy ? "Saving..." : mode === "add" ? "Add" : "Reassign"}
                </button>
              </div>
            </>
          )}

          {mode === "reassign" && (
            <p style={{ fontSize: 10, color: "var(--fg3)", marginTop: 8, lineHeight: 1.45 }}>
              {scope === "project"
                ? "Reassigns every gap in this project to one person."
                : "Reassign replaces all assignees on this gap with one person."}
            </p>
          )}

          <button type="button" disabled={busy} onClick={closePanel} style={{ ...actionBtnStyle, marginTop: 10 }}>
            Cancel
          </button>
        </div>
      )}

      {error && <p style={{ fontSize: 11, color: "var(--rh)", marginTop: 6 }}>{error}</p>}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 5,
  border: "0.5px solid var(--bdr2)",
  background: "var(--card)",
  color: "var(--fg)",
  fontSize: 12,
  fontFamily: "'Sora', sans-serif",
};

const actionBtnStyle: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 4,
  padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 500,
  border: "0.5px solid var(--bdr2)", background: "transparent",
  color: "var(--fg3)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
};

function primaryBtnStyle(disabled: boolean): CSSProperties {
  return {
    padding: "6px 12px", borderRadius: 5, fontSize: 11, fontWeight: 500,
    border: "none", background: "var(--fg)", color: "var(--bg)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontFamily: "'Sora', sans-serif", opacity: disabled ? 0.5 : 1,
  };
}
