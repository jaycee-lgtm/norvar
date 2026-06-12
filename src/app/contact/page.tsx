"use client";

import Link from "next/link";
import Logo from "@/components/Logo";
import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";

const H = "#e2e2e0";

export default function ContactPage() {
  const [name,    setName]    = useState("");
  const [email,   setEmail]   = useState("");
  const [message, setMessage] = useState("");
  const [sent,    setSent]    = useState(false);
  const [sending, setSending] = useState(false);

  const canSend = name.trim() && email.trim() && message.trim().length > 10 && !sending;

  const handleSubmit = async () => {
    if (!canSend) return;
    setSending(true);
    const subject = encodeURIComponent(`Norvar contact from ${name}`);
    const body    = encodeURIComponent(`Name: ${name}\nEmail: ${email}\n\n${message}`);
    window.location.href = `mailto:hello@norvar.io?subject=${subject}&body=${body}`;
    setTimeout(() => { setSent(true); setSending(false); }, 800);
  };

  const inputStyle = {
    width: "100%" as const,
    background: "#0f0f0f",
    border: "0.5px solid rgba(255,255,255,.12)",
    borderRadius: 6,
    padding: "10px 14px",
    fontSize: 13,
    fontFamily: "'Sora', sans-serif",
    color: H,
    outline: "none",
    letterSpacing: "-.01em",
  };

  const labelStyle = {
    display: "block" as const,
    fontSize: 11,
    fontWeight: 500 as const,
    color: "#444442",
    marginBottom: 7,
    fontFamily: "'Sora', sans-serif",
    letterSpacing: "-.01em",
  };

  return (
    <div style={{ background: "#000", minHeight: "100vh", display: "flex", flexDirection: "column", fontFamily: "'Sora', system-ui, sans-serif" }}>

      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 52px", borderBottom: "0.5px solid rgba(255,255,255,.07)" }}>
        <Link href="/chat" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
          <Logo size={26} />
          <span style={{ fontSize: 15, fontWeight: 500, color: H, letterSpacing: "-.03em" }}>Norvar</span>
        </Link>
        <Link href="/chat" style={{ fontSize: 12, color: "#444442", textDecoration: "none", letterSpacing: "-.01em" }}>Back to home</Link>
      </header>

      <main style={{ flex: 1, padding: "72px 52px", maxWidth: 560 }}>
        <p style={{ fontSize: 10, fontWeight: 500, letterSpacing: ".1em", textTransform: "uppercase", color: "#444442", marginBottom: 16, fontFamily: "'Sora', sans-serif" }}>Get in touch</p>
        <h1 style={{ fontSize: 32, fontWeight: 500, color: H, letterSpacing: "-.04em", marginBottom: 12, fontFamily: "'Sora', sans-serif" }}>Contact</h1>
        <p style={{ fontSize: 13, color: "#888884", lineHeight: 1.75, marginBottom: 52, fontFamily: "'Sora', sans-serif", letterSpacing: "-.01em", maxWidth: 400 }}>
          Questions about Norvar, early access, partnerships, or anything else. We read every message.
        </p>

        {sent ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", background: "#0f0f0f", border: "0.5px solid rgba(255,255,255,.1)", borderRadius: 8 }}>
            <Check size={16} strokeWidth={2.5} color="#3d9e67" style={{ flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: "#888884", fontFamily: "'Sora', sans-serif" }}>Message sent. We will be in touch shortly.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <label style={labelStyle}>Name</label>
              <input
                style={inputStyle}
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                onFocus={e => { e.target.style.borderColor = "rgba(255,255,255,.24)"; }}
                onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,.12)"; }}
              />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input
                style={inputStyle}
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onFocus={e => { e.target.style.borderColor = "rgba(255,255,255,.24)"; }}
                onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,.12)"; }}
              />
            </div>
            <div>
              <label style={labelStyle}>Message</label>
              <textarea
                style={{ ...inputStyle, minHeight: 130, resize: "vertical", lineHeight: 1.65 }}
                placeholder="What would you like to discuss?"
                value={message}
                onChange={e => setMessage(e.target.value)}
                onFocus={e => { e.target.style.borderColor = "rgba(255,255,255,.24)"; }}
                onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,.12)"; }}
              />
            </div>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSend}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                fontSize: 13, background: canSend ? "#8b1a1a" : "#161616",
                color: canSend ? "#f5f5f4" : "#444442",
                padding: "11px 22px", borderRadius: 6, fontWeight: 500,
                fontFamily: "'Sora', sans-serif", border: "none",
                cursor: canSend ? "pointer" : "not-allowed",
                transition: "all 0.15s", width: "fit-content",
              }}
            >
              {sending ? "Sending..." : "Send message"}
              {!sending && <ArrowRight size={14} strokeWidth={2} />}
            </button>
          </div>
        )}
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
