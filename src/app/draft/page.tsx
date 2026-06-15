"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { FileText, Plus, Trash2, ArrowLeft } from "lucide-react";
import AppShell from "@/components/AppShell";
import Logo from "@/components/Logo";
import InfoTip from "@/components/InfoTip";
import DraftForm from "@/components/DraftForm";
import DraftCard from "@/components/DraftCard";
import AiDisclaimer from "@/components/AiDisclaimer";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { DraftOutput } from "@/lib/draft";
import { ASSESS_AGENT, CHAT_AGENT } from "@/lib/agents";

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

function HistoryRow({
  record,
  active,
  onClick,
}: {
  record:  DraftRecord;
  active:  boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`contracts-history-row${active ? " active" : ""}`}
    >
      <div className="contracts-history-row-main">
        <div className="contracts-history-row-title">{record.agreement_type || "Agreement"}</div>
        <div className="contracts-history-row-meta">
          <span>{record.agent === "nora" ? CHAT_AGENT.name : ASSESS_AGENT.name}</span>
          <span>{fmt_date(record.created_at)}</span>
        </div>
      </div>
    </button>
  );
}

function DraftPageInner() {
  const isMobileView        = useIsMobile();
  const searchParams        = useSearchParams();
  const router              = useRouter();
  const [records, setRecords] = useState<DraftRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const draftId    = searchParams.get("id");
  const showDrafts = searchParams.get("drafts") === "1";

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/drafts");
    const { drafts } = await res.json().catch(() => ({ drafts: [] }));
    setRecords((drafts ?? []) as DraftRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDone = () => {
    void load().then(() => {
      fetch("/api/drafts?limit=1")
        .then(r => r.json())
        .then(({ drafts: d }: { drafts?: DraftRecord[] }) => {
          if (d?.[0]) router.replace(`/draft?id=${d[0].id}`);
          else router.replace("/draft");
        })
        .catch(() => router.replace("/draft"));
    });
  };

  const activeRecord = draftId ? records.find(r => r.id === draftId) : undefined;
  const isHome = !loading && !draftId && !showDrafts;
  const showSplit = !loading && records.length > 0 && (!!draftId || showDrafts);
  const showList = !isMobileView || !draftId;
  const showDetail = !isMobileView || !!draftId;

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
                  <h1 className="home-hero-serif mobile-home-serif home-hero-serif--enter">Draft an agreement in minutes.</h1>
                </>
              ) : (
                <div className="home-hero-row home-hero-enter">
                  <Logo variant="hero" className="home-hero-logo" size={52} animated />
                  <div className="home-hero-heading-wrap">
                    <h1 className="home-hero-serif home-hero-serif--enter">Draft an agreement in minutes.</h1>
                    <InfoTip text="Choose an agreement type, parties, and jurisdictions. Cassius or Nora will draft a complete first version aligned to Norvar's regulatory corpus." />
                  </div>
                </div>
              )}
            </div>

            <div
              className={isMobileView ? "home-composer-block" : "input-wrap"}
              style={isMobileView ? undefined : { marginBottom: 24, width: "100%", maxWidth: 580 }}
            >
              <DraftForm variant="home" onDone={handleDone} />
            </div>

            {records.length > 0 && (
              <button
                type="button"
                className="contracts-past-reviews-link"
                onClick={() => router.push("/draft?drafts=1")}
              >
                Past drafts ({records.length})
              </button>
            )}
          </div>
        )}

        {showSplit && (
          <div className="contracts-split">
            {showList && (
              <aside className="contracts-history-panel">
                <div className="contracts-panel-head">
                  <span>Drafts</span>
                  <button type="button" className="contracts-new-btn" onClick={() => router.replace("/draft")}>
                    <Plus size={11} /> New
                  </button>
                </div>

                <div className="contracts-history-scroll">
                  {records.map(record => (
                    <HistoryRow
                      key={record.id}
                      record={record}
                      active={draftId === record.id}
                      onClick={() => router.push(`/draft?id=${record.id}`)}
                    />
                  ))}
                </div>
              </aside>
            )}

            {showDetail && (
              <div className="main-scroll contracts-detail">
                {!activeRecord ? (
                  <div className="contracts-detail-empty">
                    <FileText size={32} color="var(--fg4)" />
                    <p>Select a draft from the list</p>
                  </div>
                ) : (
                  <div className="contracts-detail-inner">
                    {isMobileView && (
                      <button type="button" className="contracts-back-btn" onClick={() => router.replace("/draft?drafts=1")}>
                        <ArrowLeft size={14} /> All drafts
                      </button>
                    )}
                    {!isMobileView && (
                      <button type="button" className="contracts-back-btn" onClick={() => router.replace("/draft")}>
                        <ArrowLeft size={14} /> New draft
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
                          if (!confirm("Delete this draft?")) return;
                          await fetch("/api/drafts", {
                            method:  "DELETE",
                            headers: { "Content-Type": "application/json" },
                            body:    JSON.stringify({ id: activeRecord.id }),
                          });
                          const remaining = records.filter(r => r.id !== activeRecord.id);
                          router.replace(remaining.length ? "/draft?drafts=1" : "/draft");
                          void load();
                        }}
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                    <DraftCard draft={activeRecord.result} draftId={activeRecord.id} />
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

export default function DraftPage() {
  return (
    <Suspense>
      <DraftPageInner />
    </Suspense>
  );
}
