"use client";

import { Suspense, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { SquarePen, FileSearch, Layers, Settings, MessageSquare, FolderOpen, ShieldAlert, Trash2, Briefcase, ChevronDown, ChevronRight, Inbox, FilePenLine, FileText } from "lucide-react";
import Logo from "@/components/Logo";
import HoverTip from "@/components/HoverTip";
import { useIsMobile } from "@/hooks/useIsMobile";
import { normalizeRiskTier } from "@/lib/risk-tiers";
import { getNewAction, getSidebarMode, draftHistoryHref, isDraftHistoryPath } from "@/lib/mobile-nav";

type RecentAssessment = {
  id:         string;
  title:      string;
  risk_tier:  string;
  risk_score: number;
};

type RecentConversation = {
  id:         string;
  title:      string;
  updated_at: string;
};

type RecentProject = {
  id:    string;
  name:  string;
  color: string;
};

type RecentReview = {
  id:             string;
  agreement_type: string;
  created_at:     string;
};

type RecentDraft = {
  id:             string;
  agreement_type: string;
  created_at:     string;
  result?:        { document_name?: string; title?: string };
};

const TIER = {
  high:   { dot: "var(--rh)", badge: "var(--rh)", bg: "var(--rh-bg)", bdr: "var(--rh-bdr)" },
  medium: { dot: "var(--rm)", badge: "var(--rm)", bg: "var(--rm-bg)", bdr: "var(--rm-bdr)" },
  low:    { dot: "var(--rl)", badge: "var(--rl)", bg: "var(--rl-bg)", bdr: "var(--rl-bdr)" },
};

function tierKey(t: string): keyof typeof TIER {
  return normalizeRiskTier(t);
}

function SidebarInner({ extra, onNavigate }: { extra?: ReactNode; onNavigate?: () => void }) {
  const path         = usePathname();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { user }     = useUser();
  const isMobileView = useIsMobile();
  const isChat      = path === "/chat" || path.startsWith("/chat/");
  const isAssess    = path === "/assess" || path === "/history";
  const isContracts = path === "/contracts";
  const isDraft     = path === "/draft";
  const isInbox       = path === "/inbox";
  const isRemediation = path === "/remediation";
  const isDocuments   = path === "/documents";
  const isFrameworks  = path === "/frameworks";
  const sidebarMode = getSidebarMode(path);
  const newAction = getNewAction(path);
  const activeId     = searchParams.get("id");
  const activeDraftId = isDraft ? (searchParams.get("draft") ?? searchParams.get("id")) : null;
  const isDraftHistory = isDraftHistoryPath(path, searchParams);
  const activeReviewId = isContracts ? searchParams.get("id") : null;
  const activeProjectId = path.startsWith("/projects/") ? path.split("/")[2] : null;
  const isProjects  = path.startsWith("/projects");

  const [assessments,   setAssessments]   = useState<RecentAssessment[]>([]);
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [reviews,       setReviews]       = useState<RecentReview[]>([]);
  const [drafts,        setDrafts]        = useState<RecentDraft[]>([]);
  const [projects,      setProjects]      = useState<RecentProject[]>([]);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [recentAssessmentsOpen, setRecentAssessmentsOpen] = useState(true);
  const [recentChatsOpen, setRecentChatsOpen] = useState(true);
  const [recentReviewsOpen, setRecentReviewsOpen] = useState(true);
  const [recentDraftsOpen, setRecentDraftsOpen] = useState(true);

  const isChatNavActive = path === "/chat" || (path.startsWith("/chat/") && path !== "/chat/history");
  const isAssessNavActive = path === "/assess" || path === "/history";
  const isDraftNavActive = isDraft && !isDraftHistory;

  const loadAssessments = () => {
    fetch("/api/assessments?limit=5")
      .then(r => r.json())
      .then(d => setAssessments(d.assessments || []))
      .catch(() => {});
  };

  const loadConversations = () => {
    fetch("/api/conversations?limit=5")
      .then(r => r.json())
      .then(d => setConversations(d.conversations || []))
      .catch(() => {});
  };

  const loadReviews = () => {
    fetch("/api/redlines?limit=5")
      .then(r => r.json())
      .then(d => setReviews(d.redlines || []))
      .catch(() => {});
  };

  const loadDrafts = () => {
    fetch("/api/drafts?limit=5")
      .then(r => r.json())
      .then(d => setDrafts(d.drafts || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (isMobileView) {
      if (sidebarMode === "chat") loadConversations();
      else if (sidebarMode === "assess") loadAssessments();
      else if (sidebarMode === "contracts") loadReviews();
      else if (sidebarMode === "draft") loadDrafts();
    } else {
      if (isChat) loadConversations();
      if (isAssess) loadAssessments();
      if (isContracts) loadReviews();
      if (isDraft) loadDrafts();
    }
    if (isProjects) {
      fetch("/api/folders")
        .then(r => r.json())
        .then(d => {
          const rows = (d.folders ?? []) as RecentProject[];
          setProjects(rows.slice(0, 8));
        })
        .catch(() => {});
    }
  }, [path, searchParams.toString(), isChat, isAssess, isContracts, isDraft, isProjects, isMobileView, sidebarMode]);

  useEffect(() => {
    const handler = () => loadAssessments();
    window.addEventListener("norvar:assessments-updated", handler);
    return () => window.removeEventListener("norvar:assessments-updated", handler);
  }, []);

  useEffect(() => {
    const handler = () => loadConversations();
    window.addEventListener("norvar:conversations-updated", handler);
    return () => window.removeEventListener("norvar:conversations-updated", handler);
  }, []);

  useEffect(() => {
    const handler = () => loadReviews();
    window.addEventListener("norvar:reviews-updated", handler);
    return () => window.removeEventListener("norvar:reviews-updated", handler);
  }, []);

  useEffect(() => {
    const handler = () => loadDrafts();
    window.addEventListener("norvar:drafts-updated", handler);
    return () => window.removeEventListener("norvar:drafts-updated", handler);
  }, []);

  const deleteAssessment = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This also removes linked remediation items.`)) return;
    setDeletingId(id);
    try {
      const res = await fetch("/api/assessments", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setAssessments(prev => prev.filter(a => a.id !== id));
      if (activeId === id) router.push("/assess");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Could not delete assessment");
    } finally {
      setDeletingId(null);
    }
  };

  const deleteConversation = async (id: string, title: string) => {
    if (!confirm(`Delete "${title || "Untitled chat"}"?`)) return;
    setDeletingChatId(id);
    try {
      const res = await fetch("/api/conversations", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeId === id) router.push("/chat");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Could not delete chat");
    } finally {
      setDeletingChatId(null);
    }
  };

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "N"
    : "N";

  const openFreshSession = (e: MouseEvent) => {
    const onHome =
      (sidebarMode === "chat" && path === "/chat" && !activeId) ||
      (sidebarMode === "assess" && path === "/assess" && !activeId) ||
      (sidebarMode === "contracts" && path === "/contracts" && !activeReviewId && searchParams.get("reviews") !== "1") ||
      (sidebarMode === "draft" && path === "/draft" && !activeDraftId && !isDraftHistory);
    if (onHome) {
      e.preventDefault();
      router.refresh();
      onNavigate?.();
      return;
    }
    const hasActiveSession =
      (sidebarMode === "chat" && activeId) ||
      (sidebarMode === "assess" && activeId) ||
      (sidebarMode === "contracts" && (activeReviewId || searchParams.get("reviews") === "1")) ||
      (sidebarMode === "draft" && (activeDraftId || isDraftHistory));
    if (hasActiveSession) {
      e.preventDefault();
      router.replace(newAction.href);
    }
    onNavigate?.();
  };

  const goToChatHome = () => {
    onNavigate?.();
    if (path === "/chat" && !activeId) {
      router.refresh();
      return;
    }
    router.replace("/chat");
  };

  const goToContractsHome = () => {
    onNavigate?.();
    router.replace("/contracts");
  };

  const goToDraftHome = () => {
    onNavigate?.();
    router.replace("/draft");
  };

  const primaryNav = (
    <div className={isMobileView ? "sidebar-mobile-nav" : "sidebar-nav-primary"}>
      <Link href="/inbox" className={`sidebar-nav-item${isInbox ? " active" : ""}`}>
        <Inbox size={14} strokeWidth={isInbox ? 2 : 1.75} />
        Inbox
      </Link>
      <div className="sidebar-divider" />
      <Link href="/chat" className={`sidebar-nav-item${isChatNavActive ? " active" : ""}`}>
        <MessageSquare size={14} strokeWidth={path === "/chat" ? 2 : 1.75} />
        Chat
      </Link>
      <Link href="/assess" className={`sidebar-nav-item${isAssessNavActive ? " active" : ""}`}>
        <FileSearch size={14} strokeWidth={path === "/assess" ? 2 : 1.75} />
        Assessments
      </Link>
      <Link
        href="/contracts"
        className={`sidebar-nav-item${isContracts ? " active" : ""}`}
        onClick={goToContractsHome}
      >
        <FilePenLine size={14} strokeWidth={isContracts ? 2 : 1.75} />
        Review
      </Link>
      <Link
        href="/draft"
        className={`sidebar-nav-item${isDraftNavActive ? " active" : ""}`}
        onClick={goToDraftHome}
      >
        <FileText size={14} strokeWidth={isDraftNavActive ? 2 : 1.75} />
        Draft
      </Link>
    </div>
  );

  const renderRecentsHeader = (
    title: string,
    icon: ReactNode,
    open: boolean,
    onToggle: () => void,
    collapseLabel: string,
  ) => {
    const label = (
      <>
        <span className="sidebar-section-icon" aria-hidden="true">{icon}</span>
        <span>{title}</span>
      </>
    );

    return (
      <button
        type="button"
        className="sidebar-recents-toggle"
        aria-expanded={open}
        aria-label={open ? `Collapse ${collapseLabel}` : `Expand ${collapseLabel}`}
        onClick={onToggle}
      >
        <span className="sidebar-recents-toggle-label">{label}</span>
        <ChevronDown
          size={isMobileView ? 14 : 12}
          strokeWidth={2}
          className="sidebar-recents-toggle-chevron"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
      </button>
    );
  };

  const showRecentsPanel = (open: boolean) => open;

  const workspaceNavSection = (
    <>
      <div className="sidebar-divider" />
      <Link
        href="/projects"
        className={`sidebar-nav-item${path === "/projects" ? " active" : ""}`}
      >
        <Briefcase size={14} strokeWidth={path === "/projects" ? 2 : 1.75} />
        Projects
      </Link>
      {isProjects && projects.map(project => (
        <Link
          key={project.id}
          href={`/projects/${project.id}`}
          className={`sidebar-nav-item recent-project-item${activeProjectId === project.id ? " active" : ""}`}
          style={{ paddingLeft: 22 }}
        >
          <span
            style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: project.color || "var(--fg3)",
            }}
          />
          <span style={{
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {project.name}
          </span>
        </Link>
      ))}
      <Link
        href="/remediation"
        className={`sidebar-nav-item${isRemediation ? " active" : ""}`}
      >
        <ShieldAlert size={14} strokeWidth={isRemediation ? 2 : 1.75} />
        Remediation
      </Link>
      <Link
        href="/documents"
        className={`sidebar-nav-item${isDocuments ? " active" : ""}`}
      >
        <FolderOpen size={14} strokeWidth={isDocuments ? 2 : 1.75} />
        Documents
      </Link>
      <Link
        href="/frameworks"
        className={`sidebar-nav-item${isFrameworks ? " active" : ""}`}
      >
        <Layers size={14} strokeWidth={isFrameworks ? 2 : 1.75} />
        Frameworks
      </Link>
    </>
  );

  return (
    <aside
      className="sidebar"
      onClick={e => {
        if ((e.target as HTMLElement).closest("a")) onNavigate?.();
      }}
    >
      <div className="sidebar-drawer-header">
        <button
          type="button"
          className="sidebar-brand-btn sidebar-drawer-brand-row"
          onClick={goToChatHome}
          aria-label="Norvar home — open chat"
        >
          <Logo size={24} />
          <span className="sidebar-drawer-brand-text">Norvar</span>
        </button>
      </div>

      {!isMobileView && (
      <div className="sidebar-top">
        <div className="sidebar-brand-row">
          <button
            type="button"
            className="sidebar-brand-btn"
            onClick={goToChatHome}
            aria-label="Norvar home — open chat"
          >
            <Logo size={26} />
            <span className="sidebar-brand-name">Norvar</span>
          </button>
          <HoverTip label={newAction.label}>
            <Link
              href={newAction.href}
              className="sidebar-compose-btn"
              onClick={openFreshSession}
              aria-label={newAction.label}
            >
              <SquarePen size={14} strokeWidth={1.75} />
            </Link>
          </HoverTip>
        </div>
      </div>
      )}

      {!isMobileView && (
      <>
      <div className="sidebar-divider" style={{ margin: "0 8px 6px" }} />
      </>
      )}

      {isMobileView && (
        <div className="sidebar-divider" style={{ margin: "0 8px 6px" }} />
      )}

      <div className={`sidebar-scroll${isMobileView ? "" : " sidebar-scroll--desktop"}`}>
        {primaryNav}

        {!isMobileView && workspaceNavSection}

        {!isMobileView && <div className="sidebar-scroll-spacer" aria-hidden="true" />}

        {assessments.length > 0 && (isMobileView ? sidebarMode === "assess" : (isAssess || path === "/history")) && (
          <>
            <div className="sidebar-divider" />
            {renderRecentsHeader(
              "Recent assessments",
              <FileSearch size={11} strokeWidth={1.75} />,
              recentAssessmentsOpen,
              () => setRecentAssessmentsOpen(v => !v),
              "recent assessments",
            )}
            {showRecentsPanel(recentAssessmentsOpen) && (
              <div className="sidebar-recents-panel">
                {assessments.map(item => {
                  const c = TIER[tierKey(item.risk_tier)];
                  const isActive = activeId === item.id;
                  return (
                    <div key={item.id} className="recent-item-row">
                      <Link
                        href={`/assess?id=${item.id}`}
                        className={`recent-item${isActive ? " active" : ""}`}
                      >
                        <div className="recent-dot" style={{ background: c.dot }} />
                        <span className={`recent-text${isActive ? " active-text" : ""}`}>{item.title}</span>
                        <span
                          className="recent-score"
                          style={{ color: c.badge, background: c.bg, border: `0.5px solid ${c.bdr}` }}
                        >
                          {item.risk_score}
                        </span>
                      </Link>
                      <HoverTip label={`Delete ${item.title}`}>
                        <button
                          type="button"
                          className="recent-delete"
                          aria-label={`Delete ${item.title}`}
                          disabled={deletingId === item.id}
                          onClick={() => deleteAssessment(item.id, item.title)}
                        >
                          <Trash2 size={11} />
                        </button>
                      </HoverTip>
                    </div>
                  );
                })}
                <Link href="/history" className="sidebar-all-link">
                  All assessments
                  <ChevronRight size={14} strokeWidth={2} />
                </Link>
              </div>
            )}
          </>
        )}

        {conversations.length > 0 && (isMobileView ? sidebarMode === "chat" : isChat) && (
          <>
            <div className="sidebar-divider" />
            {renderRecentsHeader(
              "Recent chats",
              <MessageSquare size={11} strokeWidth={1.75} />,
              recentChatsOpen,
              () => setRecentChatsOpen(v => !v),
              "recent chats",
            )}
            {showRecentsPanel(recentChatsOpen) && (
              <div className="sidebar-recents-panel">
                {conversations.map(item => {
                  const isActive = activeId === item.id;
                  return (
                    <div key={item.id} className="recent-item-row">
                      <Link
                        href={`/chat?id=${item.id}`}
                        className={`recent-item${isActive ? " active" : ""}`}
                      >
                        <span className="recent-dot" aria-hidden="true" />
                        <span className={`recent-text${isActive ? " active-text" : ""}`}>
                          {item.title || "Untitled chat"}
                        </span>
                      </Link>
                      <HoverTip label={`Delete ${item.title || "chat"}`}>
                        <button
                          type="button"
                          className="recent-delete"
                          aria-label={`Delete ${item.title || "chat"}`}
                          disabled={deletingChatId === item.id}
                          onClick={() => deleteConversation(item.id, item.title)}
                        >
                          <Trash2 size={11} />
                        </button>
                      </HoverTip>
                    </div>
                  );
                })}
                <Link href="/chat/history" className="sidebar-all-link">
                  All chats
                  <ChevronRight size={14} strokeWidth={2} />
                </Link>
              </div>
            )}
          </>
        )}

        {reviews.length > 0 && (isMobileView ? sidebarMode === "contracts" : isContracts) && (
          <>
            <div className="sidebar-divider" />
            {renderRecentsHeader(
              "Recent reviews",
              <FilePenLine size={11} strokeWidth={1.75} />,
              recentReviewsOpen,
              () => setRecentReviewsOpen(v => !v),
              "recent reviews",
            )}
            {showRecentsPanel(recentReviewsOpen) && (
              <div className="sidebar-recents-panel">
                {reviews.map(item => {
                  const isActive = activeReviewId === item.id;
                  return (
                    <div key={item.id} className="recent-item-row">
                      <Link
                        href={`/contracts?id=${item.id}`}
                        className={`recent-item${isActive ? " active" : ""}`}
                      >
                        <span className="recent-dot" aria-hidden="true" />
                        <span className={`recent-text${isActive ? " active-text" : ""}`}>
                          {item.agreement_type || "Agreement"}
                        </span>
                      </Link>
                    </div>
                  );
                })}
                <Link href="/contracts?reviews=1" className="sidebar-all-link">
                  All reviews
                  <ChevronRight size={14} strokeWidth={2} />
                </Link>
              </div>
            )}
          </>
        )}

        {(isMobileView ? sidebarMode === "draft" : isDraft) && (
          <>
            <div className="sidebar-divider" />
            {renderRecentsHeader(
              "Recent drafts",
              <FileText size={11} strokeWidth={1.75} />,
              recentDraftsOpen,
              () => setRecentDraftsOpen(v => !v),
              "recent drafts",
            )}
            {showRecentsPanel(recentDraftsOpen) && (
              <div className="sidebar-recents-panel">
                {drafts.length === 0 ? (
                  <p className="sidebar-recents-empty">No drafts yet</p>
                ) : (
                  drafts.map(item => {
                    const isActive = activeDraftId === item.id;
                    const title = item.result?.document_name || item.result?.title || item.agreement_type;
                    return (
                      <div key={item.id} className="recent-item-row">
                        <Link
                          href={draftHistoryHref(item.id)}
                          className={`recent-item${isActive ? " active" : ""}`}
                        >
                          <span className="recent-dot" aria-hidden="true" />
                          <span className={`recent-text${isActive ? " active-text" : ""}`}>
                            {title || "Agreement"}
                          </span>
                        </Link>
                      </div>
                    );
                  })
                )}
                <Link href={isMobileView ? "/draft" : draftHistoryHref()} className="sidebar-all-link">
                  All drafts
                  <ChevronRight size={14} strokeWidth={2} />
                </Link>
              </div>
            )}
          </>
        )}

        {isMobileView && workspaceNavSection}

        {extra && (
          <>
            <div className="sidebar-divider" />
            {extra}
          </>
        )}
      </div>

      <Link href={newAction.href} className="sidebar-mobile-fab" onClick={openFreshSession}>
        <SquarePen size={14} strokeWidth={1.75} />
        {newAction.label}
      </Link>

      <div className="sidebar-footer">
        <div className="avatar-row sidebar-account-row">
          <HoverTip label="Account menu">
            <div className="sidebar-account-avatar">
              <div className="avatar">{initials}</div>
              <div className="sidebar-account-button">
                <UserButton
                  appearance={{
                    elements: {
                      userButtonAvatarBox:       { display: "none" },
                      userButtonOuterIdentifier: { display: "none" },
                      userButtonTrigger:         { width: "100%", height: "100%" },
                      rootBox:                   { width: "100%", height: "100%" },
                    },
                  }}
                />
              </div>
            </div>
          </HoverTip>
          <div className="avatar-name" style={{ flex: 1, minWidth: 0 }}>
            {user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : "Norvar"}
          </div>
          <HoverTip label="Settings">
            <Link
              href="/settings"
              className={`sidebar-settings-btn${path === "/settings" ? " active" : ""}`}
              aria-label="Settings"
            >
              <Settings size={14} strokeWidth={path === "/settings" ? 2 : 1.75} />
            </Link>
          </HoverTip>
        </div>
      </div>
    </aside>
  );
}

export default function Sidebar({ extra, onNavigate }: { extra?: ReactNode; onNavigate?: () => void }) {
  return (
    <Suspense fallback={<aside className="sidebar" />}>
      <SidebarInner extra={extra} onNavigate={onNavigate} />
    </Suspense>
  );
}
