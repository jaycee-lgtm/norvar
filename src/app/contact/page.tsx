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
  const [error,   setError]   = useState("");

  const canSend = name.trim().length > 0
    && email.trim().length > 0
    && message.trim().length >= 10
    && !sending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSend) return;

    setSending(true);
    setError("");

    try {
      const res = await fetch("/api/contact", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          name:    name.trim(),
          email:   email.trim(),
          message: message.trim(),
        }),
      });

      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Could not send your message.");
      }

      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your message.");
    } finally {
      setSending(false);
    }
  };

  return (
    <PublicPageLayout>
      <div className="public-document-intro">
        <p className="public-page-kicker">Get in touch</p>
        <h1 className="public-page-title">Contact</h1>
        <p className="public-page-meta">
          Questions about Norvar, early access, partnerships, or anything else. We read every message.
        </p>
      </div>

      {sent ? (
        <div className="public-contact-success">
          <Check size={18} strokeWidth={2.5} color="var(--rl)" style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <p style={{ fontWeight: 500, color: "var(--fg)", marginBottom: 6 }}>Message sent</p>
            <p>Thanks for reaching out. We will reply to {email.trim()} shortly.</p>
          </div>
        </div>
      ) : (
        <form className="public-contact-form" onSubmit={handleSubmit} noValidate>
          <div className="public-contact-field">
            <label className="public-contact-label" htmlFor="contact-name">Name</label>
            <input
              id="contact-name"
              className="public-field"
              placeholder="Your name"
              value={name}
              onChange={e => setName(e.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div className="public-contact-field">
            <label className="public-contact-label" htmlFor="contact-email">Email</label>
            <input
              id="contact-email"
              className="public-field"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </div>
          <div className="public-contact-field">
            <label className="public-contact-label" htmlFor="contact-message">Message</label>
            <textarea
              id="contact-message"
              className="public-field"
              style={{ minHeight: 140, resize: "vertical", lineHeight: 1.65 }}
              placeholder="What would you like to discuss?"
              value={message}
              onChange={e => setMessage(e.target.value)}
              required
            />
          </div>
          {error && <p className="public-contact-error">{error}</p>}
          <button
            type="submit"
            disabled={!canSend}
            className="btn-primary"
            style={{ width: "fit-content", opacity: canSend ? 1 : 0.55, cursor: canSend ? "pointer" : "not-allowed" }}
          >
            {sending ? "Sending..." : "Send message"}
            {!sending && <ArrowRight size={14} strokeWidth={2} />}
          </button>
        </form>
      )}

      <p className="public-contact-note">
        Prefer email? Write to{" "}
        <a href="mailto:hello@norvar.io">hello@norvar.io</a>.
      </p>
    </PublicPageLayout>
  );
}
