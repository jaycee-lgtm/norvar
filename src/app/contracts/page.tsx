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
import { useIsMobile } from "@/hooks/useIsMobile";
import type { RedlineOutput } from "@/lib/redline";
import RedlineApplyBar from "@/components/RedlineApplyBar";
import type { AppliedMeta } from "@/lib/redline-apply";
import type { RedlineFollowUps } from "@/lib/redline-followup";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";

type RedlineRecord = {
  id:             string;
  agent:          "cassius" | "nora";
  agreement_type: string;
  governing_law:  string;
  overall_status: RedlineOutput["overall_status"];
  result:         RedlineOutput;
  followups?:     RedlineFollowUps;
  applied_meta?:  AppliedMeta | null;
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

function hasFollowupThreads(followups: RedlineFollowUps) {
  const general = followups.general?.some(m => m.role === "user");
  const clauses = followups.clauses && Object.values(followups.clauses).some(msgs => msgs.some(m => m.role === "user"));
  const positive = followups.positive && Object.values(followups.positive).some(msgs => msgs.some(m => m.role === "user"));
  return !!(general || clauses || positive);
}

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
  const [loading, setLoading]           = useState(true);
  const [reviewDocId, setReviewDocId]   = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [followups, setFollowups]         = useState<RedlineFollowUps>({});
  const [appliedMeta, setAppliedMeta]     = useState<AppliedMeta | null>(null);

  const reviewId   = searchParams.get("id");
  const showReviews = searchParams.get("reviews") === "1";

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
          if (r?.[0]) router.replace(`/contracts?id=${r[0].id}`);
          else router.replace("/contracts");
        })
        .catch(() => router.replace("/contracts"));
    });
    if (searchParams.get("document")) setReviewDocId(null);
  };

  const filtered = records.filter(r =>
    !filterStatus || r.overall_status === filterStatus,
  );

  const activeRecord = reviewId ? records.find(r => r.id === reviewId) : undefined;

  useEffect(() => {
    if (activeRecord) {
      setFollowups((activeRecord.followups && typeof activeRecord.followups === "object")
        ? activeRecord.followups
        : {});
      setAppliedMeta(activeRecord.applied_meta ?? null);
    } else {
      setFollowups({});
      setAppliedMeta(null);
    }
  }, [activeRecord?.id, activeRecord?.followups, activeRecord?.applied_meta]);

  const isHome = !loading && !reviewId && !showReviews;
  const showSplit = !loading && records.length > 0 && (!!reviewId || showReviews);
  const showList = !isMobileView || !reviewId;
  const showDetail = !isMobileView || !!reviewId;

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
                  <h1 className="home-hero-serif mobile-home-serif home-hero-serif--enter">Get a redline in minutes.</h1>
                </>
              ) : (
                <div className="home-hero-row home-hero-enter">
                  <Logo variant="hero" className="home-hero-logo" size={52} animated />
                  <div className="home-hero-heading-wrap">
                    <h1 className="home-hero-serif home-hero-serif--enter">Get a redline in minutes.</h1>
                    <InfoTip text="Pull a contract from Documents, upload a file, or paste text. Nora and Cassius will redline it against Norvar's regulatory corpus." />
                  </div>
                </div>
              )}
            </div>

            <div className={isMobileView ? "home-composer-block" : "input-wrap"} style={isMobileView ? undefined : { marginBottom: 24, width: "100%", maxWidth: 580 }}>
              <ContractReviewForm
                variant="home"
                isMobileView={isMobileView}
                initialDocumentId={reviewDocId}
                onDone={handleDone}
              />
            </div>

            {records.length > 0 && (
              <button
                type="button"
                className="contracts-past-reviews-link"
                onClick={() => router.push("/contracts?reviews=1")}
              >
                Past reviews ({records.length})
              </button>
            )}
          </div>
        )}

        {showSplit && (
          <div className="contracts-split">
            {showList && (
              <aside className="contracts-history-panel">
                <div className="contracts-panel-head">
                  <span>Reviews</span>
                  <button type="button" className="contracts-new-btn" onClick={() => router.replace("/contracts")}>
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

                <div className="contracts-history-scroll">
                  {!loading && filtered.length === 0 && (
                    <div className="contracts-empty-inline">No matches</div>
                  )}
                  {filtered.map(record => (
                    <HistoryRow
                      key={record.id}
                      record={record}
                      active={reviewId === record.id}
                      onClick={() => router.push(`/contracts?id=${record.id}`)}
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
                      <button type="button" className="contracts-back-btn" onClick={() => router.replace("/contracts?reviews=1")}>
                        <ArrowLeft size={14} /> All reviews
                      </button>
                    )}
                    {!isMobileView && (
                      <button type="button" className="contracts-back-btn" onClick={() => router.replace("/contracts")}>
                        <ArrowLeft size={14} /> New review
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
                          const remaining = records.filter(r => r.id !== activeRecord.id);
                          router.replace(remaining.length ? "/contracts?reviews=1" : "/contracts");
                          void load();
                        }}
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                    <RedlineApplyBar
                      redlineId={activeRecord.id}
                      appliedMeta={appliedMeta}
                      hasFollowups={hasFollowupThreads(followups)}
                      onApplied={next => {
                        setAppliedMeta(next);
                        setRecords(prev => prev.map(r =>
                          r.id === activeRecord.id ? { ...r, applied_meta: next } : r,
                        ));
                      }}
                    />
                    <RedlineCard
                      redline={activeRecord.result}
                      redlineId={activeRecord.id}
                      followups={followups}
                      onFollowupsChange={next => {
                        setFollowups(next);
                        setRecords(prev => prev.map(r =>
                          r.id === activeRecord.id ? { ...r, followups: next } : r,
                        ));
                      }}
                    />
                    <AiDisclaimer agentName={activeRecord.agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
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
