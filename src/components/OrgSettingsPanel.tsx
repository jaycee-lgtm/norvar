"use client";

import { OrganizationProfile, OrganizationSwitcher } from "@clerk/nextjs";
import SettingsSection from "@/components/SettingsSection";

const orgAppearance = {
  elements: {
    rootBox:         { width: "100%" },
    card:            { background: "var(--card)", border: "0.5px solid var(--bdr)", borderRadius: 8, boxShadow: "none", width: "100%" },
    navbar:          { background: "var(--card2)", borderRight: "0.5px solid var(--bdr)" },
    navbarButton:    { color: "var(--fg2)", fontFamily: "'Sora', sans-serif" },
    headerTitle:     { color: "var(--fg)", fontFamily: "'Sora', sans-serif" },
    headerSubtitle:  { color: "var(--fg3)" },
    formFieldLabel:  { color: "var(--fg2)", fontFamily: "'Sora', sans-serif" },
    formFieldInput:  { background: "var(--card2)", border: "0.5px solid var(--bdr2)", color: "var(--fg)", fontFamily: "'Sora', sans-serif" },
    formButtonPrimary: { background: "var(--red)", fontFamily: "'Sora', sans-serif" },
    organizationSwitcherTrigger: {
      width:          "100%",
      justifyContent: "flex-start",
      padding:        "8px 10px",
      borderRadius:   "8px",
      border:         "0.5px solid var(--bdr2)",
      background:     "var(--card)",
      color:          "var(--fg2)",
      fontSize:       "12px",
      fontFamily:     "'Sora', sans-serif",
      boxShadow:      "none",
    },
    organizationPreviewMainIdentifier:      { fontSize: "12px", color: "var(--fg)" },
    organizationPreviewSecondaryIdentifier: { fontSize: "11px", color: "var(--fg3)" },
  },
};

export default function OrgSettingsPanel() {
  return (
    <SettingsSection
      label="Organization"
      title="Workspace"
      description="Switch workspace, invite members, and manage organization settings."
    >
      <div className="settings-org-switcher">
        <OrganizationSwitcher
          hidePersonal={false}
          afterCreateOrganizationUrl="/settings"
          afterSelectOrganizationUrl="/settings"
          appearance={orgAppearance}
        />
      </div>

      <div className="settings-clerk settings-org" style={{ marginTop: 16 }}>
        <OrganizationProfile appearance={orgAppearance} />
      </div>
    </SettingsSection>
  );
}
