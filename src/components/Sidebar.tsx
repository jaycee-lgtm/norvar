"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UserButton, OrganizationSwitcher, useUser } from "@clerk/nextjs";
import { SquarePen, FileSearch, LayoutDashboard, Layers, Settings, MessageSquare, FolderOpen, ShieldAlert, Trash2, Briefcase } from "lucide-react";
import ModeSelector from "@/components/ModeSelector";
import Logo from "@/components/Logo";

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

const TIER = {
  high:   { dot: "var(--rh)", badge: "var(--rh)", bg: "var(--rh-bg)", bdr: "var(--rh-bdr)" },
  medium: { dot: "var(--rm)", badge: "var(--rm)", bg: "var(--rm-bg)", bdr: "var(--rm-bdr)" },
  low:    { dot: "var(--rl)", badge: "var(--rl)", bg: "var(--rl-bg)", bdr: "var(--rl-bdr)" },
};

function tierKey(t: string): keyof typeof TIER {
  const v = t?.toLowerCase();
  return v === "high" ? "high" : v === "medium" ? "medium" : "low";
}

function SidebarInner({ extra }: { extra?: ReactNode }) {
  const path         = usePathname();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { user }     = useUser();
  const isChat   = path === "/chat" || path.startsWith("/chat/");
  const isAssess = path === "/assess";
  const sidebarMode = isAssess ? "assess" as const : "chat" as const;
  const activeId     = searchParams.get("id");

  const [assessments,   setAssessments]   = useState<RecentAssessment[]>([]);
  const [conversations, setConversations] = useState<RecentConversation[]>([]);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);

  const loadAssessments = () => {
    fetch("/api/assessments?limit=5")
      .then(r => r.json())
      .then(d => setAssessments(d.assessments || []))
      .catch(() => {});
  };

  useEffect(() => {
    if (isChat) {
      fetch("/api/conversations?limit=5")
        .then(r => r.json())
        .then(d => setConversations(d.conversations || []))
        .catch(() => {});
    } else {
      loadAssessments();
    }
  }, [path, searchParams.toString(), isChat]);

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

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "N"
    : "N";

  const mainNav = [
    { href: "/chat", label: "Chat", icon: MessageSquare, active: path === "/chat" },
    { href: "/assess", label: "Assessments", icon: FileSearch, active: isAssess },
    { href: "/documents", label: "Documents", icon: FolderOpen, active: path === "/documents" },
    { href: "/remediation", label: "Remediation", icon: ShieldAlert, active: path === "/remediation" },
    {
      href: isAssess || path === "/history" ? "/history" : "/chat/history",
      label: "History",
      icon: LayoutDashboard,
      active: path === "/history" || path === "/chat/history",
    },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 2px 10px" }}>
          <Logo size={24} />
          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)", letterSpacing: "-.03em", fontFamily: "'Sora', sans-serif" }}>
            Norvar
          </span>
        </div>
        <Link href={isAssess ? "/assess" : "/chat"} className="new-assess-btn">
          <span className="new-assess-label">{isAssess ? "New assessment" : "New chat"}</span>
          <SquarePen size={14} color="var(--fg3)" />
        </Link>
      </div>

      <div style={{ padding: "0 10px 8px" }}>
        <ModeSelector current={sidebarMode} compact />
      </div>

      <div className="sidebar-divider" style={{ margin: "0 8px 6px" }} />

      <div className="sidebar-org-switcher">
        <OrganizationSwitcher
          hidePersonal={false}
          afterCreateOrganizationUrl="/remediation"
          afterSelectOrganizationUrl="/remediation"
          appearance={{
            elements: {
              rootBox:                   { width: "100%" },
              organizationSwitcherTrigger: {
                width:           "100%",
                justifyContent:  "flex-start",
                padding:         "6px 8px",
                borderRadius:    "6px",
                border:          "0.5px solid var(--bdr2)",
                background:      "var(--card)",
                color:           "var(--fg2)",
                fontSize:        "11px",
                fontFamily:      "'Sora', sans-serif",
                boxShadow:       "none",
              },
              organizationPreviewTextContainer: { fontSize: "11px" },
              organizationPreviewMainIdentifier:  { fontSize: "11px", color: "var(--fg)" },
              organizationPreviewSecondaryIdentifier: { fontSize: "10px", color: "var(--fg3)" },
            },
          }}
        />
      </div>

      <div className="sidebar-scroll">
        <div style={{ padding: "0 0 4px" }}>
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
            className={`sidebar-nav-item${path.startsWith("/projects") ? " active" : ""}`}
          >
            <Briefcase size={14} strokeWidth={path.startsWith("/projects") ? 2 : 1.75} />
            All projects
          </Link>
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

        {assessments.length > 0 && isAssess && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section">Recent assessments</div>
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
          </>
        )}

        {conversations.length > 0 && isChat && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section">Recent chats</div>
            {conversations.map(item => (
              <Link key={item.id} href={`/chat?id=${item.id}`} className="recent-item">
                <div className="recent-dot" style={{ background: "var(--fg3)" }} />
                <span className="recent-text">{item.title || "Untitled chat"}</span>
              </Link>
            ))}
          </>
        )}

        {extra && (
          <>
            <div className="sidebar-divider" />
            {extra}
          </>
        )}
      </div>

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

export default function Sidebar({ extra }: { extra?: ReactNode }) {
  return (
    <Suspense fallback={<aside className="sidebar" />}>
      <SidebarInner extra={extra} />
    </Suspense>
  );
}
