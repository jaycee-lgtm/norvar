import Link from "next/link";
import PublicPageLayout from "@/components/PublicPageLayout";

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
    body: `For questions about these terms, contact legal@norvar.io or use our contact form.`,
  },
];

export default function TermsPage() {
  return (
    <PublicPageLayout>
      <div className="public-document-intro">
        <p className="public-page-kicker">Legal</p>
        <h1 className="public-page-title">Terms of Service</h1>
        <p className="public-page-meta">Last updated: June 2026</p>
      </div>

      <div className="public-document-sections">
        {SECTIONS.map(s => (
          <section key={s.title} className="public-section">
            <h2 className="public-section-title">{s.title}</h2>
            <p className="public-section-body">
              {s.title === "Contact" ? (
                <>
                  For questions about these terms, email{" "}
                  <a href="mailto:legal@norvar.io">legal@norvar.io</a>
                  {" "}or use our{" "}
                  <Link href="/contact">contact form</Link>.
                </>
              ) : (
                s.body
              )}
            </p>
          </section>
        ))}
      </div>
    </PublicPageLayout>
  );
}
