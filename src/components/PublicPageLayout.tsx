import Link from "next/link";
import Logo from "@/components/Logo";

type PublicPageLayoutProps = {
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export default function PublicPageLayout({ children, footer }: PublicPageLayoutProps) {
  return (
    <div className="public-shell">
      <header className="public-shell-header">
        <Link href="/" className="public-brand-row" style={{ textDecoration: "none" }}>
          <Logo size={26} />
          <span className="public-brand-name">Norvar</span>
        </Link>
        <Link href="/" className="public-link-muted">Back to home</Link>
      </header>

      <main className="public-page-body">{children}</main>

      <footer className="public-shell-footer">
        {footer ?? (
          <>
            <span className="public-footer-meta">Norvar - norvar.io</span>
            <div className="public-footer-links">
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
              <Link href="/contact">Contact</Link>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
