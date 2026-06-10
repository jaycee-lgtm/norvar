"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { SquarePen, FileSearch, LayoutDashboard, Layers, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import ModeSelector from "@/components/ModeSelector";

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

export default function Sidebar() {
  const path     = usePathname();
  const { user } = useUser();
  const isChat   = path.startsWith("/chat");

  const [assessments,   setAssessments]   = useState<RecentAssessment[]>([]);
  const [conversations, setConversations] = useState<RecentConversation[]>([]);

  useEffect(() => {
    fetch("/api/assessments?limit=5")
      .then(r => r.json())
      .then(d => setAssessments(d.assessments || []))
      .catch(() => {});
    fetch("/api/conversations?limit=5")
      .then(r => r.json())
      .then(d => setConversations(d.conversations || []))
      .catch(() => {});
  }, [path]);

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "N"
    : "N";

  const nav = [
    { href: "/",           label: "Assessments", icon: FileSearch,      active: path === "/" },
    { href: "/history",    label: "History",     icon: LayoutDashboard, active: path === "/history" },
    { href: "/frameworks", label: "Frameworks",  icon: Layers,          active: path === "/frameworks" },
    { href: "/settings",   label: "Settings",    icon: Settings,        active: path === "/settings" },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <Link href={isChat ? "/chat" : "/"} className="new-assess-btn">
          <span className="new-assess-label">{isChat ? "New chat" : "New assessment"}</span>
          <SquarePen size={14} color="var(--fg3)" />
        </Link>
      </div>

      <div style={{ padding: "0 10px 8px" }}>
        <ModeSelector current={isChat ? "chat" : "assess"} compact />
      </div>

      <div className="sidebar-divider" style={{ margin: "0 8px 6px" }} />

      <div className="sidebar-scroll">
        <div style={{ padding: "0 0 4px" }}>
          {nav.map(({ href, label, icon: Icon, active }) => (
            <Link key={href} href={href} className={`sidebar-nav-item ${active ? "active" : ""}`}>
              <Icon size={14} strokeWidth={active ? 2 : 1.75} />
              {label}
            </Link>
          ))}
        </div>

        {assessments.length > 0 && !isChat && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section">Recent assessments</div>
            {assessments.map(item => {
              const c = TIER[tierKey(item.risk_tier)];
              return (
                <Link key={item.id} href={`/?id=${item.id}`} className="recent-item">
                  <div className="recent-dot" style={{ background: c.dot }} />
                  <span className="recent-text">{item.title}</span>
                  <span className="recent-score" style={{ color: c.badge, background: c.bg, border: `0.5px solid ${c.bdr}` }}>
                    {item.risk_score}
                  </span>
                </Link>
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
      </div>

      <div className="sidebar-footer">
        <div className="avatar-row">
          <div className="avatar">{initials}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="avatar-name">
              {user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : "Norvar"}
            </div>
            <div className="avatar-sub">norvar.io</div>
          </div>
          <UserButton />
        </div>
      </div>
    </aside>
  );
}
