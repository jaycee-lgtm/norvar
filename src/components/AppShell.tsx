"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Menu, SquarePen } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import MobileProfileMenu from "@/components/MobileProfileMenu";
import { getNewAction } from "@/lib/mobile-nav";

function AppShellInner({
  children,
  sidebarExtra,
}: {
  children:      ReactNode;
  sidebarExtra?: ReactNode;
}) {
  const pathname   = usePathname();
  const router     = useRouter();
  const searchParams = useSearchParams();
  const [mobileOpen, setMobileOpen] = useState(false);
  const newAction = getNewAction(pathname);

  const startFreshSession = () => {
    const activeId = searchParams.get("id");
    const activeDraft = searchParams.get("draft") ?? (pathname === "/draft" ? activeId : null);
    const onHome =
      (newAction.href === "/chat" && pathname === "/chat" && !activeId) ||
      (newAction.href === "/assess" && pathname === "/assess" && !activeId) ||
      (newAction.href === "/contracts" && pathname === "/contracts" && !activeId && searchParams.get("reviews") !== "1") ||
      (newAction.href === "/draft" && pathname === "/draft" && !activeDraft && searchParams.get("drafts") !== "1");
    if (onHome) {
      router.refresh();
      return;
    }
    router.replace(newAction.href);
  };

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  return (
    <div className={`app-shell${mobileOpen ? " sidebar-mobile-open" : ""}`}>
      <header className="mobile-header">
        <button
          type="button"
          className="mobile-menu-btn"
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMobileOpen(open => !open)}
        >
          <Menu size={18} strokeWidth={1.75} />
        </button>
        <div className="mobile-header-spacer" />
        <div className="mobile-header-actions">
          <button
            type="button"
            className="mobile-header-compose-btn"
            aria-label={newAction.label}
            onClick={startFreshSession}
          >
            <SquarePen size={16} strokeWidth={1.75} />
          </button>
          <MobileProfileMenu />
        </div>
      </header>

      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="Close navigation menu"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />

      <Sidebar extra={sidebarExtra} onNavigate={() => setMobileOpen(false)} />

      {children}
    </div>
  );
}

export default function AppShell({
  children,
  sidebarExtra,
}: {
  children:      ReactNode;
  sidebarExtra?: ReactNode;
}) {
  return (
    <Suspense fallback={
      <div className="app-shell">
        <header className="mobile-header" aria-hidden>
          <div className="mobile-menu-btn" style={{ visibility: "hidden" }} />
          <div className="mobile-header-spacer" />
          <div className="mobile-header-profile" style={{ visibility: "hidden" }} />
        </header>
        {children}
      </div>
    }>
      <AppShellInner sidebarExtra={sidebarExtra}>{children}</AppShellInner>
    </Suspense>
  );
}
