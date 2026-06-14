"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import SettingsSection from "@/components/SettingsSection";
import type { UserProfile } from "@/lib/clerk-users";
import {
  fetchOrgAssigneeRoles,
  saveOrgAssigneeRoles,
  type OrgAssigneeRoles,
} from "@/lib/org-assignee-roles";

export default function GapOwnerRolesPanel() {
  const [members, setMembers]       = useState<UserProfile[]>([]);
  const [roles, setRoles]           = useState<OrgAssigneeRoles>({});
  const [drafts, setDrafts]         = useState<OrgAssigneeRoles>({});
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [savedAt, setSavedAt]       = useState<number | null>(null);
  const [error, setError]           = useState("");
  const [hasOrg, setHasOrg]         = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/org/members").then(r => r.json()),
      fetchOrgAssigneeRoles(),
    ])
      .then(([membersRes, savedRoles]) => {
        setMembers(membersRes.members ?? []);
        setHasOrg(!!membersRes.organization?.id);
        setRoles(savedRoles);
        setDrafts(savedRoles);
      })
      .catch(() => setError("Could not load gap owner roles."))
      .finally(() => setLoading(false));
  }, []);

  const persist = useCallback(async (nextRoles: OrgAssigneeRoles) => {
    setSaving(true);
    setError("");
    try {
      const saved = await saveOrgAssigneeRoles(nextRoles);
      setRoles(saved);
      setDrafts(saved);
      setSavedAt(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save gap owner roles.");
    } finally {
      setSaving(false);
    }
  }, []);

  const saveMemberRole = useCallback((userId: string) => {
    const role = drafts[userId]?.trim() ?? "";
    const next = { ...roles };
    if (role) next[userId] = role;
    else delete next[userId];
    void persist(next);
  }, [drafts, persist, roles]);

  useEffect(() => {
    if (!savedAt) return;
    const t = window.setTimeout(() => setSavedAt(null), 2000);
    return () => window.clearTimeout(t);
  }, [savedAt]);

  if (loading) {
    return (
      <SettingsSection
        label="Remediation"
        title="Gap owner roles"
        description="Set each team member's role or function once. It applies automatically to every gap they own."
        loading
      />
    );
  }

  return (
    <SettingsSection
      label="Remediation"
      title="Gap owner roles"
      description="Set each team member's role or function once. It applies automatically to every gap they own. Update roles here only — not on individual gaps."
    >
      {!hasOrg && (
        <p style={{ fontSize: 12, color: "var(--fg3)", fontFamily: "'Sora', sans-serif" }}>
          Join or select an organization to manage gap owner roles.
        </p>
      )}

      {hasOrg && members.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--fg3)", fontFamily: "'Sora', sans-serif" }}>
          No organization members found.
        </p>
      )}

      {hasOrg && members.map(member => (
        <div
          key={member.id}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "12px 0",
            borderBottom: "0.5px solid var(--bdr)",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "var(--fg)", fontFamily: "'Sora', sans-serif" }}>
              {member.name}
            </div>
            <div style={{ fontSize: 11, color: "var(--fg3)", marginTop: 2, fontFamily: "'Sora', sans-serif" }}>
              {member.email}
            </div>
          </div>
          <input
            value={drafts[member.id] ?? ""}
            onChange={e => setDrafts(prev => ({ ...prev, [member.id]: e.target.value }))}
            placeholder="Role / function"
            disabled={saving}
            style={{
              width: 180,
              padding: "8px 10px",
              borderRadius: 6,
              border: "0.5px solid var(--bdr2)",
              background: "var(--card2)",
              color: "var(--fg)",
              fontSize: 12,
              fontFamily: "'Sora', sans-serif",
            }}
          />
          <button
            type="button"
            disabled={saving || (drafts[member.id] ?? "") === (roles[member.id] ?? "")}
            onClick={() => saveMemberRole(member.id)}
            style={{
              padding: "8px 12px",
              borderRadius: 6,
              fontSize: 11,
              border: "0.5px solid var(--bdr2)",
              background: "var(--lift)",
              color: "var(--fg2)",
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "'Sora', sans-serif",
              whiteSpace: "nowrap",
            }}
          >
            Save
          </button>
        </div>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16, minHeight: 18 }}>
        {saving && (
          <span style={{ fontSize: 11, color: "var(--fg3)", display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "'Sora', sans-serif" }}>
            <Loader2 size={12} className="spin" />
            Saving…
          </span>
        )}
        {!saving && savedAt && (
          <span style={{ fontSize: 11, color: "var(--rl)", fontFamily: "'Sora', sans-serif" }}>
            Saved — applied to all gaps
          </span>
        )}
        {error && (
          <span style={{ fontSize: 11, color: "var(--rh)", fontFamily: "'Sora', sans-serif" }}>
            {error}
          </span>
        )}
      </div>

      {hasOrg && (
        <p style={{ fontSize: 11, color: "var(--fg4)", marginTop: 12, marginBottom: 0, fontFamily: "'Sora', sans-serif" }}>
          Roles appear on gap escalation tracking. Manage assignees from the{" "}
          <Link href="/remediation" style={{ color: "var(--fg2)", textDecoration: "underline" }}>
            remediation queue
          </Link>
          .
        </p>
      )}
    </SettingsSection>
  );
}
