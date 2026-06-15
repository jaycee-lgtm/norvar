"use client";

import { useEffect, useState } from "react";
import { ArrowUp, FileText, Loader2 } from "lucide-react";
import RedlineModelSelector from "@/components/RedlineModelSelector";
import ContractReviewActivity, {
  appendActivityStep,
  completeAllActivity,
  createActivityStep,
  failActiveActivity,
  friendlyReviewError,
  markActiveDone,
  type ReviewActivityStep,
} from "@/components/ContractReviewActivity";
import { readSSEStream } from "@/lib/sse";
import { SCRIBE_AGENT } from "@/lib/agents";
import {
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

type UserTurn = { questionId: string; label: string };

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
  const [answers, setAnswers]               = useState<DraftAnswers>({});
  const [userTurns, setUserTurns]           = useState<UserTurn[]>([]);
  const [multiSelections, setMultiSelections] = useState<string[]>([]);
  const [input, setInput]                   = useState("");
  const [reviewModel, setReviewModel]       = useState<RedlineReviewModelChoice>(DEFAULT_REDLINE_REVIEW_MODEL);
  const [activitySteps, setActivitySteps]   = useState<ReviewActivityStep[]>([]);
  const [working, setWorking]               = useState(false);
  const [error, setError]                   = useState("");

  const isHome        = variant === "home";
  const modelLabel    = redlineModelLabel(reviewModel);
  const activeQuestion = nextDraftQuestion(answers);
  const showActivity  = activitySteps.length > 0;

  useEffect(() => {
    if (activeQuestion?.type === "multi") setMultiSelections([]);
  }, [activeQuestion?.id]);

  const pushStatus = (text: string) => {
    setActivitySteps(prev => appendActivityStep(prev, text));
  };

  const commitAnswer = (question: DraftQuestion, value: string | string[], displayLabel: string) => {
    setUserTurns(prev => [...prev, { questionId: question.id, label: displayLabel }]);
    setInput("");
    setMultiSelections([]);

    const nextAnswers = { ...answers, [question.id]: value };
    setAnswers(nextAnswers);

    const nextQ = nextDraftQuestion(nextAnswers);
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
    setActivitySteps([createActivityStep(`Starting draft with ${modelLabel}...`)]);

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
        if (event.type === "status") pushStatus(event.text ?? "");
        if (event.type === "pulse") {
          setActivitySteps(prev => {
            const active = [...prev].reverse().find(step => step.state === "active");
            if (!active) return appendActivityStep(prev, event.text ?? "");
            return prev.map(step => step.id === active.id ? { ...step, text: event.text ?? step.text } : step);
          });
        }
        if (event.type === "error") throw new Error(event.text ?? "Draft failed");
        if (event.type === "done") {
          setActivitySteps(prev => completeAllActivity(prev, "Opening your draft..."));
          onDone();
        }
      });
    } catch (e) {
      setActivitySteps(prev => failActiveActivity(prev));
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
    ? "Select jurisdictions above, then Continue"
    : "Choose an agreement type above";

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

  const optionChips = activeQuestion && draftQuestionOptions(activeQuestion) && (
    <div className="scribe-option-chips">
      {draftQuestionOptions(activeQuestion)!.map(opt => {
        const optValue = activeQuestion.options?.find(o => o.label === opt)?.value;
        const selected = !!(activeQuestion.type === "multi" && optValue && multiSelections.includes(optValue));
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

  const guidanceCard = activeQuestion && (
    <div className="scribe-guidance-card fade-up">
      <div className="scribe-guidance-label">
        <FileText size={11} color="var(--fg3)" />
        {SCRIBE_AGENT.name}
      </div>
      <p className="scribe-guidance-text">{formatDraftQuestionText(activeQuestion)}</p>
      {optionChips}
    </div>
  );

  const answerHistory = userTurns.length > 0 && (
    <div className="scribe-answer-history">
      {userTurns.map((turn, i) => (
        <div key={`${turn.questionId}-${i}`} className="scribe-answer-bubble">
          {turn.label}
        </div>
      ))}
    </div>
  );

  const activityPanel = showActivity && (
    <ContractReviewActivity
      agentName={modelLabel}
      steps={activitySteps}
      working={working}
    />
  );

  const homeComposer = isMobileView ? (
    <div className="mobile-composer">
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
        {modelSelector}
        <div className="mobile-composer-actions">{sendButton}</div>
      </div>
    </div>
  ) : (
    <div className="input-bar">
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
          {modelSelector}
          {sendButton}
        </div>
      </div>
    </div>
  );

  if (isHome) {
    return (
      <div className="contracts-review-home draft-review-home">
        {answerHistory}
        {guidanceCard}
        {homeComposer}
        {activityPanel}
        {error && <p className="contract-review-error contracts-home-error">{error}</p>}
      </div>
    );
  }

  return (
    <>
      {answerHistory}
      {guidanceCard}
      <div className="contract-review-field">
        <span className="contract-review-label">Model</span>
        {modelSelector}
      </div>
      <div className="contract-review-field">
        <span className="contract-review-label">Your answer</span>
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
