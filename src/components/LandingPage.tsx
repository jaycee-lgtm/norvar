"use client";

import Link from "next/link";
import { SignInButton } from "@clerk/nextjs";

const H = "#e2e2e0";

export default function LandingPage() {
  return (
    <div style={{ background: "#000", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Sora', system-ui, sans-serif" }}>

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 52px", borderBottom: "0.5px solid rgba(255,255,255,.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <div style={{ width: 26, height: 26, background: "#8b1a1a", borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: "#f5f5f4", fontFamily: "'Sora', sans-serif" }}>N</div>
          <span style={{ fontSize: 15, fontWeight: 500, color: H, letterSpacing: "-.03em", fontFamily: "'Sora', sans-serif" }}>Norvar</span>
        </div>
        <nav style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <Link href="/frameworks" style={{ fontSize: 12, color: "#444442", padding: "5px 12px", fontFamily: "'Sora', sans-serif", letterSpacing: "-.01em", textDecoration: "none" }}>Frameworks</Link>
          <SignInButton>
            <button type="button" style={{ fontSize: 12, color: "#444442", padding: "5px 12px", background: "transparent", border: "none", cursor: "pointer", fontFamily: "'Sora', sans-serif", letterSpacing: "-.01em" }}>Sign in</button>
          </SignInButton>
          <SignInButton>
            <button type="button" style={{ fontSize: 12, background: "#8b1a1a", color: "#f5f5f4", padding: "7px 16px", borderRadius: 6, fontWeight: 500, fontFamily: "'Sora', sans-serif", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}>
              Get started
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f5f5f4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </SignInButton>
        </nav>
      </header>

      <section style={{ flex: 1, display: "flex", alignItems: "center" }}>
        <div style={{ padding: "80px 52px", width: "100%" }}>
          <div style={{ display: "inline-flex", alignItems: "center", border: "0.5px solid rgba(255,255,255,.12)", borderRadius: 20, padding: "4px 14px", marginBottom: 28, fontSize: 9, color: "#444442", letterSpacing: ".1em", textTransform: "uppercase", fontFamily: "'Sora', sans-serif" }}>
            Early access, norvar.io
          </div>
          <h1 style={{ fontSize: "clamp(28px, 4vw, 52px)", fontWeight: 500, color: H, letterSpacing: "-.045em", lineHeight: 1.05, marginBottom: 22, maxWidth: 640, fontFamily: "'Sora', sans-serif" }}>
            Know your regulatory<br />exposure before<br />you build
          </h1>
          <p style={{ fontSize: 15, color: "#888884", lineHeight: 1.7, maxWidth: 460, letterSpacing: "-.01em", marginBottom: 36, fontFamily: "'Sora', sans-serif" }}>
            Norvar maps what you are building to the regulations that apply, scores your risk, and surfaces compliance gaps before launch.
          </p>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <SignInButton>
              <button type="button" style={{ fontSize: 13, background: "#8b1a1a", color: "#f5f5f4", padding: "11px 22px", borderRadius: 6, fontWeight: 500, fontFamily: "'Sora', sans-serif", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 7 }}>
                Run first assessment
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f5f5f4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
              </button>
            </SignInButton>
            <SignInButton>
              <button type="button" style={{ fontSize: 13, color: "#888884", padding: "10px 18px", borderRadius: 6, border: "0.5px solid rgba(255,255,255,.12)", background: "transparent", cursor: "pointer", fontFamily: "'Sora', sans-serif" }}>
                Sign in
              </button>
            </SignInButton>
          </div>
        </div>
      </section>

      <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 52px", borderTop: "0.5px solid rgba(255,255,255,.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 20, height: 20, background: "#8b1a1a", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, color: "#f5f5f4", fontFamily: "'Sora', sans-serif" }}>N</div>
          <span style={{ fontSize: 11, color: "#444442", fontFamily: "'Sora', sans-serif" }}>Norvar - norvar.io</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Link href="/privacy" style={{ fontSize: 11, color: "#444442", fontFamily: "'Sora', sans-serif", textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms"   style={{ fontSize: 11, color: "#444442", fontFamily: "'Sora', sans-serif", textDecoration: "none" }}>Terms</Link>
          <Link href="/contact" style={{ fontSize: 11, color: "#444442", fontFamily: "'Sora', sans-serif", textDecoration: "none" }}>Contact</Link>
        </div>
      </footer>

    </div>
  );
}
