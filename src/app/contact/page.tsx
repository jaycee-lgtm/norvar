"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import PublicPageLayout from "@/components/PublicPageLayout";

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

  return (
    <PublicPageLayout>
      <p className="public-page-kicker">Get in touch</p>
      <h1 className="public-page-title">Contact</h1>
      <p className="public-page-meta" style={{ maxWidth: 400 }}>
        Questions about Norvar, early access, partnerships, or anything else. We read every message.
      </p>

      {sent ? (
        <div className="public-form-card" style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Check size={16} strokeWidth={2.5} color="var(--rl)" style={{ flexShrink: 0 }} />
          <p style={{ fontSize: 13, color: "var(--fg2)", fontFamily: "'Sora', sans-serif" }}>
            Message sent. We will be in touch shortly.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
          <div>
            <label className="public-page-kicker" style={{ marginBottom: 7, textTransform: "none", letterSpacing: "-0.01em", fontSize: 11 }}>
              Name
            </label>
            <input
              className="public-field"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div>
            <label className="public-page-kicker" style={{ marginBottom: 7, textTransform: "none", letterSpacing: "-0.01em", fontSize: 11 }}>
              Email
            </label>
            <input
              className="public-field"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="public-page-kicker" style={{ marginBottom: 7, textTransform: "none", letterSpacing: "-0.01em", fontSize: 11 }}>
              Message
            </label>
            <textarea
              className="public-field"
              style={{ minHeight: 130, resize: "vertical", lineHeight: 1.65 }}
              placeholder="What would you like to discuss?"
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSend}
            className="btn-primary"
            style={{ width: "fit-content", opacity: canSend ? 1 : 0.55, cursor: canSend ? "pointer" : "not-allowed" }}
          >
            {sending ? "Sending..." : "Send message"}
            {!sending && <ArrowRight size={14} strokeWidth={2} />}
          </button>
        </div>
      )}
    </PublicPageLayout>
  );
}
