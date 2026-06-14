"use client";

import { UserProfile } from "@clerk/nextjs";
import SettingsSection from "@/components/SettingsSection";

const clerkAppearance = {
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
  },
};

export default function SettingsAccountSection() {
  return (
    <SettingsSection
      label="Account"
      title="Sign-in & security"
      description="Manage your email, password, connected accounts, and active sessions."
    >
      <div className="settings-clerk">
        <UserProfile appearance={clerkAppearance} />
      </div>
    </SettingsSection>
  );
}
