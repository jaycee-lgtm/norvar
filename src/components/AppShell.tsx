"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Logo from "@/components/Logo";

function AppShellInner({
  children,
  sidebarExtra,
}: {
  children:      ReactNode;
  sidebarExtra?: ReactNode;
}) {
  const pathname   = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

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
          {mobileOpen ? <X size={18} strokeWidth={2} /> : <Menu size={18} strokeWidth={2} />}
        </button>
        <div className="mobile-header-brand">
          <Logo size={22} />
          <span>Norvar</span>
        </div>
      </header>

      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="Close navigation menu"
        tabIndex={mobileOpen ? 0 : -1}
        onClick={() => setMobileOpen(false)}
      />

      <Sidebar extra={sidebarExtra} />

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
    <Suspense fallback={<div className="app-shell">{children}</div>}>
      <AppShellInner sidebarExtra={sidebarExtra}>{children}</AppShellInner>
    </Suspense>
  );
}
