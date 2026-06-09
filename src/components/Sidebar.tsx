"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import {
  SquarePen, FileSearch, LayoutDashboard,
  Layers, Settings,
} from "lucide-react";
import { useEffect, useState } from "react";

type RecentItem = {
  id:        string;
  title:     string;
  risk_tier: string;
  score:     number;
  risk_score?: number;
};

const TIER_COLORS = {
  high:   { dot: "var(--rh)", badge: "var(--rh)", bg: "var(--rh-bg)", bdr: "var(--rh-bdr)" },
  medium: { dot: "var(--rm)", badge: "var(--rm)", bg: "var(--rm-bg)", bdr: "var(--rm-bdr)" },
  low:    { dot: "var(--rl)", badge: "var(--rl)", bg: "var(--rl-bg)", bdr: "var(--rl-bdr)" },
};

function tierKey(t: string): keyof typeof TIER_COLORS {
  const v = t?.toLowerCase();
  if (v === "high")   return "high";
  if (v === "medium") return "medium";
  return "low";
}

export default function Sidebar() {
  const path = usePathname();
  const { user } = useUser();
  const [recents, setRecents] = useState<RecentItem[]>([]);

  useEffect(() => {
    fetch("/api/assessments?limit=5")
      .then(r => r.json())
      .then(d => setRecents(d.assessments || []))
      .catch(() => {});
  }, []);

  const nav = [
    { href: "/",            label: "Assessments", icon: FileSearch      },
    { href: "/history",     label: "History",     icon: LayoutDashboard },
    { href: "/frameworks",  label: "Frameworks",  icon: Layers          },
    { href: "/settings",    label: "Settings",    icon: Settings        },
  ];

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "N"
    : "N";

  return (
    <aside className="sidebar">

      {/* Top */}
      <div className="sidebar-top">
        <Link href="/" className="new-assess-btn">
          <span className="new-assess-label">New assessment</span>
          <SquarePen size={14} color="var(--fg3)" />
        </Link>
      </div>

      {/* Nav */}
      <div className="sidebar-scroll">
        <div style={{ padding: "0 0 4px" }}>
          {nav.map(({ href, label, icon: Icon }) => {
            const active = path === href;
            return (
              <Link key={href} href={href} className={`sidebar-nav-item ${active ? "active" : ""}`}>
                <Icon size={14} strokeWidth={active ? 2 : 1.75} />
                {label}
              </Link>
            );
          })}
        </div>

        {/* Recents */}
        {recents.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <div className="sidebar-section">Recent</div>
            {recents.map(item => {
              const tk = tierKey(item.risk_tier);
              const colors = TIER_COLORS[tk];
              return (
                <Link key={item.id} href={`/?id=${item.id}`}
                  className={`recent-item ${path === "/" ? "" : ""}`}
                >
                  <div className="recent-dot" style={{ background: colors.dot }} />
                  <span className="recent-text">{item.title}</span>
                  <span className="recent-score" style={{
                    color: colors.badge,
                    background: colors.bg,
                    border: `0.5px solid ${colors.bdr}`,
                  }}>{item.risk_score ?? item.score}</span>
                </Link>
              );
            })}
          </>
        )}
      </div>

      {/* Footer */}
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
