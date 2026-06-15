"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Loader2 } from "lucide-react";
import ModeSelector from "@/components/ModeSelector";
import RedlineModelSelector from "@/components/RedlineModelSelector";
import DraftProgress, {
  handleDraftSSEEvent,
  type DraftActivityStep,
  type DraftPlan,
} from "@/components/DraftProgress";
import { friendlyReviewError } from "@/components/ContractReviewActivity";
import { readSSEStream } from "@/lib/sse";
import { PERTA_AGENT } from "@/lib/agents";
import {
  DRAFT_QUESTIONS,
  compileDraftRequest,
  draftQuestionOptions,
  formatDraftQuestionText,
  labelForDraftAnswer,
  nextDraftQuestion,
  type DraftAnswers,
  type DraftQuestion,
} from "@/lib/draft-questionnaire";
import {
  DEFAULT_REDLINE_REVIEW_MODEL,
  redlineModelLabel,
  type RedlineReviewModelChoice,
} from "@/lib/redline-models";

type ThreadItem =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "scribe"; questionId: string };

const QUESTION_BY_ID = Object.fromEntries(DRAFT_QUESTIONS.map(q => [q.id, q]));

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function DraftForm({
  onDone,
  onCancel,
  variant = "home",
  isMobileView = false,
}: {
  onDone:         () => void;
  onCancel?:      () => void;
  variant?:       "home" | "modal";
  isMobileView?:  boolean;
}) {
  const threadRef = useRef<HTMLDivElement>(null);
  const [thread, setThread] = useState<ThreadItem[]>([
    { id: newId(), role: "scribe", questionId: DRAFT_QUESTIONS[0].id },
  ]);
  const [answers, setAnswers]               = useState<DraftAnswers>({});
  const [multiSelections, setMultiSelections] = useState<string[]>([]);
  const [input, setInput]                   = useState("");
  const [reviewModel, setReviewModel]       = useState<RedlineReviewModelChoice>(DEFAULT_REDLINE_REVIEW_MODEL);
  const [activitySteps, setActivitySteps]   = useState<DraftActivityStep[]>([]);
  const [draftPlan, setDraftPlan]           = useState<DraftPlan | null>(null);
  const [working, setWorking]               = useState(false);
  const [error, setError]                   = useState("");

  const isHome         = variant === "home";
  const modelLabel     = redlineModelLabel(reviewModel);
  const activeQuestion = nextDraftQuestion(answers);
  const showActivity   = activitySteps.length > 0 || !!draftPlan;
  const lastThreadItem = thread[thread.length - 1];
  const activeScribeId = lastThreadItem?.role === "scribe" ? lastThreadItem.id : null;

  useEffect(() => {
    if (activeQuestion?.type === "multi") setMultiSelections([]);
  }, [activeQuestion?.id]);

  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [thread, activeQuestion?.id]);

  const pushStatus = (text: string) => {
    setActivitySteps(prev => {
      const cleared = prev.map(s => s.state === "active" ? { ...s, state: "done" as const } : s);
      return [...cleared, { text, state: "active" as const }];
    });
  };

  const failSteps = (steps: DraftActivityStep[]) =>
    steps.map(s => s.state === "active" ? { ...s, state: "error" as const } : s);

  const commitAnswer = (question: DraftQuestion, value: string | string[], displayLabel: string) => {
    setInput("");
    setMultiSelections([]);

    const nextAnswers = { ...answers, [question.id]: value };
    setAnswers(nextAnswers);

    const nextQ = nextDraftQuestion(nextAnswers);
    setThread(prev => {
      const updated: ThreadItem[] = [...prev, { id: newId(), role: "user", text: displayLabel }];
      if (nextQ) updated.push({ id: newId(), role: "scribe", questionId: nextQ.id });
      return updated;
    });

    if (!nextQ) {
      void submitDraft(nextAnswers);
    }
  };

  const handleOption = (optionLabel: string) => {
    if (!activeQuestion || working) return;

    if (activeQuestion.type === "multi") {
      if (optionLabel === "Continue") {
        const labels = multiSelections.map(v => labelForDraftAnswer(activeQuestion.id, v));
        commitAnswer(activeQuestion, multiSelections, labels.join(", ") || "None selected");
        return;
      }
      const opt = activeQuestion.options?.find(o => o.label === optionLabel);
      if (!opt) return;
      setMultiSelections(prev =>
        prev.includes(opt.value) ? prev.filter(v => v !== opt.value) : [...prev, opt.value],
      );
      return;
    }

    const opt = activeQuestion.options?.find(o => o.label === optionLabel);
    commitAnswer(activeQuestion, opt?.value ?? optionLabel, optionLabel);
  };

  const handleSend = () => {
    if (!activeQuestion || working) return;

    if (activeQuestion.type === "text") {
      const text = input.trim();
      if (activeQuestion.optional && (!text || text.toLowerCase() === "skip")) {
        commitAnswer(activeQuestion, "", "Skipped");
        return;
      }
      if (!text) return;
      commitAnswer(activeQuestion, text, text);
    }
  };

  const submitDraft = async (finalAnswers: DraftAnswers) => {
    const payload = compileDraftRequest(finalAnswers);
    setError("");
    setWorking(true);
    setDraftPlan(null);
    setActivitySteps([]);

    try {
      const res = await fetch("/api/draft", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...payload, review_model: reviewModel }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error((d as { error?: string }).error || "Draft failed");
      }

      await readSSEStream(res, (event) => {
        if (
          event.type === "step"
          || event.type === "plan"
          || event.type === "section_start"
          || event.type === "section_done"
        ) {
          handleDraftSSEEvent(
            event as { type: string; [key: string]: unknown },
            setDraftPlan,
            setActivitySteps,
          );
          return;
        }

        if (event.type === "pulse") return;

        if (event.type === "status") {
          pushStatus(event.text ?? "");
          return;
        }

        if (event.type === "error") {
          setActivitySteps(prev => failSteps(prev));
          throw new Error(event.text ?? "Draft failed");
        }

        if (event.type === "done") {
          setActivitySteps(prev => prev.map(s =>
            s.state === "active" ? { ...s, state: "done" as const } : s,
          ));
          onDone();
        }
      });
    } catch (e) {
      setActivitySteps(prev => failSteps(prev));
      setError(friendlyReviewError(e));
    } finally {
      setWorking(false);
    }
  };

  const canSend = !working && !!activeQuestion && (
    activeQuestion.type === "text"
      ? activeQuestion.optional || input.trim().length > 0
      : false
  );

  const composerPlaceholder = !activeQuestion
    ? "Draft complete"
    : activeQuestion.type === "text"
    ? activeQuestion.optional
      ? "Add context or press send to skip"
      : activeQuestion.sub ?? "Type your answer..."
    : activeQuestion.type === "multi"
    ? "Select jurisdictions in the thread, then Continue"
    : "Choose an agreement type in the thread";

  const modelSelector = (
    <RedlineModelSelector
      value={reviewModel}
      onChange={setReviewModel}
      disabled={working}
      menuPlacement="top"
    />
  );

  const sendButton = (
    <button
      type="button"
      className="send-btn"
      onClick={() => { void handleSend(); }}
      disabled={!canSend}
      aria-label="Send answer"
    >
      {working ? <Loader2 size={16} className="spin" /> : <ArrowUp size={16} strokeWidth={2.5} />}
    </button>
  );

  const renderOptionChips = (question: DraftQuestion, isActive: boolean) => {
    const options = draftQuestionOptions(question);
    if (!options || !isActive) return null;

    return (
      <div className="scribe-option-chips">
        {options.map(opt => {
          const optValue = question.options?.find(o => o.label === opt)?.value;
          const selected = !!(question.type === "multi" && optValue && multiSelections.includes(optValue));
          const isContinue = opt === "Continue";
          return (
            <button
              key={opt}
              type="button"
              onClick={() => handleOption(opt)}
              disabled={working}
              className={`scribe-option-chip${selected ? " active" : ""}${isContinue ? " continue" : ""}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    );
  };

  const threadPanel = (
    <div ref={threadRef} className="scribe-thread">
      {thread.map(item => {
        if (item.role === "user") {
          return (
            <div key={item.id} className="scribe-thread-user">
              {item.text}
            </div>
          );
        }

        const question = QUESTION_BY_ID[item.questionId];
        if (!question) return null;
        const isActive = item.id === activeScribeId;

        return (
          <div key={item.id} className="scribe-thread-scribe">
            <div className="scribe-thread-scribe-label">
              <FileText size={11} color="var(--fg3)" />
              {PERTA_AGENT.name}
            </div>
            <p className="scribe-thread-scribe-text">{formatDraftQuestionText(question)}</p>
            {renderOptionChips(question, isActive)}
          </div>
        );
      })}
    </div>
  );

  const activityPanel = showActivity && (
    <DraftProgress
      plan={draftPlan}
      steps={activitySteps}
      agentName={modelLabel}
      working={working}
    />
  );

  const homeComposer = isMobileView ? (
    <div className="mobile-composer scribe-input-bar">
      {threadPanel}
      <div className="mobile-composer-input-row">
        <input
          className="chat-input-field mobile-composer-field"
          placeholder={composerPlaceholder}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={working || activeQuestion?.type !== "text"}
        />
      </div>
      <div className="mobile-composer-tools mobile-composer-tools--minimal">
        <ModeSelector current="draft" embedded menuPlacement="top" />
        {modelSelector}
        <div className="mobile-composer-actions">{sendButton}</div>
      </div>
    </div>
  ) : (
    <div className="input-bar scribe-input-bar">
      {threadPanel}
      <input
        className="chat-input-field"
        placeholder={composerPlaceholder}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
          }
        }}
        disabled={working || activeQuestion?.type !== "text"}
      />
      <div className="composer-toolbar">
        <div className="composer-toolbar-start" />
        <div className="composer-toolbar-end">
          <ModeSelector current="draft" embedded menuPlacement="top" />
          {modelSelector}
          {sendButton}
        </div>
      </div>
    </div>
  );

  if (isHome) {
    return (
      <div className="contracts-review-home draft-review-home">
        {homeComposer}
        {activityPanel}
        {error && <p className="contract-review-error contracts-home-error">{error}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="input-bar scribe-input-bar scribe-input-bar--modal">
        {threadPanel}
        <input
          className="contract-review-input"
          placeholder={composerPlaceholder}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={working || activeQuestion?.type !== "text"}
        />
        <div className="composer-toolbar">
          <div className="composer-toolbar-start">
            <span className="contract-review-label">Model</span>
            {modelSelector}
          </div>
          <div className="composer-toolbar-end">{sendButton}</div>
        </div>
      </div>
      {activityPanel}
      {error && <p className="contract-review-error">{error}</p>}
      <div className="app-modal-actions">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={working} className="app-modal-btn app-modal-btn--ghost">
            Cancel
          </button>
        )}
      </div>
    </>
  );
}
