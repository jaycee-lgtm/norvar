"use client";

import { Suspense, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { SquarePen, FileSearch, LayoutDashboard, Layers, Settings, MessageSquare, FolderOpen, ShieldAlert, Trash2, Briefcase, ChevronDown, ChevronRight, Inbox, FilePenLine, FileText } from "lucide-react";
import ModeSelector from "@/components/ModeSelector";
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
  const [assessNavOpen, setAssessNavOpen] = useState(isAssess);
  const [chatNavOpen, setChatNavOpen]     = useState(path === "/chat/history");
  const [contractsNavOpen, setContractsNavOpen] = useState(isContracts);
  const [draftNavOpen, setDraftNavOpen] = useState(isDraft);
  const [recentAssessmentsOpen, setRecentAssessmentsOpen] = useState(false);
  const [recentChatsOpen, setRecentChatsOpen] = useState(false);
  const [recentReviewsOpen, setRecentReviewsOpen] = useState(isContracts);
  const [recentDraftsOpen, setRecentDraftsOpen] = useState(isDraft);

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

  useEffect(() => {
    if (isAssess) setAssessNavOpen(true);
    if (isContracts) {
      setContractsNavOpen(true);
      setRecentReviewsOpen(true);
    }
    if (isDraft) {
      setDraftNavOpen(true);
      setRecentDraftsOpen(true);
    }
    if (path === "/chat/history") setChatNavOpen(true);
    if (isMobileView) {
      setRecentReviewsOpen(sidebarMode === "contracts");
      setRecentDraftsOpen(sidebarMode === "draft");
    }
  }, [path, isAssess, isContracts, isDraft, isMobileView, sidebarMode]);

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

  const projectsSection = (
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
    </>
  );

  const remediationSection = (
    <>
      <div className="sidebar-divider" />
      <Link
        href="/remediation"
        className={`sidebar-nav-item${isRemediation ? " active" : ""}`}
      >
        <ShieldAlert size={14} strokeWidth={isRemediation ? 2 : 1.75} />
        Remediation
      </Link>
    </>
  );

  const documentsSection = (
    <>
      <div className="sidebar-divider" />
      <Link
        href="/documents"
        className={`sidebar-nav-item${isDocuments ? " active" : ""}`}
      >
        <FolderOpen size={14} strokeWidth={isDocuments ? 2 : 1.75} />
        Documents
      </Link>
    </>
  );

  const frameworksSection = (
    <>
      <div className="sidebar-divider" />
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
        <button
          type="button"
          className="sidebar-brand-btn"
          onClick={goToChatHome}
          aria-label="Norvar home — open chat"
          style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px 10px", width: "100%", textAlign: "left" }}
        >
          <Logo size={24} />
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)", letterSpacing: "-.03em", fontFamily: "'Sora', sans-serif" }}>
            Norvar
          </span>
        </button>
        <Link href={newAction.href} className="new-assess-btn" onClick={openFreshSession}>
          <span className="new-assess-label">{newAction.label}</span>
          <SquarePen size={14} color="var(--fg3)" />
        </Link>
        <ModeSelector current={sidebarMode} sidebar />
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

      <div className="sidebar-scroll">
        {isMobileView ? (
          <div className="sidebar-mobile-nav" style={{ padding: "0 0 4px" }}>
            <Link href="/inbox" className={`sidebar-nav-item${isInbox ? " active" : ""}`}>
              <Inbox size={14} strokeWidth={isInbox ? 2 : 1.75} />
              Inbox
            </Link>
            <Link href="/chat" className={`sidebar-nav-item${path === "/chat" || path.startsWith("/chat/") ? " active" : ""}`}>
              <MessageSquare size={14} strokeWidth={path === "/chat" ? 2 : 1.75} />
              Chat
            </Link>
            <Link href="/assess" className={`sidebar-nav-item${path === "/assess" || path === "/history" ? " active" : ""}`}>
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
              className={`sidebar-nav-item${isDraft && !isDraftHistory ? " active" : ""}`}
              onClick={goToDraftHome}
            >
              <FileText size={14} strokeWidth={isDraft && !isDraftHistory ? 2 : 1.75} />
              Draft
            </Link>
            {isDraft && !isMobileView && (
              <Link
                href={draftHistoryHref()}
                className={`sidebar-nav-subitem${isDraftHistory ? " active" : ""}`}
              >
                <LayoutDashboard size={12} strokeWidth={isDraftHistory ? 2 : 1.75} />
                History
              </Link>
            )}
          </div>
        ) : (
        <>
        <div style={{ padding: "0 0 4px" }}>
          <Link href="/inbox" className={`sidebar-nav-item${isInbox ? " active" : ""}`}>
            <Inbox size={14} strokeWidth={isInbox ? 2 : 1.75} />
            Inbox
          </Link>

          <div className="sidebar-nav-group">
            <div className="sidebar-nav-group-row">
              <Link
                href="/chat"
                className={`sidebar-nav-item sidebar-nav-group-main${path === "/chat" ? " active" : ""}`}
              >
                <MessageSquare size={14} strokeWidth={path === "/chat" ? 2 : 1.75} />
                Chat
              </Link>
              <HoverTip label={chatNavOpen ? "Collapse chat menu" : "Expand chat menu"}>
                <button
                  type="button"
                  className="sidebar-nav-toggle"
                  aria-expanded={chatNavOpen}
                  aria-label={chatNavOpen ? "Collapse chat menu" : "Expand chat menu"}
                  onClick={() => setChatNavOpen(v => !v)}
                >
                  <ChevronDown
                    size={12}
                    strokeWidth={2}
                    style={{ transform: chatNavOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
                  />
                </button>
              </HoverTip>
            </div>
            {chatNavOpen && (
              <Link
                href="/chat/history"
                className={`sidebar-nav-subitem${path === "/chat/history" ? " active" : ""}`}
              >
                <LayoutDashboard size={12} strokeWidth={path === "/chat/history" ? 2 : 1.75} />
                History
              </Link>
            )}
          </div>

          <div className="sidebar-nav-group">
            <div className="sidebar-nav-group-row">
              <Link
                href="/assess"
                className={`sidebar-nav-item sidebar-nav-group-main${path === "/assess" ? " active" : ""}`}
              >
                <FileSearch size={14} strokeWidth={path === "/assess" ? 2 : 1.75} />
                Assessments
              </Link>
              <HoverTip label={assessNavOpen ? "Collapse assessments menu" : "Expand assessments menu"}>
                <button
                  type="button"
                  className="sidebar-nav-toggle"
                  aria-expanded={assessNavOpen}
                  aria-label={assessNavOpen ? "Collapse assessments menu" : "Expand assessments menu"}
                  onClick={() => setAssessNavOpen(v => !v)}
                >
                  <ChevronDown
                    size={12}
                    strokeWidth={2}
                    style={{ transform: assessNavOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
                  />
                </button>
              </HoverTip>
            </div>
            {assessNavOpen && (
              <Link
                href="/history"
                className={`sidebar-nav-subitem${path === "/history" ? " active" : ""}`}
              >
                <LayoutDashboard size={12} strokeWidth={path === "/history" ? 2 : 1.75} />
                History
              </Link>
            )}
          </div>

          <div className="sidebar-nav-group">
            <div className="sidebar-nav-group-row">
              <Link
                href="/contracts"
                className={`sidebar-nav-item sidebar-nav-group-main${isContracts ? " active" : ""}`}
                onClick={goToContractsHome}
              >
                <FilePenLine size={14} strokeWidth={isContracts ? 2 : 1.75} />
                Review
              </Link>
              <HoverTip label={contractsNavOpen ? "Collapse review menu" : "Expand review menu"}>
                <button
                  type="button"
                  className="sidebar-nav-toggle"
                  aria-expanded={contractsNavOpen}
                  aria-label={contractsNavOpen ? "Collapse review menu" : "Expand review menu"}
                  onClick={() => setContractsNavOpen(v => !v)}
                >
                  <ChevronDown
                    size={12}
                    strokeWidth={2}
                    style={{ transform: contractsNavOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
                  />
                </button>
              </HoverTip>
            </div>
            {contractsNavOpen && (
              <Link
                href="/contracts?reviews=1"
                className={`sidebar-nav-subitem${path === "/contracts" && searchParams.get("reviews") === "1" ? " active" : ""}`}
              >
                <LayoutDashboard size={12} strokeWidth={path === "/contracts" && searchParams.get("reviews") === "1" ? 2 : 1.75} />
                History
              </Link>
            )}
          </div>

          <div className="sidebar-nav-group">
            <div className="sidebar-nav-group-row">
              <Link
                href="/draft"
                className={`sidebar-nav-item sidebar-nav-group-main${isDraft ? " active" : ""}`}
                onClick={goToDraftHome}
              >
                <FileText size={14} strokeWidth={isDraft ? 2 : 1.75} />
                Draft
              </Link>
              <HoverTip label={draftNavOpen ? "Collapse draft menu" : "Expand draft menu"}>
                <button
                  type="button"
                  className="sidebar-nav-toggle"
                  aria-expanded={draftNavOpen}
                  aria-label={draftNavOpen ? "Collapse draft menu" : "Expand draft menu"}
                  onClick={() => setDraftNavOpen(v => !v)}
                >
                  <ChevronDown
                    size={12}
                    strokeWidth={2}
                    style={{ transform: draftNavOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
                  />
                </button>
              </HoverTip>
            </div>
            {draftNavOpen && !isMobileView && (
              <Link
                href={draftHistoryHref()}
                className={`sidebar-nav-subitem${isDraftHistory ? " active" : ""}`}
              >
                <LayoutDashboard size={12} strokeWidth={isDraftHistory ? 2 : 1.75} />
                History
              </Link>
            )}
          </div>
        </div>

        {projectsSection}
        {remediationSection}
        {documentsSection}
        {frameworksSection}
        </>
        )}

        {assessments.length > 0 && (isMobileView ? sidebarMode === "assess" : (isAssess || path === "/history")) && (
          <>
            <div className="sidebar-divider" />
            <button
              type="button"
              className="sidebar-recents-toggle"
              aria-expanded={recentAssessmentsOpen}
              aria-label={recentAssessmentsOpen ? "Collapse recent assessments" : "Expand recent assessments"}
              onClick={() => setRecentAssessmentsOpen(v => !v)}
            >
              <span>Recent assessments</span>
              <ChevronDown
                size={isMobileView ? 14 : 12}
                strokeWidth={2}
                style={{ transform: recentAssessmentsOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
              />
            </button>
            {recentAssessmentsOpen && (
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
            <button
              type="button"
              className="sidebar-recents-toggle"
              aria-expanded={recentChatsOpen}
              aria-label={recentChatsOpen ? "Collapse recent chats" : "Expand recent chats"}
              onClick={() => setRecentChatsOpen(v => !v)}
            >
              <span>Recent chats</span>
              <ChevronDown
                size={isMobileView ? 14 : 12}
                strokeWidth={2}
                style={{ transform: recentChatsOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
              />
            </button>
            {recentChatsOpen && (
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
            <button
              type="button"
              className="sidebar-recents-toggle"
              aria-expanded={recentReviewsOpen}
              aria-label={recentReviewsOpen ? "Collapse recent reviews" : "Expand recent reviews"}
              onClick={() => setRecentReviewsOpen(v => !v)}
            >
              <span>Recent reviews</span>
              <ChevronDown
                size={isMobileView ? 14 : 12}
                strokeWidth={2}
                style={{ transform: recentReviewsOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
              />
            </button>
            {recentReviewsOpen && (
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
            <button
              type="button"
              className="sidebar-recents-toggle"
              aria-expanded={recentDraftsOpen}
              aria-label={recentDraftsOpen ? "Collapse recent drafts" : "Expand recent drafts"}
              onClick={() => setRecentDraftsOpen(v => !v)}
            >
              <span>Recent drafts</span>
              <ChevronDown
                size={isMobileView ? 14 : 12}
                strokeWidth={2}
                style={{ transform: recentDraftsOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
              />
            </button>
            {recentDraftsOpen && (
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

        {isMobileView && (
          <>
            {projectsSection}
            {remediationSection}
            {documentsSection}
            {frameworksSection}
          </>
        )}

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
