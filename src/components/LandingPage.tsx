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
        <nav className="public-nav">
          <SignInButton>
            <button type="button" className="public-btn-ghost">Sign in</button>
          </SignInButton>
          <SignInButton>
            <button type="button" className="btn-primary" style={{ fontSize: 12, padding: "7px 16px" }}>
              Get started
            </button>
          </SignInButton>
        </nav>
      </header>

      <section className="public-hero">
        <div className="landing-hero public-hero-inner">
          <div className="public-eyebrow">Early access, norvar.io</div>
          <h1 className="public-hero-title">
            Know your regulatory<br />exposure before<br />you build
          </h1>
          <p className="public-hero-copy">
            Norvar maps what you are building to the regulations that apply, scores your risk, and surfaces compliance gaps before launch.
          </p>
          <div className="landing-cta-row public-cta-row">
            <SignInButton>
              <button type="button" className="btn-primary">Run first assessment</button>
            </SignInButton>
            <SignInButton>
              <button type="button" className="public-btn-secondary">Sign in</button>
            </SignInButton>
          </div>
        </div>
      </section>

      <footer className="landing-footer public-shell-footer">
        <div className="landing-brand-row public-brand-row">
          <Logo size={20} />
          <span className="public-footer-meta">Norvar - norvar.io</span>
        </div>
        <div className="landing-footer-links public-footer-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/contact">Contact</Link>
        </div>
      </footer>

    </div>
  );
}
