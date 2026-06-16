"use client";

import { Suspense, useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Plus, Trash2, ArrowLeft, FileText } from "lucide-react";
import AppShell from "@/components/AppShell";
import DraftCard from "@/components/DraftCard";
import DraftForm from "@/components/DraftForm";
import AiDisclaimer from "@/components/AiDisclaimer";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { DraftOutput } from "@/lib/draft";
import type { DraftFollowUps } from "@/lib/draft-followup";
import { PETRA_AGENT } from "@/lib/agents";

type DraftRecord = {
  id:             string;
  agent:          "cassius" | "nora";
  agreement_type: string;
  governing_law:  string | null;
  result:         DraftOutput;
  followups?:     DraftFollowUps;
  document_id?:   string | null;
  folder_id?:     string | null;
  created_at:     string;
};

function fmt_date(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fmt_time(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function HistoryRow({
  title,
  createdAt,
  active,
  onClick,
}: {
  title:     string;
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
          <span>{PETRA_AGENT.name}</span>
          <span>{fmt_date(createdAt)}</span>
        </div>
      </div>
    </button>
  );
}

function DraftPageInner() {
  const isMobileView     = useIsMobile();
  const searchParams     = useSearchParams();
  const router           = useRouter();
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [draftFollowups, setDraftFollowups] = useState<DraftFollowUps>({});
  const [draftThreadActive, setDraftThreadActive] = useState(false);

  const draftId    = searchParams.get("draft") ?? searchParams.get("id");
  const showDrafts = searchParams.get("drafts") === "1";

  const load = useCallback(async () => {
    setLoading(true);
    const draftsRes = await fetch("/api/drafts");
    const { drafts: draftRows } = await draftsRes.json().catch(() => ({ drafts: [] }));
    setDrafts((draftRows ?? []) as DraftRecord[]);
    setLoading(false);
    window.dispatchEvent(new Event("norvar:drafts-updated"));
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleDraftDone = () => {
    void load().then(() => {
      fetch("/api/drafts?limit=1")
        .then(r => r.json())
        .then(({ drafts: d }: { drafts?: DraftRecord[] }) => {
          if (d?.[0]) router.replace(`/draft?draft=${d[0].id}`);
          else router.replace("/draft");
        })
        .catch(() => router.replace("/draft"));
    });
  };

  const activeDraft = draftId ? drafts.find(r => r.id === draftId) : undefined;

  useEffect(() => {
    if (activeDraft) {
      setDraftFollowups((activeDraft.followups && typeof activeDraft.followups === "object")
        ? activeDraft.followups
        : {});
    } else {
      setDraftFollowups({});
    }
  }, [activeDraft?.id, activeDraft?.followups]);

  const isHome    = !loading && !draftId && !showDrafts;
  const showSplit = !loading && drafts.length > 0 && (draftId || showDrafts);
  const showList  = !isMobileView || !draftId;
  const showDetail = !isMobileView || !!draftId;

  return (
    <AppShell>
      <div className={`main-area contracts-page draft-page${draftThreadActive && isMobileView ? " mobile-thread-layout" : ""}`}>
        {loading && (
          <div className={`home-body${isMobileView ? " mobile-home-layout" : ""}`}>
            <div style={{ display: "flex", gap: 5, justifyContent: "center" }}>
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </div>
          </div>
        )}

        {isHome && (
          <DraftForm
            variant="home"
            isMobileView={isMobileView}
            onDone={handleDraftDone}
            onThreadActive={setDraftThreadActive}
          />
        )}

        {showSplit && (
          <div className="contracts-split">
            {showList && (
              <aside className="contracts-history-panel">
                <div className="contracts-panel-head">
                  <span>Drafts</span>
                  <button
                    type="button"
                    className="contracts-new-btn"
                    onClick={() => router.replace("/draft")}
                  >
                    <Plus size={11} /> New
                  </button>
                </div>

                <div className="contracts-history-scroll">
                  {drafts.map(record => (
                    <HistoryRow
                      key={record.id}
                      title={record.result?.document_name || record.result?.title || record.agreement_type}
                      createdAt={record.created_at}
                      active={draftId === record.id}
                      onClick={() => router.push(`/draft?draft=${record.id}`)}
                    />
                  ))}
                </div>
              </aside>
            )}

            {showDetail && (
              <div className="main-scroll contracts-detail">
                {!activeDraft ? (
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
                        {PETRA_AGENT.name}
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
                          router.replace(remaining.length ? "/draft?drafts=1" : "/draft");
                          void load();
                        }}
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                    <DraftCard
                      draft={activeDraft.result}
                      draftId={activeDraft.id}
                      agent={activeDraft.agent}
                      followups={draftFollowups}
                      onFollowupsChange={next => {
                        setDraftFollowups(next);
                        setDrafts(prev => prev.map(r =>
                          r.id === activeDraft.id ? { ...r, followups: next } : r,
                        ));
                      }}
                      folderId={activeDraft.folder_id}
                      documentId={activeDraft.document_id}
                      onSaved={meta => {
                        setDrafts(prev => prev.map(r =>
                          r.id === activeDraft.id
                            ? { ...r, document_id: meta.document_id, folder_id: meta.folder_id }
                            : r,
                        ));
                      }}
                    />
                    <AiDisclaimer agentName={PETRA_AGENT.name} />
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
