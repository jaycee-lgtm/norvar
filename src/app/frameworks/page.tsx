"use client";

import AppShell from "@/components/AppShell";
import FrameworkCatalogPanel from "@/components/FrameworkCatalogPanel";

export default function FrameworksPage() {
  return (
    <AppShell>
      <div className="main-area" style={{ overflowY: "auto" }}>
        <div className="page-body" style={{ margin: "0 auto", maxWidth: 920 }}>
          <FrameworkCatalogPanel />
        </div>
      </div>
    </AppShell>
  );
}
