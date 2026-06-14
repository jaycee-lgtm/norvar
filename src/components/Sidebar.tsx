"use client";

import { Suspense, useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { SquarePen, FileSearch, LayoutDashboard, Layers, Settings, MessageSquare, FolderOpen, ShieldAlert, Trash2, Briefcase, ChevronDown, ChevronRight } from "lucide-react";
import ModeSelector from "@/components/ModeSelector";
import Logo from "@/components/Logo";
import { useIsMobile } from "@/hooks/useIsMobile";
import { normalizeRiskTier } from "@/lib/risk-tiers";

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
  const isChat     = path === "/chat" || path.startsWith("/chat/");
  const isAssess   = path === "/assess" || path === "/history";
  const isProjects = path.startsWith("/projects");
  const sidebarMode = isAssess ? "assess" as const : "chat" as const;
  const activeId     = searchParams.get("id");
  const activeProjectId = path.startsWith("/projects/") ? path.split("/")[2] : null;

  const [assessments,   setAssessments]   = useState<RecentAssessment[]>([]);
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [projects,      setProjects]      = useState<RecentProject[]>([]);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [assessNavOpen, setAssessNavOpen] = useState(isAssess);
  const [chatNavOpen, setChatNavOpen]     = useState(path === "/chat/history");
  const [recentAssessmentsOpen, setRecentAssessmentsOpen] = useState(isAssess);
  const [recentChatsOpen, setRecentChatsOpen] = useState(false);

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

  useEffect(() => {
    if (isMobileView || isChat) {
      loadConversations();
    }
    if (isMobileView || isAssess) {
      loadAssessments();
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
  }, [path, searchParams.toString(), isChat, isAssess, isProjects, isMobileView]);

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
    if (isAssess) setAssessNavOpen(true);
    if (isAssess) setRecentAssessmentsOpen(true);
    if (path === "/chat/history") setChatNavOpen(true);
  }, [path, isAssess]);

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

  const openFreshChat = (e: MouseEvent) => {
    if (isAssess || !isChat || !activeId) return;
    e.preventDefault();
    router.replace("/chat");
  };

  const goToChatHome = () => {
    onNavigate?.();
    if (path === "/chat" && !activeId) {
      router.refresh();
      return;
    }
    router.replace("/chat");
  };

  const mainNav = [
    { href: "/documents", label: "Documents", icon: FolderOpen, active: path === "/documents" },
    { href: "/remediation", label: "Remediation", icon: ShieldAlert, active: path === "/remediation" },
  ];

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
        <Link href={isAssess ? "/assess" : "/chat"} className="new-assess-btn" onClick={openFreshChat}>
          <span className="new-assess-label">{isAssess ? "New assessment" : "New chat"}</span>
          <SquarePen size={14} color="var(--fg3)" />
        </Link>
      </div>
      )}

      {!isMobileView && (
      <>
      <div style={{ padding: "0 10px 8px" }}>
        <ModeSelector current={sidebarMode} compact />
      </div>

      <div className="sidebar-divider" style={{ margin: "0 8px 6px" }} />
      </>
      )}

      {isMobileView && (
        <div className="sidebar-divider" style={{ margin: "0 8px 6px" }} />
      )}

      <div className="sidebar-scroll">
        {isMobileView ? (
          <div className="sidebar-mobile-nav" style={{ padding: "0 0 4px" }}>
            <Link href="/chat" className={`sidebar-nav-item${path === "/chat" || path.startsWith("/chat/") ? " active" : ""}`}>
              <MessageSquare size={14} strokeWidth={path === "/chat" ? 2 : 1.75} />
              Chat
            </Link>
            <Link href="/assess" className={`sidebar-nav-item${path === "/assess" || path === "/history" ? " active" : ""}`}>
              <FileSearch size={14} strokeWidth={path === "/assess" ? 2 : 1.75} />
              Assessments
            </Link>
            {mainNav.map(({ href, label, icon: Icon, active }) => (
              <Link key={label} href={href} className={`sidebar-nav-item ${active ? "active" : ""}`}>
                <Icon size={14} strokeWidth={active ? 2 : 1.75} />
                {label}
              </Link>
            ))}
            <Link href="/projects" className={`sidebar-nav-item${path.startsWith("/projects") ? " active" : ""}`}>
              <Briefcase size={14} strokeWidth={path.startsWith("/projects") ? 2 : 1.75} />
              Projects
            </Link>
          </div>
        ) : (
        <>
        <div style={{ padding: "0 0 4px" }}>
          <div className="sidebar-nav-group">
            <div className="sidebar-nav-group-row">
              <Link
                href="/chat"
                className={`sidebar-nav-item sidebar-nav-group-main${path === "/chat" ? " active" : ""}`}
              >
                <MessageSquare size={14} strokeWidth={path === "/chat" ? 2 : 1.75} />
                Chat
              </Link>
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

          {mainNav.map(({ href, label, icon: Icon, active }) => (
            <Link key={label} href={href} className={`sidebar-nav-item ${active ? "active" : ""}`}>
              <Icon size={14} strokeWidth={active ? 2 : 1.75} />
              {label}
            </Link>
          ))}
        </div>

        <div className="sidebar-divider" />
        <div className="sidebar-section">Projects</div>
        <div style={{ padding: "0 0 4px" }}>
          <Link
            href="/projects"
            className={`sidebar-nav-item${path === "/projects" ? " active" : ""}`}
          >
            <Briefcase size={14} strokeWidth={path === "/projects" ? 2 : 1.75} />
            All projects
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
        </div>

        <div className="sidebar-divider" />
        <div className="sidebar-section">Frameworks</div>
        <div style={{ padding: "0 0 4px" }}>
          <Link
            href="/frameworks"
            className={`sidebar-nav-item${path === "/frameworks" ? " active" : ""}`}
          >
            <Layers size={14} strokeWidth={path === "/frameworks" ? 2 : 1.75} />
            Browse frameworks
          </Link>
        </div>
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
                        <span className="recent-score" style={{ color: c.badge, background: c.bg, border: `0.5px solid ${c.bdr}` }}>
                          {item.risk_score}
                        </span>
                      </Link>
                      <button
                        type="button"
                        className="recent-delete"
                        aria-label={`Delete ${item.title}`}
                        disabled={deletingId === item.id}
                        onClick={() => deleteAssessment(item.id, item.title)}
                      >
                        <Trash2 size={11} />
                      </button>
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
                        <div className="recent-dot" style={{ background: "var(--fg3)" }} />
                        <span className={`recent-text${isActive ? " active-text" : ""}`}>
                          {item.title || "Untitled chat"}
                        </span>
                      </Link>
                      <button
                        type="button"
                        className="recent-delete"
                        aria-label={`Delete ${item.title || "chat"}`}
                        disabled={deletingChatId === item.id}
                        onClick={() => deleteConversation(item.id, item.title)}
                      >
                        <Trash2 size={11} />
                      </button>
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

        {extra && (
          <>
            <div className="sidebar-divider" />
            {extra}
          </>
        )}
      </div>

      <Link href={isAssess ? "/assess" : "/chat"} className="sidebar-mobile-fab" onClick={openFreshChat}>
        <SquarePen size={14} strokeWidth={1.75} />
        {isAssess ? "New assessment" : "New chat"}
      </Link>

      <div className="sidebar-footer">
        <div className="avatar-row sidebar-account-row">
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
          <div className="avatar-name" style={{ flex: 1, minWidth: 0 }}>
            {user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : "Norvar"}
          </div>
          <Link
            href="/settings"
            className={`sidebar-settings-btn${path === "/settings" ? " active" : ""}`}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={14} strokeWidth={path === "/settings" ? 2 : 1.75} />
          </Link>
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
