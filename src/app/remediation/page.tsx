"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import { useIsMobile } from "@/hooks/useIsMobile";
import GapChat, { type GapChatMessage } from "@/components/GapChat";
import AssigneeManager from "@/components/AssigneeManager";
import EscalateModal from "@/components/EscalateModal";
import EscalationTracker from "@/components/EscalationTracker";
import RemediationStepChecklist from "@/components/RemediationStepChecklist";
import StatusBadge from "@/components/StatusBadge";
import type { AssigneeMeta, EscalationStatus } from "@/lib/escalation";
import { ESCALATION_EMAIL_REPLY_ACTION, parseEscalationEmailReplies } from "@/lib/escalation";
import { parseInboxMessages } from "@/lib/inbox";
import { sortBySeverity, STATUS_LABELS, SELECTABLE_STATUSES, type RemediationStatus } from "@/lib/remediation";
import type { RemediationStepItem } from "@/lib/remediation-steps";
import { normalizeGapSeverity } from "@/lib/risk-tiers";
import type { UserProfile } from "@/lib/clerk-users";
import {
  ShieldAlert, ChevronDown, User, Calendar, AlertTriangle,
  CheckCircle, ArrowUpRight, Clock, ExternalLink, SlidersHorizontal,
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
  gap_severity:         "high" | "medium" | "low";
  gap_domain:           string;
  gap_detail:           string | null;
  gap_frameworks:       string[];
  remediation_steps:    string | null;
  step_checklist?:      import("@/lib/remediation-steps").RemediationStepItem[];
  assigned_to:          string[];
  created_by:           string;
  status:               "open" | "in_progress" | "escalated" | "resolved" | "wont_fix";
  escalated_to:         string | null;
  escalation_email:     string | null;
  escalation_token:     string | null;
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
  high:   { bg: "var(--rh-bg)", color: "var(--rh)", bdr: "var(--rh-bdr)" },
  medium: { bg: "var(--rm-bg)", color: "var(--rm)", bdr: "var(--rm-bdr)" },
  low:    { bg: "var(--card2)", color: "var(--fg3)", bdr: "var(--bdr2)" },
};

const STATUS_FILTERS = [
  { value: "",            label: "All" },
  { value: "open",        label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "escalated",   label: "Escalated" },
  { value: "resolved",    label: "Resolved" },
];

const SEV_FILTERS = [
  { value: "",       label: "All severities" },
  { value: "high",   label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low",    label: "Low" },
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
  const normalized = normalizeGapSeverity(sev);
  const s = SEV_STYLES[normalized] ?? SEV_STYLES.low;
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
      background: s.bg, color: s.color, border: `0.5px solid ${s.bdr}`,
      textTransform: "uppercase", letterSpacing: "0.5px",
    }}>
      {normalized}
    </span>
  );
}

function ItemCard({ item, profiles, isMobile, onUpdate, onStatusChange, onMessagesChange }: {
  item:     RemediationItem;
  profiles: Record<string, UserProfile>;
  isMobile: boolean;
  onUpdate: () => void;
  onStatusChange: (id: string, status: RemediationStatus) => void;
  onMessagesChange: (id: string, messages: GapChatMessage[]) => void;
}) {
  const [expanded, setExpanded]     = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  const [localStatus, setLocalStatus] = useState(item.status);
  const [statusError, setStatusError] = useState("");
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [activityOpen, setActivityOpen]     = useState(false);

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

  const isTerminal  = localStatus === "resolved" || localStatus === "wont_fix";
  const longDetail  = (item.gap_detail?.length ?? 0) > 220;

  return (
    <>
      <div className={`remediation-item-card${expanded ? " expanded" : ""}`}>
        <button
          type="button"
          className="remediation-item-summary"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <SevBadge sev={item.gap_severity} />

          <div className="remediation-item-main">
            <div className="remediation-item-title">{item.gap_title}</div>
            {!isMobile && (
              <div className="remediation-item-meta">
                {item.project_title && (
                  <span className="remediation-item-meta-project">{item.project_title}</span>
                )}
                {item.assessment_number && (
                  <span className="remediation-item-meta-num">{item.assessment_number}</span>
                )}
                <span>{DOMAIN_LABELS[item.gap_domain] ?? item.gap_domain}</span>
                {item.gap_frameworks.length > 0 && (
                  <span>{item.gap_frameworks.slice(0, 2).join(", ")}</span>
                )}
              </div>
            )}
          </div>

          <div className="remediation-item-side">
            <StatusBadge status={localStatus} />
            {item.due_date && (
              <span className={`remediation-item-due${overdue ? " overdue" : ""}`}>
                {overdue && <AlertTriangle size={9} />}
                <Calendar size={9} />
                {fmt_date(item.due_date)}
              </span>
            )}
          </div>

          <ChevronDown size={14} color="var(--fg3)" className="remediation-item-chevron" />
        </button>

        {expanded && (
          <div className="remediation-detail-panel">
            <div className="remediation-detail-toolbar">
              <Link
                href={`/assess?id=${item.assessment_id}`}
                onClick={e => e.stopPropagation()}
                className="remediation-assessment-link"
              >
                <ExternalLink size={11} />
                View assessment
                {item.project_title && ` · ${item.project_title}`}
              </Link>

              {!isTerminal ? (
                <label className="remediation-status-control">
                  <span className="remediation-status-control-label">Status</span>
                  <select
                    value={localStatus}
                    disabled={statusBusy}
                    onClick={e => e.stopPropagation()}
                    onChange={e => updateStatus(e.target.value as RemediationStatus)}
                    className="remediation-status-select"
                  >
                    {(SELECTABLE_STATUSES).map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </label>
              ) : (
                <StatusBadge status={localStatus} />
              )}
            </div>

            {statusError && <p className="remediation-inline-error">{statusError}</p>}

            {item.gap_detail && (
              <section className="remediation-detail-section">
                <div className="remediation-section-label">Gap detail</div>
                <p className={`remediation-body-text${longDetail && !detailExpanded ? " clamped" : ""}`}>
                  {item.gap_detail}
                </p>
                {longDetail && (
                  <button
                    type="button"
                    className="remediation-text-toggle"
                    onClick={e => { e.stopPropagation(); setDetailExpanded(v => !v); }}
                  >
                    {detailExpanded ? "Show less" : "Read more"}
                  </button>
                )}
              </section>
            )}

            <RemediationStepChecklist
              itemId={item.id}
              initialChecklist={item.step_checklist ?? []}
              profiles={profiles}
              onUpdate={onUpdate}
            />

            <section className="remediation-detail-section remediation-detail-section--chat">
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
                onStepsAdded={onUpdate}
              />
            </section>

            <section className="remediation-detail-section">
              <AssigneeManager
                itemId={item.id}
                assessmentId={item.assessment_id}
                projectTitle={item.project_title}
                assignedTo={item.assigned_to}
                assigneeMeta={item.assignee_meta}
                profiles={profiles}
                onUpdate={onUpdate}
              />
            </section>

            <EscalationTracker
              itemId={item.id}
              escalationEmail={item.escalation_email}
              escalationRecipientName={item.escalation_recipient_name}
              escalationRole={item.escalation_role}
              escalationQuestion={item.escalation_question}
              escalationNote={item.escalation_note}
              escalatedAt={item.escalated_at}
              escalationStatus={item.escalation_status}
              lastNotifiedAt={item.last_notified_at}
              replyCount={parseInboxMessages(item.remediation_activity ?? [])
                .filter(m => m.direction === "inbound" && !m.deleted_at && !m.archived_at)
                .length}
              onUpdate={onUpdate}
            />

            {item.remediation_activity?.length > 0 && (() => {
              const activityRows = item.remediation_activity
                .filter(a => a.action !== ESCALATION_EMAIL_REPLY_ACTION)
                .slice(0, 5);
              if (!activityRows.length) return null;
              return (
              <section className="remediation-detail-section remediation-activity">
                <div className="remediation-section-label">Activity</div>
                <button
                  type="button"
                  className="remediation-assignees-details-toggle"
                  aria-expanded={activityOpen}
                  onClick={() => setActivityOpen(v => !v)}
                >
                  <ChevronDown
                    size={12}
                    className={`remediation-assignees-chevron${activityOpen ? " open" : ""}`}
                  />
                  {activityOpen
                    ? "Hide activity"
                    : `Show activity (${activityRows.length})`}
                </button>
                {activityOpen && (
                  <ul className="remediation-activity-list">
                    {activityRows.map(a => (
                      <li key={a.id} className="remediation-activity-row">
                        <Clock size={10} />
                        <span className="remediation-activity-detail">{a.detail ?? a.action}</span>
                        <span className="remediation-activity-date">{fmt_date(a.created_at)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              );
            })()}

            {!isTerminal && (
              <div className="remediation-quick-actions">
                {localStatus === "open" && (
                  <button type="button" disabled={statusBusy} onClick={() => updateStatus("in_progress")} className="remediation-action-btn">
                    <Clock size={10} /> Start
                  </button>
                )}
                {(!item.escalation_email || item.escalation_status === "closed") && (
                  <button type="button" onClick={() => setEscalating(true)} className="remediation-action-btn warn">
                    <ArrowUpRight size={10} /> Escalate
                  </button>
                )}
                <button type="button" disabled={statusBusy} onClick={() => updateStatus("resolved")} className="remediation-action-btn success">
                  <CheckCircle size={10} /> Resolve
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
  const isMobileView = useIsMobile();
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
  const [showMobileFilters, setShowMobileFilters] = useState(false);

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
      (!filterSev || normalizeGapSeverity(i.gap_severity) === filterSev) &&
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

  const domainFiltered = useMemo(
    () => items.filter(i => !filterDomain || i.gap_domain === filterDomain),
    [items, filterDomain],
  );

  const counts = useMemo(() => ({
    open: domainFiltered.filter(i =>
      i.status === "open"
      && (!filterSev || normalizeGapSeverity(i.gap_severity) === filterSev),
    ).length,
    in_progress: domainFiltered.filter(i =>
      i.status === "in_progress"
      && (!filterSev || normalizeGapSeverity(i.gap_severity) === filterSev),
    ).length,
    escalated: domainFiltered.filter(i =>
      i.status === "escalated"
      && (!filterSev || normalizeGapSeverity(i.gap_severity) === filterSev),
    ).length,
    resolved: domainFiltered.filter(i =>
      i.status === "resolved"
      && (!filterSev || normalizeGapSeverity(i.gap_severity) === filterSev),
    ).length,
  }), [domainFiltered, filterSev]);

  const SUMMARY_FILTERS: Array<{
    key:   string;
    label: string;
    type:  "status";
    value: string;
    color: string;
  }> = [
    { key: "open",        label: "Open",        type: "status", value: "open",        color: "var(--fg)" },
    { key: "in_progress", label: "In progress", type: "status", value: "in_progress", color: "var(--fg)" },
    { key: "escalated",   label: "Escalated",   type: "status", value: "escalated",   color: "var(--rm)" },
    { key: "resolved",    label: "Resolved",    type: "status", value: "resolved",    color: "var(--rl)" },
  ];

  const toggleSummaryFilter = (type: "status" | "severity", value: string) => {
    if (type === "status") {
      setFilterStatus(prev => {
        const next = prev === value ? "" : value;
        if (next) setFilterSev("");
        return next;
      });
      return;
    }
    setFilterSev(prev => (prev === value ? "" : value));
  };

  const applyStatusFilter = (value: string) => {
    setFilterStatus(prev => {
      const next = prev === value ? "" : value;
      if (next) setFilterSev("");
      return next;
    });
  };

  const isSummaryFilterActive = (type: "status" | "severity", value: string) =>
    type === "status" ? filterStatus === value : filterSev === value;

  const statusFilters = (
    <div className="sidebar-extra-section">
      <div className="sidebar-section">Filter by status</div>
      {STATUS_FILTERS.map(({ value, label }) => (
        <button
          key={value || "all"}
          type="button"
          onClick={() => applyStatusFilter(value)}
          className={`sidebar-nav-item sidebar-filter-item${filterStatus === value ? " active" : ""}`}
        >
          <span className="sidebar-filter-label">{label}</span>
          {value && counts[value as keyof typeof counts] !== undefined && (
            <span className="sidebar-filter-count">
              {counts[value as keyof typeof counts]}
            </span>
          )}
        </button>
      ))}
    </div>
  );

  const headerSelectStyle: React.CSSProperties = {
    padding: "5px 10px", borderRadius: 6, border: "0.5px solid var(--bdr2)",
    background: "var(--card2)", color: "var(--fg)", fontSize: 11,
    fontFamily: "'Sora', sans-serif", cursor: "pointer",
  };

  const advancedFilters = (
    <>
      <select value={filterSev} onChange={e => setFilterSev(e.target.value)} style={headerSelectStyle} className="remediation-filter-select">
        {SEV_FILTERS.map(({ value, label }) => (
          <option key={value || "all"} value={value}>{label}</option>
        ))}
      </select>
      <select value={filterDomain} onChange={e => setFilterDomain(e.target.value)} style={headerSelectStyle} className="remediation-filter-select">
        {DOMAIN_FILTERS.map(({ value, label }) => (
          <option key={value || "all"} value={value}>{label}</option>
        ))}
      </select>
      <select value={filterProject} onChange={e => setFilterProject(e.target.value)} style={{ ...headerSelectStyle, maxWidth: 220 }} className="remediation-filter-select">
        <option value="">All projects</option>
        {projects.map(p => (
          <option key={p.id} value={p.id}>
            {p.title}{p.number ? ` (${p.number})` : ""}
          </option>
        ))}
      </select>
      <select value={filterProjectNum} onChange={e => setFilterProjectNum(e.target.value)} style={{ ...headerSelectStyle, fontFamily: "'JetBrains Mono', monospace" }} className="remediation-filter-select">
        <option value="">All numbers</option>
        {projectNumbers.map(n => (
          <option key={n} value={n}>{n}</option>
        ))}
      </select>
      <button type="button" onClick={() => setMineOnly(!mineOnly)} className={`remediation-mine-toggle${mineOnly ? " active" : ""}`} style={{
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
    </>
  );

  return (
    <AppShell sidebarExtra={!isMobileView ? statusFilters : undefined}>
      <main className={`main-area remediation-page${isMobileView ? " remediation-page--mobile" : ""}`}>
        {isMobileView ? (
          <div className="remediation-mobile-head">
            <div className="remediation-mobile-title-row">
              <ShieldAlert size={16} color="var(--fg3)" />
              <div>
                <h1 className="remediation-mobile-title">Remediation</h1>
                <p className="remediation-mobile-subtitle">{filtered.length} item{filtered.length === 1 ? "" : "s"} in queue</p>
              </div>
            </div>
            <div className="remediation-status-scroll">
              {STATUS_FILTERS.map(({ value, label }) => (
                <button
                  key={value || "all"}
                  type="button"
                  className={`remediation-status-pill${filterStatus === value ? " active" : ""}`}
                  onClick={() => applyStatusFilter(value)}
                >
                  {label}
                  {value && counts[value as keyof typeof counts] !== undefined && (
                    <span className="remediation-status-pill-count">{counts[value as keyof typeof counts]}</span>
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="remediation-filters-toggle"
              aria-expanded={showMobileFilters}
              onClick={() => setShowMobileFilters(v => !v)}
            >
              <SlidersHorizontal size={14} strokeWidth={1.75} />
              <span>More filters</span>
              <ChevronDown
                size={14}
                strokeWidth={2}
                style={{ transform: showMobileFilters ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
              />
            </button>
            {showMobileFilters && (
              <div className="remediation-mobile-filters">
                {advancedFilters}
              </div>
            )}
          </div>
        ) : (
        <>
        <div className="page-toolbar remediation-desktop-toolbar" style={{
          padding: "16px 24px", borderBottom: "0.5px solid var(--bdr)",
          display: "flex", alignItems: "center", gap: 12,
          background: "var(--card)", flexShrink: 0, flexWrap: "wrap",
        }}>
          <ShieldAlert size={14} color="var(--fg3)" />
          <span className="page-toolbar-title" style={{ fontSize: 13, fontWeight: 500, color: "var(--fg)", flex: 1 }}>Remediation queue</span>

          <div className="page-toolbar-controls">
          {advancedFilters}
          </div>
        </div>

        <div className="page-stats-bar remediation-desktop-stats" style={{
          padding: "10px 24px", borderBottom: "0.5px solid var(--bdr)",
          display: "flex", gap: 16, background: "var(--card2)", flexWrap: "wrap",
          flexShrink: 0, alignItems: "center",
        }}>
          {SUMMARY_FILTERS.map(({ key, label, type, value, color }) => {
            const active = isSummaryFilterActive(type, value);
            const count = counts[key as keyof typeof counts];
            return (
              <button
                key={key}
                type="button"
                className={`remediation-stat-chip${active ? " active" : ""}`}
                aria-pressed={active}
                onClick={() => toggleSummaryFilter(type, value)}
              >
                <span className="remediation-stat-chip-value" style={{ color }}>
                  {count}
                </span>
                {label}
              </button>
            );
          })}
          {(filterStatus || filterSev) && (
            <button
              type="button"
              className="remediation-stat-clear"
              onClick={() => { setFilterStatus(""); setFilterSev(""); }}
            >
              Clear filters
            </button>
          )}
        </div>
        </>
        )}

        <div className="main-scroll">
          <div className={`chat-scroll remediation-list${isMobileView ? " remediation-list--mobile" : ""}`}>
          {loading && (
            <div style={{ textAlign: "center", color: "var(--fg3)", fontSize: 12, padding: "40px 0" }}>
              Loading...
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <CheckCircle size={28} color="var(--fg4)" style={{ margin: "0 auto 12px" }} />
              <p style={{ fontSize: 13, color: "var(--fg3)" }}>
                {filterStatus || filterSev || filterDomain
                  ? "No items match these filters"
                  : filterStatus === "resolved"
                    ? "No resolved items yet"
                    : "No items in the queue"}
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
              isMobile={isMobileView}
              onUpdate={() => load({ silent: true })}
              onStatusChange={handleStatusChange}
              onMessagesChange={updateItemMessages}
            />
          ))}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
