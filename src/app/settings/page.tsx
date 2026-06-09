import Sidebar from "@/components/Sidebar";
import { UserProfile } from "@clerk/nextjs";

export default function SettingsPage() {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area" style={{ overflowY: "auto" }}>
        <div className="page-body" style={{ margin: "0 auto" }}>
          <p className="stag" style={{ marginBottom: 8 }}>Account</p>
          <h1 style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.04em", marginBottom: 24, fontFamily: "'Sora', sans-serif" }}>
            Settings
          </h1>
          <UserProfile
            appearance={{
              elements: {
                card:            { background: "var(--card)", border: "0.5px solid var(--bdr)", borderRadius: 8, boxShadow: "none" },
                navbar:          { background: "var(--card2)", borderRight: "0.5px solid var(--bdr)" },
                navbarButton:    { color: "var(--fg2)", fontFamily: "'Sora', sans-serif" },
                headerTitle:     { color: "var(--fg)", fontFamily: "'Sora', sans-serif" },
                headerSubtitle:  { color: "var(--fg3)" },
                formFieldLabel:  { color: "var(--fg2)", fontFamily: "'Sora', sans-serif" },
                formFieldInput:  { background: "var(--card2)", border: "0.5px solid var(--bdr2)", color: "var(--fg)", fontFamily: "'Sora', sans-serif" },
                formButtonPrimary: { background: "var(--red)", fontFamily: "'Sora', sans-serif" },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
