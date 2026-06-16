"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fallbackSampleQuestions,
  type SampleQuestionsContext,
} from "@/lib/sample-questions";
import type { SampleQuestionsPayload } from "@/lib/sample-questions-generate";

const REFRESH_MS = 60_000;

type UseSampleQuestionsOptions = {
  enabled?: boolean;
  payload?: SampleQuestionsPayload;
  refreshMs?: number;
};

export function useSampleQuestions(
  context: SampleQuestionsContext,
  options: UseSampleQuestionsOptions = {},
) {
  const { enabled = true, payload, refreshMs = REFRESH_MS } = options;
  const [questions, setQuestions] = useState<string[]>(() => fallbackSampleQuestions(context));
  const [refreshing, setRefreshing] = useState(false);
  const excludeRef = useRef<string[]>([]);
  const payloadRef = useRef(payload);
  payloadRef.current = payload;
  const payloadKey = JSON.stringify(payload ?? null);

  const fetchQuestions = useCallback(async () => {
    if (!enabled) return;
    setRefreshing(true);
    try {
      const res = await fetch("/api/sample-questions", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          context,
          payload: payloadRef.current,
          exclude: excludeRef.current,
        }),
      });
      if (!res.ok) return;
      const data = await res.json() as { questions?: string[] };
      if (!Array.isArray(data.questions) || data.questions.length === 0) return;
      setQuestions(data.questions);
      excludeRef.current = [...excludeRef.current, ...data.questions].slice(-32);
    } catch {
      // Keep showing the current list on network errors.
    } finally {
      setRefreshing(false);
    }
  }, [context, enabled]);

  useEffect(() => {
    if (!enabled) return;
    excludeRef.current = [];
    setQuestions(fallbackSampleQuestions(context));
    void fetchQuestions();
  }, [context, enabled, payloadKey, fetchQuestions]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => { void fetchQuestions(); }, refreshMs);
    return () => window.clearInterval(id);
  }, [enabled, fetchQuestions, refreshMs]);

  return { questions, refreshing, refresh: fetchQuestions };
}
