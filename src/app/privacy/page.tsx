import Link from "next/link";
import PublicPageLayout from "@/components/PublicPageLayout";

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
    body: `Depending on where you are located, you may have rights to access, correct, delete, or export your personal data. To exercise any of these rights, contact us using the form below. We will respond within 30 days.`,
  },
  {
    title: "Contact",
    body: `For privacy questions or requests, email privacy@norvar.io or use our contact form.`,
  },
];

export default function PrivacyPage() {
  return (
    <PublicPageLayout>
      <div className="public-document-intro">
        <p className="public-page-kicker">Legal</p>
        <h1 className="public-page-title">Privacy Policy</h1>
        <p className="public-page-meta">Last updated: June 2026</p>
      </div>

      <div className="public-document-sections">
        {SECTIONS.map(s => (
          <section key={s.title} className="public-section">
            <h2 className="public-section-title">{s.title}</h2>
            <p className="public-section-body">
              {s.title === "Contact" ? (
                <>
                  For privacy questions or requests, email{" "}
                  <a href="mailto:privacy@norvar.io">privacy@norvar.io</a>
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
