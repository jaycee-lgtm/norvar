"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Shield, Plus, Trash2, ArrowLeft, FileText } from "lucide-react";
import AppShell from "@/components/AppShell";
import Logo from "@/components/Logo";
import InfoTip from "@/components/InfoTip";
import RedlineCard from "@/components/RedlineCard";
import DraftCard from "@/components/DraftCard";
import DraftForm from "@/components/DraftForm";
import AiDisclaimer from "@/components/AiDisclaimer";
import ContractReviewForm from "@/components/ContractReviewForm";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { RedlineOutput } from "@/lib/redline";
import type { DraftOutput } from "@/lib/draft";
import RedlineApplyBar from "@/components/RedlineApplyBar";
import type { AppliedMeta } from "@/lib/redline-apply";
import { defaultDecisions, type ChangeDecisions } from "@/lib/redline-inline";
import type { RedlineFollowUps } from "@/lib/redline-followup";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";

type ContractsTab = "review" | "draft";

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

type DraftRecord = {
  id:             string;
  agent:          "cassius" | "nora";
  agreement_type: string;
  governing_law:  string | null;
  result:         DraftOutput;
  created_at:     string;
};

function fmt_date(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmt_time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function hasFollowupThreads(followups: RedlineFollowUps) {
  const general = followups.general?.some(m => m.role === "user");
  const clauses = followups.clauses && Object.values(followups.clauses).some(msgs => msgs.some(m => m.role === "user"));
  const positive = followups.positive && Object.values(followups.positive).some(msgs => msgs.some(m => m.role === "user"));
  return !!(general || clauses || positive);
}

function HistoryRow({
  title,
  agent,
  createdAt,
  active,
  onClick,
}: {
  title:     string;
  agent:     "cassius" | "nora";
  createdAt: string;
  active:    boolean;
  onClick:   () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`contracts-history-row${active ? " active" : ""}`}
    >
      <div className="contracts-history-row-main">
        <div className="contracts-history-row-title">{title || "Agreement"}</div>
        <div className="contracts-history-row-meta">
          <span>{agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name}</span>
          <span>{fmt_date(createdAt)}</span>
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
  const [drafts, setDrafts]           = useState<DraftRecord[]>([]);
  const [loading, setLoading]         = useState(true);
  const [reviewDocId, setReviewDocId] = useState<string | null>(null);
  const [followups, setFollowups]       = useState<RedlineFollowUps>({});
  const [appliedMeta, setAppliedMeta] = useState<AppliedMeta | null>(null);
  const [sourceText, setSourceText]   = useState<string | null>(null);
  const [changeDecisions, setChangeDecisions] = useState<ChangeDecisions>({});
  const decisionsSaveRef              = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reviewId    = searchParams.get("id");
  const draftId     = searchParams.get("draft");
  const showReviews = searchParams.get("reviews") === "1";
  const showDrafts  = searchParams.get("drafts") === "1";
  const tabParam    = searchParams.get("tab");

  const activeTab: ContractsTab = draftId || showDrafts || tabParam === "draft"
    ? "draft"
    : "review";

  const load = useCallback(async () => {
    setLoading(true);
    const [recsRes, draftsRes] = await Promise.all([
      fetch("/api/redlines"),
      fetch("/api/drafts"),
    ]);
    const { redlines } = await recsRes.json().catch(() => ({ redlines: [] }));
    const { drafts: draftRows } = await draftsRes.json().catch(() => ({ drafts: [] }));
    setRecords((redlines ?? []) as RedlineRecord[]);
    setDrafts((draftRows ?? []) as DraftRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const documentId = searchParams.get("document");
    if (documentId) setReviewDocId(documentId);
  }, [searchParams]);

  const setTab = (tab: ContractsTab) => {
    if (tab === "draft") router.replace("/contracts?tab=draft");
    else router.replace("/contracts");
  };

  const handleReviewDone = () => {
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

  const handleDraftDone = () => {
    void load().then(() => {
      fetch("/api/drafts?limit=1")
        .then(r => r.json())
        .then(({ drafts: d }: { drafts?: DraftRecord[] }) => {
          if (d?.[0]) router.replace(`/contracts?tab=draft&draft=${d[0].id}`);
          else router.replace("/contracts?tab=draft");
        })
        .catch(() => router.replace("/contracts?tab=draft"));
    });
  };

  const activeReview = reviewId ? records.find(r => r.id === reviewId) : undefined;
  const activeDraft  = draftId ? drafts.find(r => r.id === draftId) : undefined;

  useEffect(() => {
    if (activeReview) {
      setFollowups((activeReview.followups && typeof activeReview.followups === "object")
        ? activeReview.followups
        : {});
      setAppliedMeta(activeReview.applied_meta ?? null);
    } else {
      setFollowups({});
      setAppliedMeta(null);
      setSourceText(null);
      setChangeDecisions({});
    }
  }, [activeReview?.id, activeReview?.followups, activeReview?.applied_meta]);

  useEffect(() => {
    if (!reviewId) {
      setSourceText(null);
      setChangeDecisions({});
      return;
    }

    let cancelled = false;
    void fetch(`/api/redlines?id=${reviewId}&include_source=1`)
      .then(r => r.json())
      .then(({ redline }: { redline?: RedlineRecord & { source_text?: string | null; change_decisions?: ChangeDecisions } }) => {
        if (cancelled || !redline) return;
        setSourceText(redline.source_text ?? null);
        setChangeDecisions(
          redline.change_decisions && typeof redline.change_decisions === "object"
            ? redline.change_decisions
            : defaultDecisions(redline.result),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setSourceText(null);
          setChangeDecisions({});
        }
      });

    return () => { cancelled = true; };
  }, [reviewId]);

  const handleDecisionsChange = useCallback((next: ChangeDecisions) => {
    setChangeDecisions(next);
    if (!reviewId) return;
    if (decisionsSaveRef.current) clearTimeout(decisionsSaveRef.current);
    decisionsSaveRef.current = setTimeout(() => {
      void fetch("/api/redline/decisions", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ redline_id: reviewId, decisions: next }),
      });
    }, 600);
  }, [reviewId]);

  const isHome = !loading && !reviewId && !draftId && !showReviews && !showDrafts;
  const showSplit = !loading && (
    (activeTab === "review" && records.length > 0 && (reviewId || showReviews))
    || (activeTab === "draft" && drafts.length > 0 && (draftId || showDrafts))
  );
  const activeItemId = activeTab === "draft" ? draftId : reviewId;
  const showList = !isMobileView || !activeItemId;
  const showDetail = !isMobileView || !!activeItemId;

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
                  <h1 className="home-hero-serif mobile-home-serif home-hero-serif--enter">
                    {activeTab === "draft" ? "Draft with Scribe." : "Get a redline in minutes."}
                  </h1>
                </>
              ) : (
                <div className="home-hero-row home-hero-enter">
                  <Logo variant="hero" className="home-hero-logo" size={52} animated />
                  <div className="home-hero-heading-wrap">
                    <h1 className="home-hero-serif home-hero-serif--enter">
                      {activeTab === "draft" ? "Draft with Scribe." : "Get a redline in minutes."}
                    </h1>
                    <InfoTip
                      text={activeTab === "draft"
                        ? "Answer a few questions about the agreement you need. Scribe will draft a complete first version aligned to Norvar's regulatory corpus."
                        : "Pull a contract from Documents, upload a file, or paste text. Nora and Cassius will redline it against Norvar's regulatory corpus."}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="contracts-home-tabs-wrap">
              <div className="contract-review-mode-row contracts-home-tabs">
                <button
                  type="button"
                  className={`contract-review-mode${activeTab === "review" ? " active" : ""}`}
                  onClick={() => setTab("review")}
                >
                  Review
                </button>
                <button
                  type="button"
                  className={`contract-review-mode${activeTab === "draft" ? " active" : ""}`}
                  onClick={() => setTab("draft")}
                >
                  Draft
                </button>
              </div>
            </div>

            <div
              className={isMobileView ? "home-composer-block" : "input-wrap"}
              style={isMobileView ? undefined : { marginBottom: 24, width: "100%", maxWidth: 580 }}
            >
              {activeTab === "draft" ? (
                <DraftForm variant="home" isMobileView={isMobileView} onDone={handleDraftDone} />
              ) : (
                <ContractReviewForm
                  variant="home"
                  isMobileView={isMobileView}
                  initialDocumentId={reviewDocId}
                  onDone={handleReviewDone}
                />
              )}
            </div>

            <div className="contracts-past-links">
              {records.length > 0 && (
                <button
                  type="button"
                  className="contracts-past-reviews-link"
                  onClick={() => router.push("/contracts?reviews=1")}
                >
                  Past reviews ({records.length})
                </button>
              )}
              {drafts.length > 0 && (
                <button
                  type="button"
                  className="contracts-past-reviews-link"
                  onClick={() => router.push("/contracts?tab=draft&drafts=1")}
                >
                  Past drafts ({drafts.length})
                </button>
              )}
            </div>
          </div>
        )}

        {showSplit && (
          <div className="contracts-split">
            {showList && (
              <aside className="contracts-history-panel">
                <div className="contracts-panel-head">
                  <span>{activeTab === "draft" ? "Drafts" : "Reviews"}</span>
                  <button
                    type="button"
                    className="contracts-new-btn"
                    onClick={() => router.replace(activeTab === "draft" ? "/contracts?tab=draft" : "/contracts")}
                  >
                    <Plus size={11} /> New
                  </button>
                </div>

                <div className="contracts-history-scroll">
                  {activeTab === "draft" ? (
                    drafts.map(record => (
                      <HistoryRow
                        key={record.id}
                        title={record.agreement_type}
                        agent={record.agent}
                        createdAt={record.created_at}
                        active={draftId === record.id}
                        onClick={() => router.push(`/contracts?tab=draft&draft=${record.id}`)}
                      />
                    ))
                  ) : (
                    <>
                      {!loading && records.length === 0 && (
                        <div className="contracts-empty-inline">No reviews yet</div>
                      )}
                      {records.map(record => (
                        <HistoryRow
                          key={record.id}
                          title={record.agreement_type}
                          agent={record.agent}
                          createdAt={record.created_at}
                          active={reviewId === record.id}
                          onClick={() => router.push(`/contracts?id=${record.id}`)}
                        />
                      ))}
                    </>
                  )}
                </div>
              </aside>
            )}

            {showDetail && (
              <div className="main-scroll contracts-detail">
                {activeTab === "draft" ? (
                  !activeDraft ? (
                    <div className="contracts-detail-empty">
                      <FileText size={32} color="var(--fg4)" />
                      <p>Select a draft from the list</p>
                    </div>
                  ) : (
                    <div className="contracts-detail-inner">
                      {isMobileView && (
                        <button type="button" className="contracts-back-btn" onClick={() => router.replace("/contracts?tab=draft&drafts=1")}>
                          <ArrowLeft size={14} /> All drafts
                        </button>
                      )}
                      {!isMobileView && (
                        <button type="button" className="contracts-back-btn" onClick={() => router.replace("/contracts?tab=draft")}>
                          <ArrowLeft size={14} /> New draft
                        </button>
                      )}
                      <div className="contracts-detail-head">
                        <p>
                          {activeDraft.agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name}
                          {" · "}{fmt_date(activeDraft.created_at)} at {fmt_time(activeDraft.created_at)}
                        </p>
                        <button
                          type="button"
                          className="contracts-delete-btn"
                          onClick={async () => {
                            if (!confirm("Delete this draft?")) return;
                            await fetch("/api/drafts", {
                              method:  "DELETE",
                              headers: { "Content-Type": "application/json" },
                              body:    JSON.stringify({ id: activeDraft.id }),
                            });
                            const remaining = drafts.filter(r => r.id !== activeDraft.id);
                            router.replace(remaining.length ? "/contracts?tab=draft&drafts=1" : "/contracts?tab=draft");
                            void load();
                          }}
                        >
                          <Trash2 size={11} /> Delete
                        </button>
                      </div>
                      <DraftCard draft={activeDraft.result} draftId={activeDraft.id} />
                      <AiDisclaimer agentName={activeDraft.agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name} />
                    </div>
                  )
                ) : !activeReview ? (
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
                        {activeReview.agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name}
                        {" · "}{fmt_date(activeReview.created_at)} at {fmt_time(activeReview.created_at)}
                      </p>
                      <button
                        type="button"
                        className="contracts-delete-btn"
                        onClick={async () => {
                          if (!confirm("Delete this review?")) return;
                          await fetch("/api/redlines", {
                            method:  "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body:    JSON.stringify({ id: activeReview.id }),
                          });
                          const remaining = records.filter(r => r.id !== activeReview.id);
                          router.replace(remaining.length ? "/contracts?reviews=1" : "/contracts");
                          void load();
                        }}
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                    <RedlineApplyBar
                      redlineId={activeReview.id}
                      appliedMeta={appliedMeta}
                      hasFollowups={hasFollowupThreads(followups)}
                      decisions={changeDecisions}
                      hasInlineDocument={!!sourceText}
                      onApplied={next => {
                        setAppliedMeta(next);
                        setRecords(prev => prev.map(r =>
                          r.id === activeReview.id ? { ...r, applied_meta: next } : r,
                        ));
                      }}
                    />
                    <RedlineCard
                      redline={activeReview.result}
                      redlineId={activeReview.id}
                      sourceText={sourceText}
                      decisions={changeDecisions}
                      onDecisionsChange={handleDecisionsChange}
                      followups={followups}
                      onFollowupsChange={next => {
                        setFollowups(next);
                        setRecords(prev => prev.map(r =>
                          r.id === activeReview.id ? { ...r, followups: next } : r,
                        ));
                      }}
                    />
                    <AiDisclaimer agentName={activeReview.agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name} />
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
