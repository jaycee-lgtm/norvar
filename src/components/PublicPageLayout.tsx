import Link from "next/link";
import Logo from "@/components/Logo";

type PublicPageLayoutProps = {
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function PublicPageLayout({ children, footer }: PublicPageLayoutProps) {
  return (
    <div className="public-shell public-shell--document">
      <header className="public-shell-header public-document-header">
        <Link href="/" className="public-brand-row" style={{ textDecoration: "none" }}>
          <Logo size={26} />
          <span className="public-brand-name">Norvar</span>
        </Link>
        <Link href="/" className="public-link-muted">Back to home</Link>
      </header>

      <main className="public-page-body public-document-body">{children}</main>

      <footer className="public-shell-footer">
        {footer ?? (
          <>
            <nav className="public-footer-links" aria-label="Legal and contact">
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/contact">Contact</Link>
            </nav>
            <span className="public-footer-meta">Norvar · norvar.io</span>
          </>
        )}
      </footer>
    </div>
  );
}
