"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import Sidebar from "@/components/Sidebar";
import GapChat, { type GapChatMessage } from "@/components/GapChat";
import AssigneeManager from "@/components/AssigneeManager";
import EscalateModal from "@/components/EscalateModal";
import EscalationTracker from "@/components/EscalationTracker";
import StatusBadge from "@/components/StatusBadge";
import type { AssigneeMeta, EscalationStatus } from "@/lib/escalation";
import { sortBySeverity, STATUS_LABELS, STATUS_STYLES, type RemediationStatus } from "@/lib/remediation";
import type { UserProfile } from "@/lib/clerk-users";
import {
  ShieldAlert, ChevronDown, User, Calendar, AlertTriangle,
  CheckCircle, ArrowUpRight, Clock, X, ExternalLink,
} from "lucide-react";

interface ProjectOption {
  id:     string;
  title:  string;
  number: string | null;
}

interface Activity {
  id:         string;
  user_id:    string;
  action:     string;
  detail:     string | null;
  created_at: string;
}

interface RemediationItem {
  id:                   string;
  assessment_id:        string;
  assessment_number:    string | null;
  project_title:        string | null;
  gap_key:              string | null;
  gap_title:            string;
  gap_severity:         "critical" | "high" | "medium" | "low";
  gap_domain:           string;
  gap_detail:           string | null;
  gap_frameworks:       string[];
  remediation_steps:    string | null;
  assigned_to:          string[];
  created_by:           string;
  status:               "open" | "in_progress" | "escalated" | "resolved" | "wont_fix";
  escalated_to:         string | null;
  escalation_email:     string | null;
  escalation_recipient_name?: string | null;
  escalation_role:      string | null;
  escalation_question:  string | null;
  escalation_note:      string | null;
  escalated_at:         string | null;
  escalation_status:    EscalationStatus | null;
  last_notified_at:     string | null;
  assignee_meta?:       AssigneeMeta;
  due_date:             string | null;
  resolved_at:          string | null;
  resolution_note:      string | null;
  created_at:           string;
  messages?:            GapChatMessage[];
  remediation_activity: Activity[];
}

function fmt_date(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function is_overdue(due: string | null) {
  if (!due) return false;
  return new Date(due) < new Date();
}

const SEV_STYLES: Record<string, { bg: string; color: string; bdr: string }> = {
  critical: { bg: "var(--rh-bg)", color: "var(--rh)", bdr: "var(--rh-bdr)" },
  high:     { bg: "var(--rm-bg)", color: "var(--rm)", bdr: "var(--rm-bdr)" },
  medium:   { bg: "rgba(59,109,17,.09)", color: "var(--rl)", bdr: "rgba(59,109,17,.2)" },
  low:      { bg: "var(--card2)", color: "var(--fg3)", bdr: "var(--bdr2)" },
};

const STATUS_FILTERS = [
  { value: "",            label: "All" },
  { value: "open",        label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "escalated",   label: "Escalated" },
  { value: "resolved",    label: "Resolved" },
  { value: "wont_fix",    label: "Won't fix" },
];

const SEV_FILTERS = [
  { value: "",         label: "All severities" },
  { value: "critical", label: "Critical" },
  { value: "high",     label: "High" },
  { value: "medium",   label: "Medium" },
  { value: "low",      label: "Low" },
];

const DOMAIN_LABELS: Record<string, string> = {
  privacy:       "Privacy",
  ai_governance: "AI Governance",
  cybersecurity: "Cybersecurity",
};

const DOMAIN_FILTERS = [
  { value: "", label: "All domains" },
  ...Object.entries(DOMAIN_LABELS).map(([value, label]) => ({ value, label })),
];

function SevBadge({ sev }: { sev: string }) {
  const s = SEV_STYLES[sev] ?? SEV_STYLES.low;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
      background: s.bg, color: s.color, border: `0.5px solid ${s.bdr}`,
      textTransform: "uppercase", letterSpacing: "0.5px",
    }}>
      {sev}
    </span>
  );
}

function ItemCard({ item, profiles, onUpdate, onStatusChange, onMessagesChange }: {
  item:     RemediationItem;
  profiles: Record<string, UserProfile>;
  onUpdate: () => void;
  onStatusChange: (id: string, status: RemediationStatus) => void;
  onMessagesChange: (id: string, messages: GapChatMessage[]) => void;
}) {
  const [expanded, setExpanded]     = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState(item.status);
  const [statusError, setStatusError] = useState("");

  useEffect(() => {
    setLocalStatus(item.status);
  }, [item.status]);

  const overdue = is_overdue(item.due_date) && localStatus !== "resolved";

  const updateStatus = async (status: RemediationStatus) => {
    if (status === localStatus || statusBusy) return;
    const previous = localStatus;
    setLocalStatus(status);
    setStatusBusy(true);
    setStatusError("");
    try {
      const res = await fetch("/api/remediation", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: item.id, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Status update failed");
      onStatusChange(item.id, status);
    } catch (e: unknown) {
      setLocalStatus(previous);
      setStatusError(e instanceof Error ? e.message : "Could not update status");
    } finally {
      setStatusBusy(false);
    }
  };

  const statusStyle = STATUS_STYLES[localStatus] ?? STATUS_STYLES.open;

  return (
    <>
      <div style={{
        background: "var(--card)", border: "0.5px solid var(--bdr2)",
        borderRadius: 8,
      }}>
        <div
          style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "flex-start", gap: 10 }}
          onClick={() => setExpanded(!expanded)}
        >
          <SevBadge sev={item.gap_severity} />

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", marginBottom: 3 }}>
              {item.gap_title}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {item.project_title && (
                <span style={{ fontSize: 10, color: "var(--fg2)", fontWeight: 500 }}>
                  {item.project_title}
                </span>
              )}
              {item.assessment_number && (
                <span style={{ fontSize: 10, color: "var(--fg3)", fontFamily: "'JetBrains Mono', monospace" }}>
                  {item.assessment_number}
                </span>
              )}
              <span style={{ fontSize: 10, color: "var(--fg3)" }}>
                {DOMAIN_LABELS[item.gap_domain] ?? item.gap_domain}
              </span>
              {item.gap_frameworks.length > 0 && (
                <span style={{ fontSize: 10, color: "var(--fg3)" }}>
                  {item.gap_frameworks.slice(0, 2).join(", ")}
                </span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
            <StatusBadge status={localStatus} />
            {item.due_date && (
              <span style={{ fontSize: 10, color: overdue ? "var(--rh)" : "var(--fg3)", display: "flex", alignItems: "center", gap: 3 }}>
                {overdue && <AlertTriangle size={9} />}
                <Calendar size={9} />
                {fmt_date(item.due_date)}
              </span>
            )}
          </div>

          <ChevronDown size={13} color="var(--fg3)"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s", flexShrink: 0, marginTop: 2 }} />
        </div>

        {expanded && (
          <div style={{ padding: "0 16px 16px", borderTop: "0.5px solid var(--bdr)" }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap: 10, flexWrap: "wrap", marginTop: 12, marginBottom: 10,
            }}>
              <Link
                href={`/assess?id=${item.assessment_id}`}
                onClick={e => e.stopPropagation()}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  fontSize: 11, color: "var(--fg2)", textDecoration: "none",
                }}
              >
                <ExternalLink size={11} />
                View assessment
                {item.project_title && ` · ${item.project_title}`}
              </Link>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Status
                </span>
                <select
                  value={localStatus}
                  disabled={statusBusy}
                  onClick={e => e.stopPropagation()}
                  onChange={e => updateStatus(e.target.value as RemediationStatus)}
                  className="remediation-status-select"
                  style={{
                    background: statusStyle.bg,
                    color:      statusStyle.color,
                    borderColor: statusStyle.bdr,
                    opacity: statusBusy ? 0.7 : 1,
                  }}
                >
                  {(Object.keys(STATUS_LABELS) as RemediationStatus[]).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>

            {statusError && (
              <p style={{ fontSize: 11, color: "var(--rh)", marginTop: 8, marginBottom: 0 }}>{statusError}</p>
            )}

            {item.gap_detail && (
              <p style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.55, marginTop: 12, marginBottom: 10 }}>
                {item.gap_detail}
              </p>
            )}

            {item.remediation_steps && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                  Remediation steps
                </div>
                <p style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.55, padding: "8px 10px", background: "var(--card2)", borderRadius: 6, border: "0.5px solid var(--bdr)" }}>
                  {item.remediation_steps}
                </p>
              </div>
            )}

            <GapChat
              gap={{
                title:              item.gap_title,
                severity:           item.gap_severity,
                domain:             DOMAIN_LABELS[item.gap_domain] ?? item.gap_domain,
                detail:             item.gap_detail,
                frameworks:         item.gap_frameworks,
                remediation_steps:  item.remediation_steps,
              }}
              remediationId={item.id}
              assessmentId={item.assessment_id}
              gapKey={item.gap_key ?? undefined}
              initialMessages={item.messages ?? []}
              onMessagesChange={msgs => onMessagesChange(item.id, msgs)}
            />

            <div style={{ marginBottom: 12, marginTop: 12 }}>
              <AssigneeManager
                itemId={item.id}
                assessmentId={item.assessment_id}
                projectTitle={item.project_title}
                assignedTo={item.assigned_to}
                profiles={profiles}
                onUpdate={onUpdate}
              />
            </div>

            <EscalationTracker
              itemId={item.id}
              assignedTo={item.assigned_to}
              profiles={profiles}
              assigneeMeta={item.assignee_meta}
              escalationEmail={item.escalation_email}
              escalationRecipientName={item.escalation_recipient_name}
              escalationRole={item.escalation_role}
              escalationQuestion={item.escalation_question}
              escalationNote={item.escalation_note}
              escalatedAt={item.escalated_at}
              escalationStatus={item.escalation_status}
              lastNotifiedAt={item.last_notified_at}
              onUpdate={onUpdate}
            />

            {item.remediation_activity?.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
                  Activity
                </div>
                {item.remediation_activity.slice(0, 5).map(a => (
                  <div key={a.id} style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--fg3)", marginBottom: 4, alignItems: "flex-start" }}>
                    <Clock size={10} style={{ flexShrink: 0, marginTop: 2 }} />
                    <span>{a.detail ?? a.action}</span>
                    <span style={{ marginLeft: "auto", whiteSpace: "nowrap" }}>{fmt_date(a.created_at)}</span>
                  </div>
                ))}
              </div>
            )}

            {localStatus !== "resolved" && localStatus !== "wont_fix" && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {localStatus === "open" && (
                  <button type="button" disabled={statusBusy} onClick={() => updateStatus("in_progress")} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 12px", borderRadius: 5, fontSize: 11,
                    border: "0.5px solid var(--bdr2)", background: "transparent",
                    color: "var(--fg2)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
                  }}>
                    <Clock size={10} /> Start
                  </button>
                )}
                {(!item.escalation_email || item.escalation_status === "closed") && (
                  <button type="button" onClick={() => setEscalating(true)} style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "5px 12px", borderRadius: 5, fontSize: 11,
                    border: "0.5px solid var(--rm-bdr)", background: "var(--rm-bg)",
                    color: "var(--rm)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
                  }}>
                    <ArrowUpRight size={10} /> Escalate
                  </button>
                )}
                <button type="button" disabled={statusBusy} onClick={() => updateStatus("resolved")} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: 5, fontSize: 11,
                  border: "0.5px solid var(--rl-bdr)", background: "var(--rl-bg)",
                  color: "var(--rl)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
                }}>
                  <CheckCircle size={10} /> Resolve
                </button>
                <button type="button" disabled={statusBusy} onClick={() => updateStatus("wont_fix")} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "5px 12px", borderRadius: 5, fontSize: 11,
                  border: "0.5px solid var(--bdr2)", background: "transparent",
                  color: "var(--fg3)", cursor: "pointer", fontFamily: "'Sora', sans-serif",
                }}>
                  <X size={10} /> Won&apos;t fix
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {escalating && (
        <EscalateModal
          itemId={item.id}
          gapTitle={item.gap_title}
          onClose={() => setEscalating(false)}
          onDone={onUpdate}
        />
      )}
    </>
  );
}

export default function RemediationPage() {
  const [items, setItems]               = useState<RemediationItem[]>([]);
  const [profiles, setProfiles]         = useState<Record<string, UserProfile>>({});
  const [projects, setProjects]         = useState<ProjectOption[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSev, setFilterSev]       = useState("");
  const [filterDomain, setFilterDomain] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterProjectNum, setFilterProjectNum] = useState("");
  const [mineOnly, setMineOnly]         = useState(false);

  const load = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const params = new URLSearchParams();
    if (mineOnly)     params.set("mine", "true");
    if (filterProject) params.set("assessment_id", filterProject);
    if (filterProjectNum) params.set("project_number", filterProjectNum);
    const res = await fetch(`/api/remediation?${params}`);
    const { items: data, users, projects: proj } = await res.json();
    setItems(data ?? []);
    setProfiles(users ?? {});
    setProjects(proj ?? []);
    if (!opts?.silent) setLoading(false);
  };

  useEffect(() => { load(); }, [mineOnly, filterProject, filterProjectNum]);

  const projectNumbers = useMemo(() => {
    const nums = new Set<string>();
    projects.forEach(p => { if (p.number) nums.add(p.number); });
    return [...nums].sort();
  }, [projects]);

  const filtered = sortBySeverity(
    items.filter(i =>
      (!filterStatus || i.status === filterStatus) &&
      (!filterSev || i.gap_severity === filterSev) &&
      (!filterDomain || i.gap_domain === filterDomain),
    ),
  );

  const updateItemMessages = (id: string, messages: GapChatMessage[]) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, messages } : i));
  };

  const handleStatusChange = (id: string, status: RemediationStatus) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    load({ silent: true });
  };

  const counts = {
    open:        items.filter(i => i.status === "open").length,
    in_progress: items.filter(i => i.status === "in_progress").length,
    escalated:   items.filter(i => i.status === "escalated").length,
    resolved:    items.filter(i => i.status === "resolved").length,
    wont_fix:    items.filter(i => i.status === "wont_fix").length,
    critical:    items.filter(i => i.gap_severity === "critical").length,
  };

  const statusFilters = (
    <>
      <div className="sidebar-section">Filter by status</div>
      {STATUS_FILTERS.map(({ value, label }) => (
        <button
          key={value || "all"}
          type="button"
          onClick={() => setFilterStatus(value)}
          className={`sidebar-nav-item${filterStatus === value ? " active" : ""}`}
          style={{ width: "100%", textAlign: "left" }}
        >
          {label}
          {value && counts[value as keyof typeof counts] !== undefined && (
            <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--fg3)" }}>
              {counts[value as keyof typeof counts]}
            </span>
          )}
        </button>
      ))}
    </>
  );

  const headerSelectStyle: React.CSSProperties = {
    padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--bdr2)",
    background: "var(--card2)", color: "var(--fg)", fontSize: 11,
    fontFamily: "'Sora', sans-serif", cursor: "pointer",
  };

  return (
    <div className="app-shell">
      <Sidebar extra={statusFilters} />
      <main className="main-area">
        <div style={{
          padding: "16px 24px", borderBottom: "0.5px solid var(--bdr)",
          display: "flex", alignItems: "center", gap: 12,
          background: "var(--card)", flexShrink: 0, flexWrap: "wrap",
        }}>
          <ShieldAlert size={14} color="var(--fg3)" />
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", flex: 1 }}>Remediation queue</span>

          <select
            value={filterSev}
            onChange={e => setFilterSev(e.target.value)}
            style={headerSelectStyle}
          >
            {SEV_FILTERS.map(({ value, label }) => (
              <option key={value || "all"} value={value}>{label}</option>
            ))}
          </select>

          <select
            value={filterDomain}
            onChange={e => setFilterDomain(e.target.value)}
            style={headerSelectStyle}
          >
            {DOMAIN_FILTERS.map(({ value, label }) => (
              <option key={value || "all"} value={value}>{label}</option>
            ))}
          </select>

          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            style={{ ...headerSelectStyle, maxWidth: 220 }}
          >
            <option value="">All projects</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>
                {p.title}{p.number ? ` (${p.number})` : ""}
              </option>
            ))}
          </select>

          <select
            value={filterProjectNum}
            onChange={e => setFilterProjectNum(e.target.value)}
            style={{ ...headerSelectStyle, fontFamily: "'JetBrains Mono', monospace" }}
          >
            <option value="">All numbers</option>
            {projectNumbers.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <button type="button" onClick={() => setMineOnly(!mineOnly)} style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "5px 12px", borderRadius: 5, fontSize: 11, fontWeight: 500,
            border: `0.5px solid ${mineOnly ? "var(--bdr3)" : "var(--bdr2)"}`,
            background: mineOnly ? "var(--lift)" : "transparent",
            color: mineOnly ? "var(--fg)" : "var(--fg3)", cursor: "pointer",
            fontFamily: "'Sora', sans-serif", whiteSpace: "nowrap", flexShrink: 0,
          }}>
            <User size={10} />
            Mine only
          </button>
        </div>

        <div style={{
          padding: "10px 24px", borderBottom: "0.5px solid var(--bdr)",
          display: "flex", gap: 24, background: "var(--card2)", flexWrap: "wrap",
          flexShrink: 0,
        }}>
          {[
            { label: "Open",        value: counts.open,        color: "var(--fg)" },
            { label: "In progress", value: counts.in_progress, color: "var(--fg)" },
            { label: "Escalated",   value: counts.escalated,   color: "var(--rm)" },
            { label: "Resolved",    value: counts.resolved,    color: "var(--rl)" },
            { label: "Critical",    value: counts.critical,    color: "var(--rh)" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ fontSize: 11, color: "var(--fg3)" }}>
              <span style={{ fontWeight: 600, color, marginRight: 4 }}>{value}</span>{label}
            </div>
          ))}
        </div>

        <div className="main-scroll">
          <div className="chat-scroll">
          {loading && (
            <div style={{ textAlign: "center", color: "var(--fg3)", fontSize: 12, padding: "40px 0" }}>
              Loading...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <CheckCircle size={28} color="var(--fg4)" style={{ margin: "0 auto 12px" }} />
              <p style={{ fontSize: 13, color: "var(--fg3)" }}>
                {filterStatus === "resolved" ? "No resolved items yet" : "No items in the queue"}
              </p>
              <p style={{ fontSize: 11, color: "var(--fg3)", marginTop: 4 }}>
                Add gaps from an assessment to start tracking remediation
              </p>
            </div>
          )}
          {!loading && filtered.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              profiles={profiles}
              onUpdate={() => load({ silent: true })}
              onStatusChange={handleStatusChange}
              onMessagesChange={updateItemMessages}
            />
          ))}
          </div>
        </div>
      </main>
    </div>
  );
}
