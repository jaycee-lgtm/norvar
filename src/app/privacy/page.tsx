import Link from "next/link";
import Logo from "@/components/Logo";

const H = "#e2e2e0";

const SECTIONS = [
  {
    title: "What we collect",
    body: `When you create an account, we collect your name and email address via Clerk, our authentication provider. When you run an assessment or use GRC Chat, we store your input descriptions and the results Norvar generates. We do not collect payment information directly — billing is handled by our payment processor if and when billing is introduced.`,
  },
  {
    title: "How we use it",
    body: `Your assessment inputs and results are used solely to provide the Norvar service to you, to display your history, and to restore your conversations. We do not use your inputs to train AI models. We do not sell your data to third parties. We do not use your data for advertising.`,
  },
  {
    title: "Storage and retention",
    body: `Your data is stored in Supabase, a cloud database provider, in the United States. Assessment history and chat conversations are retained for as long as your account is active. You may delete your account and all associated data at any time by contacting us.`,
  },
  {
    title: "Third-party services",
    body: `Norvar uses the following third-party services to operate: Clerk for authentication, Supabase for data storage, Anthropic for AI inference, Voyage AI for embeddings, and Vercel for hosting. Each of these providers processes data under their own privacy policies. We recommend reviewing them if you have concerns about specific data handling practices.`,
  },
  {
    title: "Your rights",
    body: `Depending on where you are located, you may have rights to access, correct, delete, or export your personal data. To exercise any of these rights, contact us at the address below. We will respond within 30 days.`,
  },
  {
    title: "Contact",
    body: `For privacy questions or requests, contact us at privacy@norvar.io.`,
  },
];

export default function PrivacyPage() {
  return (
    <div style={{ background: "#000", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Sora', system-ui, sans-serif" }}>

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 52px", borderBottom: "0.5px solid rgba(255,255,255,.07)" }}>
        <Link href="/chat" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <Logo size={26} />
          <span style={{ fontSize: 15, fontWeight: 500, color: H, letterSpacing: "-.03em" }}>Norvar</span>
        </Link>
        <Link href="/chat" style={{ fontSize: 12, color: "#444442", textDecoration: "none", letterSpacing: "-.01em" }}>Back to home</Link>
      </header>

      <main style={{ flex: 1, padding: "72px 52px", maxWidth: 680 }}>
        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: ".1em", textTransform: "uppercase", color: "#444442", marginBottom: 16, fontFamily: "'Sora', sans-serif" }}>Legal</p>
        <h1 style={{ fontSize: 32, fontWeight: 500, color: H, letterSpacing: "-.04em", marginBottom: 12, fontFamily: "'Sora', sans-serif" }}>Privacy Policy</h1>
        <p style={{ fontSize: 13, color: "#888884", marginBottom: 52, fontFamily: "'Sora', sans-serif" }}>Last updated: June 2026</p>

        {SECTIONS.map(s => (
          <div key={s.title} style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 14, fontWeight: 500, color: H, marginBottom: 10, letterSpacing: "-.02em", fontFamily: "'Sora', sans-serif" }}>{s.title}</h2>
            <p style={{ fontSize: 13, color: "#888884", lineHeight: 1.8, fontFamily: "'Sora', sans-serif", letterSpacing: "-.01em" }}>{s.body}</p>
          </div>
        ))}
      </main>

      <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 52px", borderTop: "0.5px solid rgba(255,255,255,.07)" }}>
        <span style={{ fontSize: 11, color: "#444442", fontFamily: "'Sora', sans-serif" }}>Norvar - norvar.io</span>
        <div style={{ display: "flex", gap: 20 }}>
          <Link href="/privacy" style={{ fontSize: 11, color: "#444442", textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms"   style={{ fontSize: 11, color: "#444442", textDecoration: "none" }}>Terms</Link>
          <Link href="/contact" style={{ fontSize: 11, color: "#444442", textDecoration: "none" }}>Contact</Link>
        </div>
      </footer>

    </div>
  );
}
