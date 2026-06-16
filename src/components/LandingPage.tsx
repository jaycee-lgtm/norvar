"use client";

import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";
import Logo from "@/components/Logo";

export default function LandingPage() {
  return (
    <div className="public-shell">

      <header className="landing-header public-shell-header">
        <div className="landing-brand-row public-brand-row">
          <Logo size={28} />
          <span className="public-brand-name">Norvar</span>
        </div>
        <nav className="public-nav landing-header-nav">
          <SignInButton>
            <button type="button" className="public-btn-ghost">Sign in</button>
          </SignInButton>
          <SignInButton>
            <button type="button" className="btn-primary landing-header-cta" style={{ fontSize: 12, padding: "7px 16px" }}>
              Get started
            </button>
          </SignInButton>
        </nav>
      </header>

      <section className="public-hero landing-hero-section">
        <div className="landing-hero public-hero-inner">
          <div className="public-eyebrow landing-eyebrow">Early access · norvar.io</div>
          <h1 className="public-hero-title">
            Know your regulatory<br />exposure before<br />you build
          </h1>
          <p className="public-hero-copy">
            Norvar maps what you are building to the regulations that apply, scores your risk, and surfaces compliance gaps before launch.
          </p>
          <div className="landing-cta-row public-cta-row">
            <SignInButton>
              <button type="button" className="btn-primary landing-cta-primary">Run first assessment</button>
            </SignInButton>
            <SignInButton>
              <button type="button" className="public-btn-secondary landing-cta-secondary">Sign in</button>
            </SignInButton>
          </div>
        </div>
      </section>

      <footer className="landing-footer public-shell-footer">
        <nav className="landing-footer-links public-footer-links" aria-label="Legal and contact">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
        </nav>
        <div className="landing-footer-brand public-brand-row">
          <Logo size={18} />
          <span className="public-footer-meta">Norvar · norvar.io</span>
        </div>
      </footer>

    </div>
  );
}
