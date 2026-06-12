"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { UserButton, useUser } from "@clerk/nextjs";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";

function MobileProfileButton() {
  const { user } = useUser();
  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "N"
    : "N";

  return (
    <div className="mobile-header-profile">
      <span className="mobile-header-initials" aria-hidden>{initials}</span>
      <UserButton
        appearance={{
          elements: {
            userButtonAvatarBox:       { display: "none" },
            userButtonOuterIdentifier: { display: "none" },
            userButtonTrigger:         { width: "100%", height: "100%", opacity: 0 },
            rootBox:                   { position: "absolute", inset: 0 },
          },
        }}
      />
    </div>
  );
}

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
          <Menu size={18} strokeWidth={1.75} />
        </button>
        <div className="mobile-header-spacer" />
        <MobileProfileButton />
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
    <Suspense fallback={<div className="app-shell">{children}</div>}>
      <AppShellInner sidebarExtra={sidebarExtra}>{children}</AppShellInner>
    </Suspense>
  );
}
