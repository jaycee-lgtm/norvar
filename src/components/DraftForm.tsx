"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, FileText, Loader2, SquarePen } from "lucide-react";
import Logo from "@/components/Logo";
import InfoTip from "@/components/InfoTip";
import ModeSelector from "@/components/ModeSelector";
import RedlineModelSelector from "@/components/RedlineModelSelector";
import DraftProgress, {
  handleDraftSSEEvent,
  type DraftActivityStep,
  type DraftPlan,
} from "@/components/DraftProgress";
import { friendlyReviewError } from "@/components/ContractReviewActivity";
import { readSSEStream } from "@/lib/sse";
import { createTypewriterDrain } from "@/lib/typewriter-drain";
import { PETRA_AGENT } from "@/lib/agents";
import {
  DRAFT_QUESTIONS,
  buildDraftScopingIntroText,
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

type DraftMessage =
  | { id: string; role: "user"; content: string }
  | {
      id:              string;
      role:            "thinking";
      text:            string;
      questionId:      string;
      isFollowUp?:     boolean;
      followUpOptions?: string[];
      guidedMulti?:    boolean;
      guidedText?:     boolean;
    };

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const streamCursor = (
  <span style={{
    display: "inline-block", width: 2, height: "1em", background: "var(--fg3)",
    marginLeft: 2, animation: "pulse-dot 1s ease infinite", verticalAlign: "text-bottom",
  }} />
);

export default function DraftForm({
  onDone,
  onCancel,
  variant = "home",
  isMobileView = false,
  onThreadActive,
}: {
  onDone:            () => void;
  onCancel?:         () => void;
  variant?:          "home" | "modal";
  isMobileView?:     boolean;
  onThreadActive?:   (active: boolean) => void;
}) {
  const scrollRef      = useRef<HTMLDivElement>(null);
  const typewriterRef  = useRef<ReturnType<typeof createTypewriterDrain> | null>(null);

  const [messages, setMessages]               = useState<DraftMessage[]>([]);
  const [answers, setAnswers]                 = useState<DraftAnswers>({});
  const [guidedActive, setGuidedActive]     = useState(false);
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [multiSelections, setMultiSelections] = useState<string[]>([]);
  const [guidedTyping, setGuidedTyping]       = useState(false);
  const [input, setInput]                     = useState("");
  const [reviewModel, setReviewModel]         = useState<RedlineReviewModelChoice>(DEFAULT_REDLINE_REVIEW_MODEL);
  const [activitySteps, setActivitySteps]     = useState<DraftActivityStep[]>([]);
  const [draftPlan, setDraftPlan]             = useState<DraftPlan | null>(null);
  const [working, setWorking]                 = useState(false);
  const [error, setError]                     = useState("");

  const isPageHome   = variant === "home";
  const modelLabel   = redlineModelLabel(reviewModel);
  const showActivity = activitySteps.length > 0 || !!draftPlan;
  const isHome       = isPageHome && messages.length === 0 && !showActivity;
  const activeQuestion = activeQuestionId
    ? DRAFT_QUESTIONS.find(q => q.id === activeQuestionId) ?? nextDraftQuestion(answers)
    : nextDraftQuestion(answers);

  useEffect(() => {
    onThreadActive?.(!isHome);
  }, [isHome, onThreadActive]);

  useEffect(() => {
    if (activeQuestion?.type === "multi") setMultiSelections([]);
  }, [activeQuestion?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, guidedTyping, showActivity]);

  const presentDraftQuestion = (question: DraftQuestion, intro?: string) => {
    setActiveQuestionId(question.id);
    if (question.type === "multi") setMultiSelections([]);

    const fullText = [intro, formatDraftQuestionText(question)].filter(Boolean).join("\n\n");
    typewriterRef.current?.reset();
    setGuidedTyping(true);

    setMessages(prev => {
      const filtered = prev.filter(m => !(m.role === "thinking"));
      return [...filtered, {
        id:              newId(),
        role:            "thinking",
        text:            "",
        questionId:      question.id,
        isFollowUp:      question.type !== "text",
        followUpOptions: draftQuestionOptions(question),
        guidedMulti:     question.type === "multi",
        guidedText:      question.type === "text",
      }];
    });

    typewriterRef.current = createTypewriterDrain(ch => {
      setMessages(prev => {
        const next = [...prev];
        const idx  = next.findLastIndex(m =>
          m.role === "thinking" && m.questionId === question.id,
        );
        if (idx >= 0) {
          const msg = next[idx] as Extract<DraftMessage, { role: "thinking" }>;
          next[idx] = { ...msg, text: msg.text + ch };
        }
        return next;
      });
    }, () => setGuidedTyping(false));

    typewriterRef.current.enqueue(fullText);
  };

  const startGuidedDraft = (text: string) => {
    setInput("");
    setError("");
    setGuidedActive(true);
    setAnswers({});
    setMultiSelections([]);
    setActiveQuestionId(null);
    setMessages([{ id: newId(), role: "user", content: text }]);
    presentDraftQuestion(DRAFT_QUESTIONS[0], buildDraftScopingIntroText());
  };

  const startNew = () => {
    typewriterRef.current?.reset();
    setMessages([]);
    setAnswers({});
    setGuidedActive(false);
    setActiveQuestionId(null);
    setMultiSelections([]);
    setGuidedTyping(false);
    setInput("");
    setActivitySteps([]);
    setDraftPlan(null);
    setWorking(false);
    setError("");
  };

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

    setMessages(prev => [
      ...prev.filter(m => !(m.role === "thinking")),
      { id: newId(), role: "user", content: displayLabel },
    ]);

    const nextQ = nextDraftQuestion(nextAnswers);
    if (!nextQ) {
      setGuidedActive(false);
      setActiveQuestionId(null);
      void submitDraft(nextAnswers);
    } else {
      presentDraftQuestion(nextQ);
    }
  };

  const handleOption = (optionLabel: string) => {
    if (!activeQuestion || working || guidedTyping) return;

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
    if (working || guidedTyping) return;

    if (isHome) {
      const text = input.trim();
      if (!text) return;
      startGuidedDraft(text);
      return;
    }

    if (!activeQuestion) return;

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

  const canSendHome = !working && input.trim().length > 0;

  const canSendThread = !working && !guidedTyping && (
    guidedActive && activeQuestion?.type === "text"
      ? activeQuestion.optional || input.trim().length > 0
      : false
  );

  const canSend = isHome ? canSendHome : canSendThread;

  const composerPlaceholder = isHome
    ? ""
    : !activeQuestion
    ? working ? "Drafting your agreement..." : "Draft complete"
    : guidedActive && activeQuestion.type === "text"
    ? activeQuestion.optional
      ? "Add context or press send to skip"
      : activeQuestion.sub ?? "Type your answer..."
    : guidedActive
    ? "Select an option above..."
    : `Draft with ${PETRA_AGENT.name}...`;

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
      aria-label="Send"
    >
      {working ? <Loader2 size={16} className="spin" /> : <ArrowUp size={16} strokeWidth={2.5} />}
    </button>
  );

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const messageList = messages.map((msg, i) => {
    if (msg.role === "user") {
      return (
        <div key={msg.id} className="msg-user fade-up">
          <div>{msg.content}</div>
        </div>
      );
    }

    const isFollowUp = msg.isFollowUp && msg.followUpOptions;
    const isTypingGuided = guidedTyping && i === messages.length - 1;
    const showFollowUpOptions = isFollowUp && msg.followUpOptions && !isTypingGuided;
    const question = DRAFT_QUESTIONS.find(q => q.id === msg.questionId);

    return (
      <div key={msg.id} className="msg-ai fade-up">
        <div className="msg-ai-card">
          <div className="msg-ai-label">
            <FileText size={11} color="var(--fg3)" />
            {PETRA_AGENT.name}
          </div>
          {msg.text ? (
            <p style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.7, letterSpacing: "-0.01em", whiteSpace: "pre-wrap", margin: 0 }}>
              {msg.text}
              {isTypingGuided && streamCursor}
            </p>
          ) : (
            <div style={{ display: "flex", gap: 5, padding: "8px 0" }}>
              <span className="loading-dot" />
              <span className="loading-dot" />
              <span className="loading-dot" />
            </div>
          )}
          {showFollowUpOptions && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {(msg.followUpOptions ?? []).map(opt => {
                const optValue = question?.options?.find(o => o.label === opt)?.value;
                const selected = !!(msg.guidedMulti && optValue && multiSelections.includes(optValue));
                const isContinue = opt === "Continue";
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleOption(opt)}
                    disabled={working}
                    style={{
                      fontSize: 11, padding: "5px 12px", borderRadius: 16,
                      border: selected || isContinue ? "0.5px solid var(--red)" : "0.5px solid var(--bdr2)",
                      background: selected ? "rgba(139,26,26,0.09)" : isContinue ? "var(--lift)" : "var(--card2)",
                      color: selected || isContinue ? "var(--fg)" : "var(--fg2)",
                      cursor: "pointer",
                      fontFamily: "'Sora', sans-serif",
                      fontWeight: isContinue ? 500 : 400,
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  });

  const activityPanel = showActivity && (
    <DraftProgress
      plan={draftPlan}
      steps={activitySteps}
      agentName={modelLabel}
      working={working}
    />
  );

  const homeInputBar = (
    <div
      className={isMobileView ? "home-composer-block" : "input-wrap"}
      style={isMobileView ? undefined : { marginBottom: 24 }}
    >
      {isMobileView ? (
        <div className="mobile-composer">
          <div className="mobile-composer-input-row">
            <textarea
              className="input-textarea mobile-composer-field"
              placeholder={`Ask ${PETRA_AGENT.name}`}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={1}
            />
          </div>
          <div className="mobile-composer-tools mobile-composer-tools--minimal home-composer-tools">
            <div className="composer-toolbar-start">
              <ModeSelector current="draft" embedded menuPlacement="top" />
            </div>
            <div className="home-composer-end">
              {modelSelector}
              {sendButton}
            </div>
          </div>
        </div>
      ) : (
        <div className="input-bar">
          <textarea
            className="input-textarea"
            placeholder={`Ask ${PETRA_AGENT.name}`}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            rows={1}
          />
          <div className="composer-toolbar">
            <div className="composer-toolbar-start" />
            <div className="composer-toolbar-end home-composer-end">
              {modelSelector}
              <ModeSelector current="draft" embedded menuPlacement="top" />
              {sendButton}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const threadInputBar = (
    <div className="chat-input-row">
      <div className="chat-input-inner">
        <div style={{ maxWidth: 720, margin: "0 auto", width: "100%" }}>
          {isMobileView && (
            <div className="mobile-thread-toolbar mobile-only">
              <button type="button" className="mobile-thread-action" onClick={startNew}>
                <SquarePen size={13} strokeWidth={2} />
                New draft
              </button>
            </div>
          )}
          {isMobileView ? (
            <div className="mobile-composer thread-composer">
              <div className="mobile-composer-input-row">
                <input
                  className="chat-input-field mobile-composer-field"
                  placeholder={composerPlaceholder}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKey}
                  disabled={working || guidedTyping || (guidedActive && activeQuestion?.type !== "text")}
                />
              </div>
              <div className="mobile-composer-tools mobile-composer-tools--minimal">
                <ModeSelector current="draft" embedded menuPlacement="top" />
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
                onKeyDown={handleKey}
                disabled={working || guidedTyping || (guidedActive && activeQuestion?.type !== "text")}
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
          )}
        </div>
        {error && (
          <p style={{ marginTop: 10, fontSize: 12, color: "var(--rh)", textAlign: isMobileView ? "center" : undefined }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );

  if (isPageHome && isHome) {
    return (
      <div className={`home-body${isMobileView ? " mobile-home-layout" : ""}`}>
        <div className={isMobileView ? "home-hero-block home-hero-enter" : undefined}>
          {isMobileView ? (
            <>
              <Logo size={40} animated />
              <h1 className="home-hero-serif mobile-home-serif home-hero-serif--enter">
                What can I help draft?
              </h1>
            </>
          ) : (
            <div className="home-hero-row home-hero-enter">
              <Logo variant="hero" className="home-hero-logo" size={46} animated />
              <div className="home-hero-heading-wrap">
                <h1 className="home-hero-serif home-hero-serif--enter">
                  What can I help draft?
                </h1>
                <InfoTip
                  text={`Describe the agreement you need. ${PETRA_AGENT.name} will ask a few scoping questions, then draft a first version aligned to Norvar's regulatory corpus.`}
                />
              </div>
            </div>
          )}
        </div>
        {homeInputBar}
        {error && (
          <p style={{ marginTop: 14, fontSize: 12, color: "var(--rh)", textAlign: isMobileView ? "center" : undefined }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  if (isPageHome) {
    return (
      <>
        <div ref={scrollRef} className="main-scroll">
          <div className="chat-scroll">
            {messageList}
            {activityPanel}
          </div>
        </div>
        {threadInputBar}
      </>
    );
  }

  return (
    <>
      <div ref={scrollRef} className="main-scroll">
        <div className="chat-scroll">
          {messageList}
          {activityPanel}
        </div>
      </div>
      <div className="input-bar">
        <input
          className="contract-review-input"
          placeholder={composerPlaceholder}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          disabled={working || guidedTyping || (guidedActive && activeQuestion?.type !== "text")}
        />
        <div className="composer-toolbar">
          <div className="composer-toolbar-start">
            <span className="contract-review-label">Model</span>
            {modelSelector}
          </div>
          <div className="composer-toolbar-end">{sendButton}</div>
        </div>
      </div>
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
