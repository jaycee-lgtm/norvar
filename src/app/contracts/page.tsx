"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Shield, AlertTriangle, CheckCircle, XCircle, Plus, Trash2, ArrowLeft,
} from "lucide-react";
import AppShell from "@/components/AppShell";
import Logo from "@/components/Logo";
import InfoTip from "@/components/InfoTip";
import RedlineCard from "@/components/RedlineCard";
import AiDisclaimer from "@/components/AiDisclaimer";
import ContractReviewForm from "@/components/ContractReviewForm";
import ContractReviewModal from "@/components/ContractReviewModal";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { RedlineOutput } from "@/lib/redline";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";

type RedlineRecord = {
  id:             string;
  agent:          "cassius" | "nora";
  agreement_type: string;
  governing_law:  string;
  overall_status: RedlineOutput["overall_status"];
  result:         RedlineOutput;
  document_id:    string | null;
  created_at:     string;
};

function fmt_date(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmt_time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const STATUS_META = {
  do_not_sign:        { label: "Do Not Sign",        color: "var(--rh)",  bg: "var(--rh-bg)",  icon: <XCircle size={11} /> },
  significant_issues: { label: "Significant Issues", color: "var(--rm)",  bg: "var(--rm-bg)",  icon: <AlertTriangle size={11} /> },
  needs_work:         { label: "Needs Work",          color: "var(--rl)",  bg: "var(--rl-bg)",  icon: <AlertTriangle size={11} /> },
  clean:              { label: "Clean",               color: "var(--fg3)", bg: "var(--card2)",  icon: <CheckCircle size={11} /> },
};

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: "do_not_sign", label: "Do Not Sign" },
  { value: "significant_issues", label: "Issues" },
  { value: "needs_work", label: "Needs Work" },
  { value: "clean", label: "Clean" },
] as const;

function HistoryRow({
  record,
  active,
  onClick,
}: {
  record:  RedlineRecord;
  active:  boolean;
  onClick: () => void;
}) {
  const meta = STATUS_META[record.overall_status] ?? STATUS_META.needs_work;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`contracts-history-row${active ? " active" : ""}`}
    >
      <div className="contracts-history-row-main">
        <div className="contracts-history-row-title">{record.agreement_type || "Agreement"}</div>
        <div className="contracts-history-row-meta">
          <span className="contracts-status-pill" style={{ background: meta.bg, color: meta.color }}>
            {meta.icon}{meta.label}
          </span>
          <span>{record.agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name}</span>
          <span>{fmt_date(record.created_at)}</span>
        </div>
      </div>
    </button>
  );
}

function ContractsPageInner() {
  const isMobileView                  = useIsMobile();
  const searchParams                  = useSearchParams();
  const router                        = useRouter();
  const [records, setRecords]         = useState<RedlineRecord[]>([]);
  const [activeId, setActiveId]       = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDocId, setReviewDocId]   = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAgent, setFilterAgent]   = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const recsRes = await fetch("/api/redlines");
    const { redlines } = await recsRes.json().catch(() => ({ redlines: [] }));
    setRecords((redlines ?? []) as RedlineRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const documentId = searchParams.get("document");
    if (documentId) setReviewDocId(documentId);
  }, [searchParams]);

  const handleDone = () => {
    void load().then(() => {
      fetch("/api/redlines?limit=1")
        .then(r => r.json())
        .then(({ redlines: r }: { redlines?: RedlineRecord[] }) => {
          if (r?.[0]) setActiveId(r[0].id);
        })
        .catch(() => {});
    });
    if (searchParams.get("document")) {
      router.replace("/contracts");
      setReviewDocId(null);
    }
  };

  const filtered = records.filter(r =>
    (!filterStatus || r.overall_status === filterStatus) &&
    (!filterAgent || r.agent === filterAgent),
  );

  const activeRecord = records.find(r => r.id === activeId);
  const isHome = !loading && records.length === 0 && !activeRecord;
  const showSplit = !isHome;
  const showList = !isMobileView || !activeId;
  const showDetail = !isMobileView || !!activeId;

  return (
    <AppShell>
      <div className="main-area contracts-page">
        {loading && (
          <div className="home-body">
            <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </div>
          </div>
        )}

        {isHome && (
          <div className={`home-body${isMobileView ? " mobile-home-layout" : ""}`}>
            <div className={isMobileView ? "home-hero-block home-hero-enter" : undefined}>
              {isMobileView ? (
                <>
                  <Logo size={44} animated />
                  <h1 className="home-hero-serif mobile-home-serif home-hero-serif--enter">Review an agreement?</h1>
                </>
              ) : (
                <div className="home-hero-row home-hero-enter">
                  <Logo variant="hero" className="home-hero-logo" size={52} animated />
                  <div className="home-hero-heading-wrap">
                    <h1 className="home-hero-serif home-hero-serif--enter">Review an agreement?</h1>
                    <InfoTip text="Pull a contract from Documents, upload a file, or paste text. Nora and Cassius will redline it against Norvar's regulatory corpus." />
                  </div>
                </div>
              )}
            </div>

            <div className={isMobileView ? "home-composer-block" : "input-wrap"} style={isMobileView ? undefined : { marginBottom: 24, width: "100%", maxWidth: 580 }}>
              <ContractReviewForm
                variant="home"
                initialDocumentId={reviewDocId}
                onDone={handleDone}
              />
            </div>
          </div>
        )}

        {showSplit && (
          <div className="contracts-split">
            {showList && (
              <aside className="contracts-history-panel">
                <div className="contracts-panel-head">
                  <span>Reviews</span>
                  <button type="button" className="contracts-new-btn" onClick={() => setShowReviewModal(true)}>
                    <Plus size={11} /> New
                  </button>
                </div>

                <div className="contracts-filter-row">
                  {STATUS_FILTERS.map(({ value, label }) => (
                    <button
                      key={value || "all"}
                      type="button"
                      onClick={() => setFilterStatus(value)}
                      className={`contracts-filter-pill${filterStatus === value ? " active" : ""}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="contracts-agent-row">
                  {(["nora", "cassius"] as const).map(a => (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setFilterAgent(filterAgent === a ? "" : a)}
                      className={`contracts-filter-pill${filterAgent === a ? " active" : ""}`}
                    >
                      {a === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name}
                    </button>
                  ))}
                </div>

                <div className="contracts-history-scroll">
                  {!loading && filtered.length === 0 && (
                    <div className="contracts-empty-inline">No matches</div>
                  )}
                  {filtered.map(record => (
                    <HistoryRow
                      key={record.id}
                      record={record}
                      active={activeId === record.id}
                      onClick={() => setActiveId(record.id)}
                    />
                  ))}
                </div>
              </aside>
            )}

            {showDetail && (
              <div className="main-scroll contracts-detail">
                {!activeRecord ? (
                  <div className="contracts-detail-empty">
                    <Shield size={32} color="var(--fg4)" />
                    <p>Select a review from the list</p>
                  </div>
                ) : (
                  <div className="contracts-detail-inner">
                    {isMobileView && (
                      <button type="button" className="contracts-back-btn" onClick={() => setActiveId(null)}>
                        <ArrowLeft size={14} /> All reviews
                      </button>
                    )}
                    <div className="contracts-detail-head">
                      <p>
                        {activeRecord.agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name}
                        {" · "}{fmt_date(activeRecord.created_at)} at {fmt_time(activeRecord.created_at)}
                      </p>
                      <button
                        type="button"
                        className="contracts-delete-btn"
                        onClick={async () => {
                          if (!confirm("Delete this review?")) return;
                          await fetch("/api/redlines", {
                            method: "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: activeRecord.id }),
                          });
                          setActiveId(null);
                          void load();
                        }}
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                    <RedlineCard redline={activeRecord.result} />
                    <AiDisclaimer agentName={activeRecord.agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {showReviewModal && (
        <ContractReviewModal
          initialDocumentId={null}
          onClose={() => setShowReviewModal(false)}
          onDone={handleDone}
        />
      )}
    </AppShell>
  );
}

export default function ContractsPage() {
  return (
    <Suspense>
      <ContractsPageInner />
    </Suspense>
  );
}
