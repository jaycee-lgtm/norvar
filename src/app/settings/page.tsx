import AppShell from "@/components/AppShell";
import AiSettingsPanel from "@/components/AiSettingsPanel";
import AppearanceSettingsPanel from "@/components/AppearanceSettingsPanel";
import GapOwnerRolesPanel from "@/components/GapOwnerRolesPanel";
import OrgSettingsPanel from "@/components/OrgSettingsPanel";
import SettingsAccountSection from "@/components/SettingsAccountSection";

export default function SettingsPage() {
  return (
    <AppShell>
      <div className="main-area" style={{ overflowY: "auto" }}>
        <div className="page-body settings-page" style={{ margin: "0 auto" }}>
          <p className="stag" style={{ marginBottom: 8 }}>Settings</p>
          <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.04em", marginBottom: 20, fontFamily: "'Sora', sans-serif" }}>
            Your profile
          </h1>

          <AppearanceSettingsPanel />
          <AiSettingsPanel />
          <OrgSettingsPanel />
          <GapOwnerRolesPanel />
          <SettingsAccountSection />
        </div>
      </div>
    </AppShell>
  );
}
