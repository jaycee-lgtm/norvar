import Link from "next/link";
import Logo from "@/components/Logo";

const H = "#e2e2e0";

const SECTIONS = [
  {
    title: "Acceptance",
    body: `By creating an account or using Norvar, you agree to these terms. If you do not agree, do not use the service. These terms apply to all users, including those accessing Norvar during early access.`,
  },
  {
    title: "What Norvar is",
    body: `Norvar is a compliance intelligence tool that generates AI-assisted assessments of regulatory exposure based on information you provide. Norvar is not a law firm and does not provide legal advice. Outputs are informational only and do not constitute legal opinion. You should consult qualified legal counsel before making compliance decisions.`,
  },
  {
    title: "Your account",
    body: `You are responsible for maintaining the security of your account credentials. You may not share your account with others. You must provide accurate information when registering. We reserve the right to suspend or terminate accounts that violate these terms.`,
  },
  {
    title: "Acceptable use",
    body: `You may use Norvar for lawful purposes only. You may not use Norvar to assess deployments that are themselves illegal, to attempt to extract or reverse-engineer the underlying regulatory corpus, to overload or attack the service, or to resell or sublicense access without our written permission.`,
  },
  {
    title: "Your content",
    body: `You retain ownership of the descriptions and information you submit to Norvar. By submitting content, you grant us a limited licence to process it for the purpose of providing the service. We do not claim ownership of your inputs or the assessments we generate for you.`,
  },
  {
    title: "Accuracy and disclaimers",
    body: `Norvar makes reasonable efforts to maintain an accurate and current regulatory corpus. However, regulations change frequently, and Norvar may not reflect the most recent legislative or regulatory developments. Do not rely solely on Norvar for compliance decisions. We make no warranties, express or implied, regarding the accuracy, completeness, or fitness for purpose of any assessment output.`,
  },
  {
    title: "Limitation of liability",
    body: `To the maximum extent permitted by applicable law, Norvar and its operators shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service. Our total liability to you for any claim arising from these terms or your use of Norvar shall not exceed the amount you have paid us in the 12 months preceding the claim.`,
  },
  {
    title: "Changes to these terms",
    body: `We may update these terms from time to time. We will notify you of material changes by email or by displaying a notice in the app. Continued use of Norvar after changes are posted constitutes acceptance of the updated terms.`,
  },
  {
    title: "Contact",
    body: `For questions about these terms, contact us at legal@norvar.io.`,
  },
];

export default function TermsPage() {
  return (
    <div className="public-page" style={{ background: "#000", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Sora', system-ui, sans-serif" }}>

      <header className="public-page-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 52px", borderBottom: "0.5px solid rgba(255,255,255,.07)" }}>
        <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <Logo size={26} />
          <span style={{ fontSize: 15, fontWeight: 500, color: H, letterSpacing: "-.03em" }}>Norvar</span>
        </Link>
        <Link href="/" style={{ fontSize: 12, color: "#444442", textDecoration: "none", letterSpacing: "-.01em" }}>Back to home</Link>
      </header>

      <main className="public-page-main" style={{ flex: 1, padding: "72px 52px", maxWidth: 680 }}>
        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: ".1em", textTransform: "uppercase", color: "#444442", marginBottom: 16, fontFamily: "'Sora', sans-serif" }}>Legal</p>
        <h1 style={{ fontSize: 32, fontWeight: 500, color: H, letterSpacing: "-.04em", marginBottom: 12, fontFamily: "'Sora', sans-serif" }}>Terms of Service</h1>
        <p style={{ fontSize: 13, color: "#888884", marginBottom: 52, fontFamily: "'Sora', sans-serif" }}>Last updated: June 2026</p>

        {SECTIONS.map(s => (
          <div key={s.title} style={{ marginBottom: 36 }}>
            <h2 style={{ fontSize: 14, fontWeight: 500, color: H, marginBottom: 10, letterSpacing: "-.02em", fontFamily: "'Sora', sans-serif" }}>{s.title}</h2>
            <p style={{ fontSize: 13, color: "#888884", lineHeight: 1.8, fontFamily: "'Sora', sans-serif", letterSpacing: "-.01em" }}>{s.body}</p>
          </div>
        ))}
      </main>

      <footer className="public-page-footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 52px", borderTop: "0.5px solid rgba(255,255,255,.07)" }}>
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
