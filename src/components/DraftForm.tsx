"use client";

import { useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { readSSEStream } from "@/lib/sse";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";
import { DRAFT_AGREEMENT_TYPES } from "@/lib/draft";

const JURISDICTION_OPTIONS = [
  "EU", "UK", "US Federal", "US State (California)", "US State (New York)",
  "Canada", "Australia", "Singapore", "UAE", "Brazil", "India", "Global",
];

export default function DraftForm({
  onDone,
  onCancel,
  variant = "home",
}: {
  onDone:    () => void;
  onCancel?: () => void;
  variant?:  "home" | "modal";
}) {
  const [agreementType, setAgreementType] = useState("");
  const [providerName, setProviderName]   = useState("");
  const [customerName, setCustomerName]   = useState("");
  const [jurisdictions, setJurisdictions] = useState<string[]>([]);
  const [context, setContext]             = useState("");
  const [agent, setAgent]                 = useState<"cassius" | "nora">("cassius");
  const [working, setWorking]             = useState(false);
  const [statusText, setStatusText]       = useState("");
  const [error, setError]                 = useState("");

  const selectedType = DRAFT_AGREEMENT_TYPES.find(t => t.value === agreementType);
  const isHome = variant === "home";

  const toggleJurisdiction = (j: string) =>
    setJurisdictions(prev => prev.includes(j) ? prev.filter(x => x !== j) : [...prev, j]);

  const submit = async () => {
    if (!agreementType) { setError("Please select an agreement type"); return; }
    setError("");
    setWorking(true);
    setStatusText("Starting draft...");

    try {
      const res = await fetch("/api/draft", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agreement_type:       agreementType,
          agreement_type_label: selectedType?.label,
          provider_name:        providerName.trim() || "[Provider Name]",
          customer_name:        customerName.trim() || "[Customer Name]",
          jurisdictions,
          context:              context.trim(),
          agent,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Draft failed");
      }

      await readSSEStream(res, (event) => {
        if (event.type === "status") setStatusText(event.text ?? "");
        if (event.type === "error")  throw new Error(event.text ?? "Draft failed");
        if (event.type === "done")   onDone();
      });

    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setWorking(false);
      setStatusText("");
    }
  };

  const fields = (
    <>
      <div className="contract-review-field">
        <span className="contract-review-label">Drafted by</span>
        <div className="contract-review-agent-row">
          {([["cassius", ASSESS_AGENT.name], ["nora", CHAT_AGENT.name]] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setAgent(key)}
              className={`contract-review-agent${agent === key ? " active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="contract-review-hint">
          {agent === "cassius"
            ? "Cassius drafts with strict regulatory precision — best for formal agreements"
            : "Nora drafts in plain, practical language — best for a quick first pass"}
        </p>
      </div>

      <div className="contract-review-field">
        <span className="contract-review-label">Agreement type</span>
        <div className="contract-review-select-wrap">
          <select
            value={agreementType}
            onChange={e => setAgreementType(e.target.value)}
            className={`contract-review-select${agreementType ? " filled" : ""}`}
            disabled={working}
          >
            <option value="">Select agreement type...</option>
            {DRAFT_AGREEMENT_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <ChevronDown size={13} color="var(--fg3)" className="contract-review-select-chevron" aria-hidden />
        </div>
      </div>

      <div className="contract-review-grid">
        <div className="contract-review-field">
          <span className="contract-review-label">Provider / Service company</span>
          <input
            value={providerName}
            onChange={e => setProviderName(e.target.value)}
            placeholder="e.g. Norvar Inc."
            className="contract-review-input"
            disabled={working}
          />
        </div>
        <div className="contract-review-field">
          <span className="contract-review-label">Customer / Client</span>
          <input
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            placeholder="e.g. Acme Corp."
            className="contract-review-input"
            disabled={working}
          />
        </div>
      </div>

      <div className="contract-review-field">
        <span className="contract-review-label">Jurisdictions</span>
        <div className="input-chips" style={{ marginTop: 0, justifyContent: "flex-start" }}>
          {JURISDICTION_OPTIONS.map(j => (
            <button
              key={j}
              type="button"
              onClick={() => toggleJurisdiction(j)}
              className={`chip${jurisdictions.includes(j) ? " active" : ""}`}
              disabled={working}
            >
              {j}
            </button>
          ))}
        </div>
      </div>

      <div className="contract-review-field">
        <span className="contract-review-label">Additional context (optional)</span>
        <textarea
          value={context}
          onChange={e => setContext(e.target.value)}
          placeholder="e.g. SaaS platform processing EU health data, BAA for a HIPAA-covered entity, AI model used for automated hiring decisions..."
          className="contract-review-textarea"
          disabled={working}
          rows={3}
        />
      </div>

      {error && <p className="contract-review-error">{error}</p>}

      {working && statusText && (
        <div className="contract-review-status">
          <Loader2 size={13} className="spin" />
          {statusText}
        </div>
      )}
    </>
  );

  if (isHome) {
    return (
      <div className="contracts-review-home draft-review-home">
        <div className="input-bar draft-input-panel">
          {fields}
          <div className="draft-home-actions">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={working || !agreementType}
              className="app-modal-btn app-modal-btn--primary draft-home-submit"
            >
              {working ? "Drafting..." : "Draft agreement"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {fields}
      <div className="app-modal-actions">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={working} className="app-modal-btn app-modal-btn--ghost">
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={() => void submit()}
          disabled={working || !agreementType}
          className="app-modal-btn app-modal-btn--primary"
        >
          {working ? "Drafting..." : "Draft agreement"}
        </button>
      </div>
    </>
  );
}
