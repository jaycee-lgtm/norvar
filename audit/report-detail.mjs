// Extracts structured test coverage, failures, and remediation items from sprint JSON reports.

const GRADE_THRESHOLDS = { PASS: 85, REVIEW: 65 };

export const SPRINT_META = {
  1: {
    endpoint: "/api/assess",
    scope:    "Regulatory gap detection — framework citation, concept coverage, corpus grounding across privacy/AI/cyber domains",
    categories: ["privacy", "ai", "cyber", "cross-domain"],
  },
  2: {
    endpoint: "/api/infer",
    scope:    "Context inference — domain, jurisdiction, data-type, and sector detection with confidence calibration",
    categories: ["confident", "partial", "low_confidence", "edge_case"],
    dimensions: ["domains", "jurisdictions", "data_types", "sector"],
  },
  3: {
    endpoint: "/api/chat",
    scope:    "Nora assessment follow-up — answer quality, corpus grounding, citation accuracy",
    categories: ["grounding", "follow_up", "framework", "edge"],
  },
  4: {
    endpoint: "/api/assess",
    scope:    "Risk tier accuracy — H/M/L derivation, domain-level tiers, gap severity consistency",
    categories: ["high", "medium", "low", "calibration", "edge"],
  },
  5: {
    endpoint: "/api/grc-chat",
    scope:    "Nora identity & tone — brevity, plain prose, forbidden phrases, conditional formatting",
    categories: ["identity", "tone", "brevity", "formatting", "grounding", "edge"],
  },
  6: {
    endpoint: "/api/redline",
    scope:    "Varro contract redline — clause detection, severity/status, corpus citations, suggested text",
    categories: ["dpa", "msa", "isa", "nda", "ai_use", "edge"],
  },
  7: {
    endpoint: "/api/draft",
    scope:    "Petra agreement drafting — section completeness, clause quality, framework citations, no placeholders",
    categories: ["dpa", "msa", "isa", "nda", "ai_use", "privacy", "completeness", "language", "edge"],
  },
};

/** The four Norvar product agents (see src/lib/agents.ts). */
export const NORVAR_AGENTS = {
  Cassius: {
    role:     "Assessment, gap detection, risk tiering, and context inference",
    sprints:  [1, 2, 4],
    sprintLabels: {
      1: "Query Quality (/api/assess)",
      2: "Context Inference (/api/infer)",
      4: "Risk Tier Accuracy (/api/assess)",
    },
    endpoints: ["/api/assess", "/api/infer"],
    files: [
      "src/lib/agent-prompts.ts",
      "src/lib/streaming-assessment.ts",
      "src/lib/risk-tiers.ts",
      "src/lib/remediation.ts",
      "src/app/api/infer/route.ts",
      "src/app/api/assess/route.ts",
    ],
  },
  Nora: {
    role:     "GRC chat, assessment follow-up, identity and tone",
    sprints:  [3, 5],
    sprintLabels: {
      3: "Chat Quality & Grounding (/api/chat)",
      5: "Identity & Tone (/api/grc-chat)",
    },
    endpoints: ["/api/chat", "/api/grc-chat"],
    files: [
      "src/lib/grc-prompt.ts",
      "src/app/api/chat/route.ts",
      "src/app/api/grc-chat/route.ts",
    ],
  },
  Varro: {
    role:     "Contract redline — clause detection, severity, corpus citations",
    sprints:  [6],
    sprintLabels: {
      6: "Redline Quality (/api/redline)",
    },
    endpoints: ["/api/redline"],
    files: [
      "src/lib/redline.ts",
      "src/lib/redline-generate.ts",
      "src/app/api/redline/route.ts",
    ],
  },
  Petra: {
    role:     "Agreement drafting — sections, clauses, framework grounding",
    sprints:  [7],
    sprintLabels: {
      7: "Draft Quality (/api/draft)",
    },
    endpoints: ["/api/draft"],
    files: [
      "src/lib/draft.ts",
      "src/app/api/draft/route.ts",
    ],
  },
};

const SPRINT_TO_AGENT = {
  1: "Cassius", 2: "Cassius", 3: "Nora", 4: "Cassius",
  5: "Nora",  6: "Varro",  7: "Petra",
};

function norvarAgentForSprint(sprintId) {
  return SPRINT_TO_AGENT[sprintId] ?? "Unknown";
}

function queryLabel(r) {
  return r.label || r.domain || r.queryId || "unknown";
}

function queryType(r) {
  return r.type || r.domain || "general";
}

function gradeOf(r) {
  if (!r.scores) return "ERROR";
  return r.scores.grade ?? "UNKNOWN";
}

function scoreOf(r) {
  if (!r.scores) return 0;
  return r.scores.compositeScore ?? 0;
}

function truncate(text, max = 220) {
  if (!text) return "";
  const t = String(text).replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function getQueryInput(r) {
  return r.input || r.message || r.query || r.description
    || (r.context ? `${r.context} | ${r.message ?? ""}`.trim() : "")
    || "";
}

function getResponsePreview(r) {
  const text = r.responsePreview || r.responseText || r.fullResponse || "";
  return truncate(text, 300);
}

function verdictExplanation(grade, score) {
  if (grade === "ERROR") return "Request failed — no score produced.";
  if (grade === "PASS") {
    return `Score ${score}/100 meets PASS threshold (≥${GRADE_THRESHOLDS.PASS}).`;
  }
  if (grade === "REVIEW") {
    return `Score ${score}/100 is below PASS (≥${GRADE_THRESHOLDS.PASS}) but above FAIL (≥${GRADE_THRESHOLDS.REVIEW}) — flagged for review.`;
  }
  return `Score ${score}/100 is below FAIL threshold (<${GRADE_THRESHOLDS.REVIEW}).`;
}

function extractQueryIssues(sprintId, r) {
  if (!r.scores) {
    return [{ kind: "error", text: r.error || r.status || "Request failed" }];
  }

  const issues = [];

  for (const issue of r.scores.issues ?? []) {
    issues.push({ kind: "issue", text: issue });
  }

  for (const h of r.scores.hallucinations ?? []) {
    issues.push({ kind: "hallucination", text: h });
  }

  if (sprintId === 1) {
    if (r.scores.missingFrameworks?.length) {
      issues.push({ kind: "missing", text: `Missing frameworks: ${r.scores.missingFrameworks.join(", ")}` });
    }
    if (r.scores.missingConcepts?.length) {
      issues.push({ kind: "missing", text: `Missing concepts: ${r.scores.missingConcepts.join(", ")}` });
    }
  }

  if (sprintId === 3) {
    if (r.scores.missingTerms?.length) {
      issues.push({ kind: "missing", text: `Missing required terms: ${r.scores.missingTerms.join(", ")}` });
    }
    if (r.scores.mustNotIncludeHits?.length) {
      issues.push({ kind: "forbidden", text: `Forbidden terms used: ${r.scores.mustNotIncludeHits.join(", ")}` });
    }
    if (r.scores.citationPresent === false && r.scores.issues?.some(i => i.includes("cite"))) {
      issues.push({ kind: "citation", text: "Required article/regulation citation not found in response" });
    }
  }

  if (sprintId === 4) {
    if (!r.scores.tierMatch) {
      issues.push({
        kind: "tier",
        text: `Tier mismatch: got "${r.actualTier ?? "?"}", expected "${r.expectedTier ?? "?"}" (${r.scores.tierDirection ?? "unknown"})`,
      });
    }
    if (!r.scores.consistencyOk) {
      issues.push({ kind: "consistency", text: "Risk tier inconsistent with gap severities" });
    }
    if (r.scores.missingFrameworks?.length) {
      issues.push({ kind: "missing", text: `Missing frameworks: ${r.scores.missingFrameworks.join(", ")}` });
    }
  }

  if (sprintId === 6) {
    if (!r.scores.statusCorrect) {
      issues.push({
        kind: "status",
        text: `Status wrong: got "${r.actualStatus ?? "?"}", direction ${r.scores.statusDirection ?? "unknown"}`,
      });
    }
    if (r.scores.missingFlags?.length) {
      issues.push({ kind: "missing", text: `Missing flags: ${r.scores.missingFlags.join(", ")}` });
    }
    if (r.scores.missingCitations?.length) {
      issues.push({ kind: "missing", text: `Missing citations: ${r.scores.missingCitations.join(", ")}` });
    }
    if (!r.scores.issueCountOk) {
      issues.push({ kind: "count", text: `Clause count ${r.scores.actualIssues ?? "?"} outside expected range` });
    }
    if (!r.scores.suggestedTextQuality) {
      issues.push({ kind: "quality", text: "One or more clauses have empty or placeholder suggested text" });
    }
  }

  if (sprintId === 7) {
    if (r.scores.missingSections?.length) {
      issues.push({ kind: "missing", text: `Missing sections: ${r.scores.missingSections.join(", ")}` });
    }
    if (r.scores.missingClauses?.length) {
      issues.push({ kind: "missing", text: `Missing clauses: ${r.scores.missingClauses.join(", ")}` });
    }
    if (r.scores.missingCitations?.length) {
      issues.push({ kind: "missing", text: `Missing citations: ${r.scores.missingCitations.join(", ")}` });
    }
    if (r.scores.hasPlaceholders) {
      issues.push({ kind: "placeholder", text: "Draft contains placeholder text" });
    }
    if (!r.scores.sectionCountOk) {
      issues.push({ kind: "count", text: `Too few sections: ${r.scores.actualSections ?? "?"} (min required not met)` });
    }
    if (!r.scores.clauseCountOk) {
      issues.push({ kind: "count", text: `Too few clauses: ${r.scores.actualClauses ?? "?"} (min required not met)` });
    }
  }

  if (sprintId === 5) {
    if (!r.scores.lengthOk) {
      issues.push({ kind: "length", text: `Response too long: ${r.scores.actualLength} chars (max allowed exceeded)` });
    }
    if (r.scores.missingRequired?.length) {
      issues.push({ kind: "missing", text: `Missing required content: ${r.scores.missingRequired.join(", ")}` });
    }
    if (r.scores.hasFormatting) {
      issues.push({ kind: "formatting", text: "Unwanted bullet/list/header formatting in response" });
    }
    if (r.scores.forbiddenFound?.length) {
      issues.push({ kind: "tone", text: `Forbidden phrases: ${r.scores.forbiddenFound.join(", ")}` });
    }
    if (r.scores.redFlagsTriggered?.length) {
      issues.push({ kind: "redflag", text: `Red flags: ${r.scores.redFlagsTriggered.join(" | ")}` });
    }
  }

  return issues;
}

function buildScoringBreakdown(sprintId, r) {
  if (!r.scores) return [`HTTP/runtime error: ${r.error || r.status}`];

  const lines = [];
  const sc = r.scores;

  if (sprintId === 1) {
    lines.push(`Framework coverage: ${sc.frameworkCoverage ?? "?"}% (expected: ${(r.expectedFrameworks ?? []).join(", ") || "n/a"})`);
    lines.push(`Concept coverage: ${sc.conceptCoverage ?? "?"}% (expected: ${(r.expectedConcepts ?? []).join(", ") || "n/a"})`);
    lines.push(`Citation present: ${sc.citationPresent ? "yes ✓" : "no ✗"}`);
    if (sc.notes?.length) lines.push(`Scorer notes: ${sc.notes.join("; ")}`);
  }

  if (sprintId === 2) {
    for (const [dim, d] of Object.entries(sc.dimensions ?? {})) {
      const ok = d.issues?.length === 0 && d.confCorrect !== false;
      const mark = ok ? "✓" : "✗";
      lines.push(
        `${mark} ${dim}: ${d.points ?? "?"}/100 — got [${(d.actualValues ?? []).join(", ")}] (${d.actualConf}), expected [${(d.expectedValues ?? []).join(", ")}] (${d.expectedConf})`,
      );
      for (const issue of d.issues ?? []) lines.push(`    ↳ ${issue}`);
    }
  }

  if (sprintId === 3) {
    lines.push(`Required terms coverage: ${sc.mustIncludeScore ?? "?"}%`);
    if (sc.foundTerms?.length) lines.push(`  Found: ${sc.foundTerms.join(", ")}`);
    if (sc.missingTerms?.length) lines.push(`  Missing: ${sc.missingTerms.join(", ")}`);
    lines.push(`Citation present: ${sc.citationPresent ? "yes ✓" : "no ✗"}`);
    lines.push(`Uncertainty signal: ${sc.uncertaintySignal ? "yes ✓" : "no ✗"}`);
    if (sc.mustNotIncludeHits?.length) lines.push(`Forbidden terms hit: ${sc.mustNotIncludeHits.join(", ")}`);
  }

  if (sprintId === 4) {
    lines.push(`Overall tier: got "${r.actualTier ?? "?"}", expected "${r.expectedTier ?? "?"}" — ${sc.tierMatch ? "match ✓" : `mismatch (${sc.tierDirection}) ✗`}`);
    lines.push(`Tier/gap consistency: ${sc.consistencyOk ? "ok ✓" : "inconsistent ✗"}`);
    lines.push(`Gap count: ${r.gapCount ?? "?"}`);
    for (const [dom, d] of Object.entries(sc.domainAccuracy ?? {})) {
      lines.push(`  ${d.match ? "✓" : "✗"} ${dom}: got ${d.actual}, expected ${(d.expected ?? []).join("|")}`);
    }
    if (r.gaps?.length) {
      lines.push(`Gaps returned: ${r.gaps.slice(0, 5).map(g => `${g.title} (${g.severity})`).join("; ")}${r.gaps.length > 5 ? "…" : ""}`);
    }
  }

  if (sprintId === 5) {
    lines.push(`Length: ${sc.actualLength ?? "?"} chars — ${sc.lengthOk ? "within limit ✓" : "too long ✗"}`);
    lines.push(`Formatting: ${sc.hasFormatting ? "detected (unwanted) ✗" : "clean ✓"}`);
    if (sc.missingRequired?.length) lines.push(`Missing required: ${sc.missingRequired.join(", ")}`);
    if (sc.forbiddenFound?.length) lines.push(`Forbidden phrases: ${sc.forbiddenFound.join(", ")}`);
    if (sc.redFlagsTriggered?.length) lines.push(`Red flags triggered: ${sc.redFlagsTriggered.join(" | ")}`);
  }

  if (sprintId === 6) {
    lines.push(`Overall status: "${r.actualStatus ?? "?"}" — ${sc.statusCorrect ? "correct ✓" : `wrong (${sc.statusDirection}) ✗`}`);
    lines.push(`Flag coverage: ${sc.flagCoverage ?? "?"}%`);
    lines.push(`Citation coverage: ${sc.citationCoverage ?? "?"}%`);
    lines.push(`Clauses found: ${r.clauseCount ?? sc.actualIssues ?? "?"}`);
    lines.push(`Issue count ok: ${sc.issueCountOk ? "yes ✓" : "no ✗"}`);
    lines.push(`Suggested text quality: ${sc.suggestedTextQuality ? "ok ✓" : "poor ✗"}`);
    if (r.missingClauses?.length) lines.push(`Missing clauses identified: ${r.missingClauses.slice(0, 4).join(", ")}`);
  }

  if (sprintId === 7) {
    lines.push(`Section coverage: ${sc.sectionCoverage ?? "?"}% (${sc.actualSections ?? r.sectionCount ?? "?"} sections)`);
    lines.push(`Clause coverage: ${sc.clauseCoverage ?? "?"}% (${sc.actualClauses ?? r.clauseCount ?? "?"} clauses)`);
    lines.push(`Framework coverage: ${sc.frameworkCoverage ?? "?"}%`);
    lines.push(`Placeholders: ${sc.hasPlaceholders ? "found ✗" : "none ✓"}`);
    lines.push(`Drafting notes: ${sc.hasDraftingNotes ? "present ✓" : "missing ✗"}`);
    if (r.frameworks?.length) lines.push(`Frameworks cited: ${r.frameworks.join(", ")}`);
  }

  return lines.length ? lines : ["No detailed scoring breakdown available."];
}

function buildExpectedSummary(sprintId, r) {
  if (sprintId === 1) {
    return `Expected frameworks: ${(r.expectedFrameworks ?? []).join(", ") || "n/a"}; concepts: ${(r.expectedConcepts ?? []).join(", ") || "n/a"}`;
  }
  if (sprintId === 4) {
    return `Expected tier: ${r.expectedTier ?? "?"}`;
  }
  if (sprintId === 6) {
    return `Contract type: ${r.type ?? "?"}; clauses returned: ${r.clauseCount ?? "?"}`;
  }
  if (sprintId === 7) {
    return `Agreement type: ${r.agreementType ?? r.type ?? "?"}; title: ${truncate(r.title, 80) || "n/a"}`;
  }
  return "";
}

function buildQueryDetail(sprintId, r) {
  const grade  = gradeOf(r);
  const score  = scoreOf(r);
  const issues = extractQueryIssues(sprintId, r);

  const passReasons = [];
  if (grade === "PASS" && issues.length === 0) {
    passReasons.push("All scoring criteria met with no issues or hallucinations.");
  } else if (grade === "PASS" && issues.length > 0) {
    passReasons.push("Score meets PASS threshold despite minor issues noted below.");
  }

  return {
    id:               r.queryId,
    label:            queryLabel(r),
    type:             queryType(r),
    grade,
    score,
    input:            getQueryInput(r),
    inputPreview:     truncate(getQueryInput(r), 280),
    expectedSummary:  buildExpectedSummary(sprintId, r),
    verdict:          verdictExplanation(grade, score),
    scoringBreakdown: buildScoringBreakdown(sprintId, r),
    issues,
    passReasons,
    failReasons:      grade !== "PASS" ? issues.map(i => i.text) : [],
    responsePreview:  getResponsePreview(r),
    latencyMs:        r.latencyMs,
  };
}

function remediationForIssue(sprintId, issue, agent) {
  const norvarAgent = norvarAgentForSprint(sprintId);
  const agentMeta   = NORVAR_AGENTS[norvarAgent] ?? {};
  const text = issue.text.toLowerCase();

  let area = "general";
  let action = issue.text;
  let fixSteps = [];

  if (issue.kind === "hallucination" || text.includes("hallucinat") || text.includes("invented values")) {
    area = "value mapping";
    action = "Fix hallucinated inference values — align output enum with VALID_VALS and add alias normalisation (e.g. us → us_federal)";
    fixSteps = [
      "Update jurisdiction normalisation in src/app/api/infer/route.ts",
      "Add post-processing alias map for common invalid values",
      "Re-run Sprint 2 queries CI-02, CI-04, PI-01 to verify",
    ];
  } else if (text.includes("overconfident") || text.includes("underconfident")) {
    area = "confidence calibration";
    action = "Adjust confidence thresholds for partial/vague inputs in the infer prompt";
    fixSteps = [
      "Tighten confidence rules in src/app/api/infer/route.ts INFER_SYSTEM_PROMPT",
      "Require medium/low confidence when input lacks explicit jurisdiction or sector signals",
    ];
  } else if (text.includes("missing frameworks") || text.includes("missing citations") || text.includes("missing required")) {
    area = "corpus grounding";
    action = "Improve framework retrieval and citation requirements in system prompt";
    fixSteps = [
      "Strengthen must-cite rules in the agent system prompt",
      "Verify corpus retrieval returns expected frameworks for this scenario",
      "Add explicit framework checklist to prompt for this query type",
    ];
  } else if (text.includes("tier mismatch") || text.includes("too_high") || text.includes("too_low")) {
    area = "risk tiering";
    action = "Review deriveRiskFromGaps() and severity-to-tier mapping against regulatory high-risk categories";
    fixSteps = [
      "Check src/lib/risk-tiers.ts — normalizeRiskTier() and GAP_SEV_RANK",
      "Verify Cassius prompt high-severity calibration in src/lib/agent-prompts.ts",
      "Ensure gap severities align with overall H/M/L tier",
    ];
  } else if (text.includes("inconsistent")) {
    area = "tier consistency";
    action = "Risk tier must be consistent with gap severities returned in the same assessment";
    fixSteps = [
      "Review deriveRiskFromGaps() in src/lib/streaming-assessment.ts",
      "Check that highest gap severity maps correctly to overall tier",
    ];
  } else if (text.includes("status wrong") || text.includes("too_lenient") || text.includes("too_severe")) {
    area = "redline status";
    action = "Review overall_status derivation and severity calibration in redline prompts";
    fixSteps = [
      "Check status derivation logic in src/lib/redline-generate.ts",
      "Review CASSIUS_REDLINE_PROMPT / NORA_REDLINE_PROMPT in src/lib/redline.ts",
      "Ensure lenient/severe calibration matches contract severity",
    ];
  } else if (text.includes("missing flags")) {
    area = "redline coverage";
    action = "Redline must surface all required risk concepts for this contract type";
    fixSteps = [
      "Expand must-flag detection in redline prompt",
      "Add contract-type-specific checklist (DPA, MSA, ISA, etc.)",
    ];
  } else if (text.includes("placeholder")) {
    area = "draft completeness";
    action = "Strengthen placeholder-avoidance rules in Petra draft prompts";
    fixSteps = [
      "Add explicit no-[INSERT]/no-[TBD] rules to src/lib/draft.ts",
      "Require minimum clause length validation before returning draft",
    ];
  } else if (text.includes("formatting") || text.includes("forbidden")) {
    area = "Nora tone";
    action = "Tighten GRC prompt — plain prose default, conditional formatting, forbidden phrase list";
    fixSteps = [
      "Update src/lib/grc-prompt.ts — brevity and formatting rules",
      "Ensure bullets/headers only appear when 2+ recommendations",
      "Remove forbidden phrases from allowed response patterns",
    ];
  } else if (text.includes("missing sections") || text.includes("missing clauses")) {
    area = "draft structure";
    action = "Expand required section/clause checklist in Petra draft prompts";
    fixSteps = [
      "Add agreement-type section templates in src/lib/draft.ts",
      "Verify two-pass draft generates all required sections",
    ];
  } else if (text.includes("too long")) {
    area = "brevity";
    action = "Response exceeds max length — tighten brevity rules for this query type";
    fixSteps = ["Update max-length guidance in src/lib/grc-prompt.ts for this question category"];
  } else {
    const defaults = {
      1: { area: "assessment quality", action: "Review Cassius assess prompt — gap detection and framework citation rules" },
      2: { area: "inference",          action: "Review /api/infer prompt — jurisdiction detection and confidence thresholds" },
      3: { area: "chat grounding",     action: "Review Nora chat prompt — corpus citation and answer grounding rules" },
      4: { area: "risk tiering",       action: "Review tier derivation logic and gap severity calibration" },
      5: { area: "tone & identity",    action: "Review GRC prompt — brevity, tone, and formatting rules" },
      6: { area: "redline quality",    action: "Review redline prompts — clause detection, status, and suggested text" },
      7: { area: "draft quality",      action: "Review draft prompts — section completeness and framework citations" },
    };
    const d = defaults[sprintId] ?? { area: "general", action: issue.text };
    area = d.area;
    action = d.action;
    fixSteps = [`Review ${norvarAgent} prompts and scoring logic for this scenario`];
  }

  return {
    norvarAgent,
    agent: norvarAgent,
    area,
    action,
    fixSteps,
    filesToReview: agentMeta.files ?? [],
    autoFixed: false,
  };
}

function groupRemediation(items) {
  const seen = new Map();
  for (const item of items) {
    const key = `${item.norvarAgent ?? item.agent}|${item.area}|${item.action}`;
    if (!seen.has(key)) {
      seen.set(key, { ...item, affectedQueries: [...(item.affectedQueries ?? [])] });
    } else {
      const existing = seen.get(key);
      for (const q of item.affectedQueries ?? []) {
        if (!existing.affectedQueries.includes(q)) existing.affectedQueries.push(q);
      }
    }
  }
  return [...seen.values()];
}

export function buildAgentsTestedSummary(sprintResults, sprintDetails) {
  const testedSprintIds = new Set(sprintResults.map(s => s.sprintId));

  return Object.entries(NORVAR_AGENTS).map(([name, meta]) => {
    const agentSprints = sprintResults.filter(s => meta.sprints.includes(s.sprintId));
    const tested       = agentSprints.length > 0;
    const sprintIds    = meta.sprints.filter(id => testedSprintIds.has(id));
    const skippedIds   = meta.sprints.filter(id => !testedSprintIds.has(id));

    const totalQueries  = agentSprints.reduce((n, s) => n + s.total, 0);
    const passedQueries = agentSprints.reduce((n, s) => n + s.passed, 0);
    const avgScore      = agentSprints.length
      ? Math.round(agentSprints.reduce((n, s) => n + s.score, 0) / agentSprints.length)
      : null;

    const needsFix = sprintDetails
      .filter(d => meta.sprints.includes(d.sprintId))
      .flatMap(d => d.detail.needsAttention ?? []);

    const sprintBreakdown = sprintIds.map(id => {
      const sr = sprintResults.find(s => s.sprintId === id);
      const label = meta.sprintLabels[id] ?? `Sprint ${id}`;
      return {
        sprintId: id,
        label,
        tested: true,
        score:    sr?.score ?? null,
        grade:    sr?.grade ?? null,
        passed:   sr?.passed ?? 0,
        total:    sr?.total ?? 0,
        needsFix: sprintDetails.find(d => d.sprintId === id)?.detail.needsAttention?.length ?? 0,
      };
    });

    const skippedBreakdown = skippedIds.map(id => ({
      sprintId: id,
      label:    meta.sprintLabels[id] ?? `Sprint ${id}`,
      tested:   false,
    }));

    return {
      name,
      role:           meta.role,
      tested,
      sprintIds,
      skippedIds,
      sprintBreakdown,
      skippedBreakdown,
      totalQueries,
      passedQueries,
      avgScore,
      queriesNeedingFix: needsFix.length,
      endpoints:        meta.endpoints,
    };
  });
}

function buildGranularRemediationItems(sprint, detail, endpoint) {
  const items = [];

  for (const query of detail.needsAttention) {
    for (const issue of query.issues) {
      const rem = remediationForIssue(sprint.id, issue, sprint.agent);
      items.push({
        ...rem,
        sprintId:    sprint.id,
        sprintName:  sprint.name,
        endpoint:    endpoint ?? detail.endpoint,
        queryId:     query.id,
        queryLabel:  query.label,
        queryType:   query.type,
        queryInput:  query.inputPreview,
        grade:       query.grade,
        score:       query.score,
        issueKind:   issue.kind,
        issueText:   issue.text,
        scoringBreakdown: query.scoringBreakdown,
        responsePreview:  query.responsePreview,
      });
    }
  }

  return items;
}

function formatAgentsTestedSection(agentsSummary) {
  const lines = [
    "THE 4 NORVAR AGENTS — TEST COVERAGE",
    "═".repeat(54),
  ];

  for (const a of agentsSummary) {
    const icon = a.tested ? (a.queriesNeedingFix === 0 ? "✅" : "⚠️") : "⬜";
    const status = a.tested ? "TESTED" : "NOT TESTED";
    const scoreStr = a.avgScore != null ? `  |  avg ${a.avgScore}/100` : "";
    const passStr  = a.tested ? `  |  ${a.passedQueries}/${a.totalQueries} queries passed` : "";
    const fixStr   = a.tested && a.queriesNeedingFix > 0 ? `  |  ${a.queriesNeedingFix} need fix` : "";

    lines.push(`${icon} ${a.name.padEnd(8)} ${status}${scoreStr}${passStr}${fixStr}`);
    lines.push(`   Role: ${a.role}`);

    if (a.tested) {
      for (const sb of a.sprintBreakdown) {
        lines.push(`   ✓ Sprint ${sb.sprintId}: ${sb.label} — ${sb.passed}/${sb.total} passed (${sb.score}/100 ${sb.grade})${sb.needsFix ? ` — ${sb.needsFix} need fix` : ""}`);
      }
    }

    for (const sb of a.skippedBreakdown) {
      lines.push(`   ✗ Sprint ${sb.sprintId}: ${sb.label} — not run`);
    }

    lines.push("");
  }

  return lines.join("\n");
}

function formatGranularRemediationSection(granularItems, agentsSummary) {
  const lines = [
    "NEEDS MANUAL REMEDIATION",
    "═".repeat(54),
    "",
    formatAgentsTestedSection(agentsSummary),
  ];

  if (granularItems.length === 0) {
    lines.push("No manual remediation required — all tested queries passed.");
    return lines.join("\n");
  }

  lines.push(`${granularItems.length} issue(s) across ${new Set(granularItems.map(i => i.norvarAgent)).size} agent(s) require manual fixes:`);
  lines.push("");

  const byAgent = {};
  for (const item of granularItems) {
    if (!byAgent[item.norvarAgent]) byAgent[item.norvarAgent] = [];
    byAgent[item.norvarAgent].push(item);
  }

  let itemNum = 1;
  for (const [agentName, items] of Object.entries(byAgent)) {
    lines.push(`── ${agentName.toUpperCase()} (${items.length} issue${items.length === 1 ? "" : "s"}) ${"─".repeat(Math.max(0, 30 - agentName.length))}`);

    for (const item of items) {
      lines.push("");
      lines.push(`${itemNum}. [${item.queryId}] ${item.queryLabel} — ${item.grade} (${item.score}/100)`);
      lines.push(`   Sprint ${item.sprintId}: ${item.sprintName}`);
      lines.push(`   Endpoint: ${item.endpoint}`);
      if (item.queryInput) lines.push(`   Input: "${item.queryInput}"`);
      lines.push(`   Issue (${item.issueKind}): ${item.issueText}`);
      lines.push(`   Fix area: ${item.area}`);
      lines.push(`   Action: ${item.action}`);
      if (item.fixSteps?.length) {
        lines.push("   Steps:");
        for (const step of item.fixSteps) lines.push(`     → ${step}`);
      }
      if (item.filesToReview?.length) {
        lines.push(`   Files: ${item.filesToReview.join(", ")}`);
      }
      if (item.scoringBreakdown?.length) {
        lines.push("   Scoring context:");
        for (const line of item.scoringBreakdown.filter(l => l.includes("✗")).slice(0, 4)) {
          lines.push(`     ${line.trim()}`);
        }
      }
      if (item.responsePreview) {
        lines.push(`   Response: "${item.responsePreview}"`);
      }
      itemNum++;
    }
    lines.push("");
  }

  lines.push("GROUPED SUMMARY (by fix type)");
  lines.push("─".repeat(54));
  const grouped = groupRemediation(
    granularItems.map(i => ({
      norvarAgent: i.norvarAgent,
      agent:       i.norvarAgent,
      area:        i.area,
      action:      i.action,
      affectedQueries: [i.queryId],
    })),
  );
  grouped.forEach((g, i) => {
    lines.push(`  ${i + 1}. [${g.norvarAgent}/${g.area}] ${g.action}`);
    lines.push(`     Queries: ${g.affectedQueries.join(", ")}`);
  });

  return lines.join("\n");
}

export function buildSprintDetail(sprint, report) {
  const meta     = SPRINT_META[sprint.id] ?? {};
  const results  = report?.results ?? [];
  const endpoint = report?.endpoint ?? `${meta.endpoint ?? ""}`;

  const allQueries = results.map(r => buildQueryDetail(sprint.id, r));

  const byGrade = { PASS: [], REVIEW: [], FAIL: [], ERROR: [] };
  for (const q of allQueries) {
    (byGrade[q.grade] ?? byGrade.ERROR).push(q);
  }

  const needsAttention = [...byGrade.REVIEW, ...byGrade.FAIL, ...byGrade.ERROR];
  const manualItems = [];
  const granularRemediation = buildGranularRemediationItems(
    sprint,
    { needsAttention, allQueries, endpoint, scope: meta.scope ?? sprint.name },
    endpoint,
  );

  for (const q of needsAttention) {
    for (const issue of q.issues) {
      const rem = remediationForIssue(sprint.id, issue, sprint.agent);
      manualItems.push({ ...rem, affectedQueries: [q.id] });
    }
  }

  if (needsAttention.length > 0 && manualItems.length === 0) {
    manualItems.push({
      agent: sprint.agent,
      area: "sprint health",
      action: `Sprint scored below PASS threshold (${report?.avgCompositeScore ?? 0}/100) — review ${meta.endpoint ?? "endpoint"} prompts and scoring logic`,
      autoFixed: false,
      affectedQueries: needsAttention.map(q => q.id),
    });
  }

  const sprintMetrics = [];
  if (report?.totalHallucinations != null) sprintMetrics.push(`Hallucinations: ${report.totalHallucinations}`);
  if (report?.tierAccuracy) {
    const t = report.tierAccuracy;
    sprintMetrics.push(`Tier accuracy: ${t.correct}/${t.total} (${t.tooHigh} too high, ${t.tooLow} too low)`);
  }
  if (report?.statusAccuracy) {
    const s = report.statusAccuracy;
    sprintMetrics.push(`Status accuracy: ${s.correct} correct (${s.tooLenient} too lenient, ${s.tooSevere} too severe)`);
  }
  if (report?.avgFlagCoverage != null) sprintMetrics.push(`Avg flag coverage: ${report.avgFlagCoverage}%`);
  if (report?.avgCitationCoverage != null) sprintMetrics.push(`Avg citation coverage: ${report.avgCitationCoverage}%`);
  if (report?.draftsWithPlaceholders != null) sprintMetrics.push(`Drafts with placeholders: ${report.draftsWithPlaceholders}`);
  if (report?.responsesWithFormatting != null) sprintMetrics.push(`Responses with unwanted formatting: ${report.responsesWithFormatting}`);
  if (report?.inconsistentAssessments != null) sprintMetrics.push(`Inconsistent tier/gap assessments: ${report.inconsistentAssessments}`);

  return {
    endpoint,
    scope:              meta.scope ?? sprint.name,
    categories:         meta.categories ?? [],
    categoryBreakdown:  report?.byQueryType ?? report?.domainScores ?? report?.byExpectedTier ?? {},
    dimensionBreakdown: report?.byDimension ?? null,
    sprintMetrics,
    allQueries,
    passed:             byGrade.PASS,
    review:             byGrade.REVIEW,
    failed:             byGrade.FAIL,
    errors:             byGrade.ERROR,
    needsAttention,
    autoRemediated:     [],
    needsManualRemediation: groupRemediation(manualItems),
    granularRemediation,
    topIssues:          report?.topIssues ?? [],
  };
}

function formatCategoryLines(breakdown) {
  if (!breakdown || typeof breakdown !== "object") return [];
  return Object.entries(breakdown).map(([cat, val]) => {
    if (typeof val === "number") return `  • ${cat}: ${val}/100 avg`;
    if (val && typeof val === "object" && "correct" in val) {
      return `  • ${cat} tier: ${val.correct}/${val.total} correct`;
    }
    return `  • ${cat}: ${JSON.stringify(val)}`;
  });
}

function formatDimensionLines(breakdown) {
  if (!breakdown) return [];
  return Object.entries(breakdown).map(([d, sc]) => `  • ${d}: ${sc}/100`);
}

function formatGranularQueryBlock(q, index) {
  const icon = q.grade === "PASS" ? "✓" : q.grade === "REVIEW" ? "~" : q.grade === "ERROR" ? "!" : "✗";
  const lines = [
    `${"─".repeat(54)}`,
    `${index + 1}. [${q.id}] ${q.label}`,
    `   Type: ${q.type}  |  Verdict: ${q.grade}  |  Score: ${q.score}/100  |  ${q.latencyMs ?? "?"}ms`,
  ];

  if (q.inputPreview) lines.push(`   Question/input: "${q.inputPreview}"`);
  if (q.expectedSummary) lines.push(`   Expected: ${q.expectedSummary}`);

  lines.push(`   Why ${q.grade}: ${q.verdict}`);

  if (q.grade === "PASS" && q.passReasons.length) {
    for (const reason of q.passReasons) lines.push(`   ✓ ${reason}`);
  }

  lines.push("   Scoring breakdown:");
  for (const line of q.scoringBreakdown) {
    lines.push(`     ${line}`);
  }

  if (q.failReasons.length) {
    lines.push(`   Why not PASS (${q.failReasons.length} issue${q.failReasons.length === 1 ? "" : "s"}):`);
    for (const reason of q.failReasons) {
      lines.push(`     ✗ ${reason}`);
    }
  } else if (q.grade === "PASS") {
    lines.push("   Why not FAIL: no scoring issues recorded.");
  }

  if (q.responsePreview) {
    lines.push(`   Response preview: "${q.responsePreview}"`);
  }

  return lines.join("\n");
}

function formatAllQueriesSection(detail) {
  const sections = [
    `ALL QUERIES (${detail.allQueries.length} total — ${detail.passed.length} PASS, ${detail.review.length} REVIEW, ${detail.failed.length} FAIL, ${detail.errors.length} ERROR)`,
    "═".repeat(54),
  ];

  detail.allQueries.forEach((q, i) => {
    sections.push(formatGranularQueryBlock(q, i));
  });

  return sections.join("\n");
}

export function formatSprintEmailBody(sprint, entry, detail) {
  const icon = entry.status === "PASS" ? "✅" : entry.status === "REVIEW" ? "⚠️" : "🔴";
  const sections = [];

  sections.push(`${icon} SPRINT ${sprint.id} COMPLETE — ${sprint.name}`);
  sections.push(`Agent: ${sprint.agent}  |  Grade: ${entry.grade}  |  Score: ${entry.score}/100`);
  sections.push(`Duration: ${entry.durationSec}s  |  Target: ${entry.report?.endpoint ?? detail.endpoint}`);
  sections.push("");

  sections.push("WHAT WAS TESTED");
  sections.push("───────────────");
  sections.push(`Endpoint: ${detail.endpoint}`);
  sections.push(`Scope: ${detail.scope}`);
  sections.push(`Total queries in suite: ${detail.allQueries.length}`);
  sections.push(`Results: ${detail.passed.length} PASS | ${detail.review.length} REVIEW | ${detail.failed.length} FAIL | ${detail.errors.length} ERROR`);
  if (detail.categories.length) sections.push(`Categories: ${detail.categories.join(", ")}`);

  const catLines = formatCategoryLines(detail.categoryBreakdown);
  if (catLines.length) {
    sections.push("Category averages:");
    sections.push(...catLines);
  }
  const dimLines = formatDimensionLines(detail.dimensionBreakdown);
  if (dimLines.length) {
    sections.push("Dimension averages:");
    sections.push(...dimLines);
  }
  for (const m of detail.sprintMetrics) sections.push(`  • ${m}`);
  sections.push("");

  sections.push(formatAllQueriesSection(detail));
  sections.push("");

  sections.push("AUTO-REMEDIATED");
  sections.push("───────────────");
  if (detail.autoRemediated.length) {
    for (const a of detail.autoRemediated) {
      const deploy = a.pendingDeploy ? " [deploy required]" : "";
      sections.push(`  ✓ [${a.agent}] ${a.action}${deploy}`);
    }
  } else {
    sections.push("  None this sprint.");
  }
  sections.push("");

  const agentsSummary = buildAgentsTestedSummary(
    [{
      sprintId: sprint.id,
      name:     sprint.name,
      agent:    sprint.agent,
      passed:   entry.passed,
      total:    entry.total,
      score:    entry.score,
      grade:    entry.grade,
      status:   entry.status,
    }],
    [{ sprintId: sprint.id, detail }],
  );
  sections.push(formatGranularRemediationSection(detail.granularRemediation ?? [], agentsSummary));

  return sections.join("\n");
}

export function formatFinalEmailBody(summary, sprintDetails) {
  const emoji = { HEALTHY: "✅", DEGRADED: "⚠️", CRITICAL: "🔴" }[summary.overallGrade] ?? "";
  const sections = [];

  sections.push(`${emoji} NORVAR AUDIT COMPLETE — ${summary.overallGrade} (${summary.avgScore}/100)`);
  sections.push(`Run: ${summary.runAt}`);
  sections.push(`Target: ${summary.baseUrl}`);
  sections.push(`Queries: ${summary.totalPassed}/${summary.totalQueries} passed across ${summary.sprintResults.length} sprints`);
  sections.push("");

  sections.push("AGENT HEALTH");
  sections.push("────────────");
  for (const [agent, score] of Object.entries(summary.agentHealth)) {
    const icon = score >= 85 ? "✅" : score >= 70 ? "⚠️" : "🔴";
    sections.push(`  ${icon} ${agent.padEnd(12)} ${score}/100`);
  }
  sections.push("");

  sections.push("WHAT WAS TESTED (ALL SPRINTS)");
  sections.push("──────────────────────────────");
  for (const s of summary.sprintResults) {
    const detail = sprintDetails.find(d => d.sprintId === s.sprintId)?.detail;
    const icon = s.status === "PASS" ? "✅" : s.status === "REVIEW" ? "⚠️" : "🔴";
    sections.push(`${icon} S${s.sprintId} ${s.name}`);
    sections.push(`     ${detail?.endpoint ?? ""}`);
    sections.push(`     ${s.passed}/${s.total} passed — ${s.score}/100 (${s.grade})`);
    if (detail?.scope) sections.push(`     Scope: ${detail.scope}`);
    if (detail?.allQueries?.length) {
      sections.push(`     Queries: ${detail.allQueries.map(q => q.id).join(", ")}`);
    }
    if (detail?.sprintMetrics?.length) {
      sections.push(`     ${detail.sprintMetrics.join(" | ")}`);
    }
  }
  sections.push("");

  for (const { sprintId, detail } of sprintDetails) {
    const sprintName = summary.sprintResults.find(s => s.sprintId === sprintId)?.name ?? `Sprint ${sprintId}`;
    sections.push("");
    sections.push(`SPRINT ${sprintId}: ${sprintName}`);
    sections.push("═".repeat(54));
    sections.push(formatAllQueriesSection(detail));
  }

  sections.push("");
  const allAuto = sprintDetails.flatMap(({ detail }) => detail.autoRemediated);
  sections.push("AUTO-REMEDIATED");
  sections.push("───────────────");
  if (allAuto.length) {
    for (const a of allAuto) {
      const deploy = a.pendingDeploy ? " [deploy required]" : "";
      sections.push(`  ✓ [${a.agent}] ${a.action}${deploy}`);
    }
  } else {
    sections.push("  None this run.");
  }
  sections.push("");

  const agentsSummary = buildAgentsTestedSummary(summary.sprintResults, sprintDetails);
  const allGranular   = sprintDetails.flatMap(({ detail }) => detail.granularRemediation ?? []);
  sections.push(formatGranularRemediationSection(allGranular, agentsSummary));

  sections.push("");
  sections.push("Full JSON + Markdown reports saved on host.");

  return sections.join("\n");
}

export function buildDetailedMarkdown(summary, sprintDetails) {
  const gradeEmoji = { HEALTHY: "✅", DEGRADED: "⚠️", CRITICAL: "🔴" };
  const agentsSummary = summary.agentsTested ?? buildAgentsTestedSummary(summary.sprintResults, sprintDetails);
  const lines = [
    `# Norvar Auto Audit Report`,
    `**${summary.runAt}**  |  Target: ${summary.baseUrl}`,
    ``,
    `## Overall Health: ${gradeEmoji[summary.overallGrade] ?? ""} ${summary.overallGrade}`,
    `**Avg score:** ${summary.avgScore}/100  |  **Passed:** ${summary.totalPassed}/${summary.totalQueries} queries`,
    ``,
    `## The 4 Norvar Agents — Test Coverage`,
    ``,
    ...agentsSummary.map(a => {
      const status = a.tested ? `TESTED — ${a.passedQueries}/${a.totalQueries} passed${a.avgScore != null ? `, avg ${a.avgScore}/100` : ""}` : "NOT TESTED";
      return `- **${a.name}** (${a.role}): ${status}`;
    }),
    ``,
    `## Agent Health`,
    `| Agent | Score |`,
    `|-------|-------|`,
    ...Object.entries(summary.agentHealth).map(([agent, score]) => `| ${agent} | ${score}/100 |`),
    ``,
  ];

  for (const s of summary.sprintResults) {
    const detail = sprintDetails.find(d => d.sprintId === s.sprintId)?.detail;
    lines.push(`## Sprint ${s.sprintId}: ${s.name}`, "");
    lines.push(`**Score:** ${s.score}/100 (${s.grade})  |  **Pass/Total:** ${s.passed}/${s.total}  |  **Duration:** ${s.durationSec}s`, "");
    if (!detail) continue;

    lines.push(`**Endpoint:** ${detail.endpoint}`, "");
    lines.push(`**Scope:** ${detail.scope}`, "");
    if (detail.sprintMetrics?.length) {
      lines.push("**Metrics:** " + detail.sprintMetrics.join(" · "), "");
    }

    lines.push(`### All queries (${detail.allQueries.length})`, "");
    for (const q of detail.allQueries) {
      lines.push(`#### [${q.id}] ${q.label} — **${q.grade}** (${q.score}/100)`, "");
      if (q.inputPreview) lines.push(`**Input:** ${q.inputPreview}`, "");
      lines.push(`**Verdict:** ${q.verdict}`, "");
      lines.push("**Scoring breakdown:**", "");
      for (const line of q.scoringBreakdown) lines.push(`- ${line}`);
      if (q.failReasons.length) {
        lines.push("", "**Why not PASS:**", "");
        for (const reason of q.failReasons) lines.push(`- ${reason}`);
      }
      if (q.responsePreview) lines.push("", `**Response preview:** ${q.responsePreview}`, "");
      lines.push("");
    }

    if (detail.needsManualRemediation?.length) {
      lines.push("### Manual remediation", "");
      for (const item of detail.granularRemediation ?? []) {
        lines.push(`- **[${item.norvarAgent}] [${item.queryId}]** ${item.queryLabel} — ${item.issueText}`);
        lines.push(`  - Action: ${item.action}`);
        lines.push(`  - Files: ${(item.filesToReview ?? []).join(", ")}`);
      }
      lines.push("");
    }
  }

  const allGranular = sprintDetails.flatMap(({ detail }) => detail.granularRemediation ?? []);
  if (allGranular.length) {
    lines.push("## Manual Remediation (all sprints)", "");
    for (const item of allGranular) {
      lines.push(`### [${item.norvarAgent}] ${item.queryId} — ${item.queryLabel}`, "");
      lines.push(`- **Sprint ${item.sprintId}** | ${item.grade} (${item.score}/100)`, "");
      lines.push(`- **Issue:** ${item.issueText}`, "");
      lines.push(`- **Action:** ${item.action}`, "");
      if (item.fixSteps?.length) {
        lines.push("- **Steps:**", "");
        for (const step of item.fixSteps) lines.push(`  - ${step}`);
      }
      lines.push("");
    }
  }

  lines.push("---", `*Norvar Auto Audit — ${summary.runAt}*`);
  return lines.join("\n");
}
