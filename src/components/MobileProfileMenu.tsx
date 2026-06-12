"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useClerk, useUser } from "@clerk/nextjs";
import { Settings, Layers, LogOut } from "lucide-react";

export default function MobileProfileMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const initials = user
    ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() || "N"
    : "N";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
    };
  }, [open]);

  return (
    <div className="mobile-header-profile" ref={ref}>
      <button
        type="button"
        className="mobile-header-profile-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        onClick={() => setOpen(o => !o)}
      >
        <span className="mobile-header-initials" aria-hidden>{initials}</span>
      </button>

      {open && (
        <div className="mobile-profile-menu" role="menu">
          <Link href="/settings" className="mobile-profile-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <Settings size={14} strokeWidth={1.75} />
            Settings
          </Link>
          <Link href="/frameworks" className="mobile-profile-menu-item" role="menuitem" onClick={() => setOpen(false)}>
            <Layers size={14} strokeWidth={1.75} />
            Frameworks
          </Link>
          <button
            type="button"
            className="mobile-profile-menu-item mobile-profile-menu-item--danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut({ redirectUrl: "/" });
            }}
          >
            <LogOut size={14} strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
