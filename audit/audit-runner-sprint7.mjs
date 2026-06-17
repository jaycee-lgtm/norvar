#!/usr/bin/env node
// Norvar — Sprint 7: Petra Agreement Draft Quality Audit Runner
// Usage: node audit-runner-sprint7.mjs --url https://your-app.vercel.app --secret your-secret

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { DRAFT_QUERIES } = await import(join(__dirname, "queries-sprint7.js"));

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const BASE_URL  = get("--url")    || "http://localhost:3000";
const SECRET    = get("--secret") || process.env.AUDIT_SECRET || "";
const DELAY_MS  = parseInt(get("--delay") || "5000"); // Petra is slower — two-pass
const ENDPOINT  = `${BASE_URL}/api/draft`;
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const REPORT_PATH  = `./petra-report-${TIMESTAMP}.json`;
const SUMMARY_PATH = `./petra-summary-${TIMESTAMP}.md`;

const PLACEHOLDER_PATTERNS = [
  /\[INSERT\b/i, /\[TBD\b/i, /\[SPECIFY\b/i,
  /\[PROVIDER NAME\]/i, /\[CUSTOMER NAME\]/i,
  /\[DATE\]/i, /\[AMOUNT\]/i, /\[JURISDICTION\]/i,
];

if (!SECRET) {
  console.error("\nERROR: --secret is required.\n");
  process.exit(1);
}

// ─── SCORING ─────────────────────────────────────────────────────────────────

function scoreDraft(query, draft) {
  const scores = {
    sectionCoverage:    100,
    clauseCoverage:     100,
    frameworkCoverage:  100,
    hasPlaceholders:    false,
    placeholders:       [],
    partyNamesOk:       true,
    sectionCountOk:     true,
    clauseCountOk:      true,
    hasDraftingNotes:   false,
    issues:             [],
    redFlagsTriggered:  [],
    compositeScore:     0,
    grade:              "FAIL",
  };

  const expected = query.expected;

  // Build full text corpus for searching
  const allText = [
    draft.summary ?? "",
    draft.title   ?? "",
    ...(draft.drafting_notes ?? []),
    ...(draft.sections ?? []).flatMap(s => [
      s.title ?? "",
      ...(s.clauses ?? []).flatMap(c => [c.title ?? "", c.text ?? ""]),
    ]),
    ...(draft.frameworks ?? []),
  ].join(" ").toLowerCase();

  // Count totals
  const sectionCount = (draft.sections ?? []).length;
  const clauseCount  = (draft.sections ?? []).reduce((n, s) => n + (s.clauses ?? []).length, 0);

  // 1. Section coverage
  const mustHaveSections  = expected.mustHaveSections ?? [];
  const foundSections     = mustHaveSections.filter(s => allText.includes(s.toLowerCase()));
  const missingSections   = mustHaveSections.filter(s => !allText.includes(s.toLowerCase()));
  scores.sectionCoverage  = mustHaveSections.length > 0
    ? Math.round(foundSections.length / mustHaveSections.length * 100) : 100;
  scores.missingSections  = missingSections;
  if (missingSections.length > 0) scores.issues.push(`Missing sections: ${missingSections.join(", ")}`);

  // 2. Clause content coverage
  const mustHaveClauses  = expected.mustHaveClauses ?? [];
  const foundClauses     = mustHaveClauses.filter(c => allText.includes(c.toLowerCase()));
  const missingClauses   = mustHaveClauses.filter(c => !allText.includes(c.toLowerCase()));
  scores.clauseCoverage  = mustHaveClauses.length > 0
    ? Math.round(foundClauses.length / mustHaveClauses.length * 100) : 100;
  scores.missingClauses  = missingClauses;
  if (missingClauses.length > 0) scores.issues.push(`Missing clause content: ${missingClauses.join(", ")}`);

  // 3. Framework citations
  const mustCite        = expected.mustCiteFrameworks ?? [];
  const foundCite       = mustCite.filter(f => allText.includes(f.toLowerCase()));
  const missingCite     = mustCite.filter(f => !allText.includes(f.toLowerCase()));
  scores.frameworkCoverage = mustCite.length > 0
    ? Math.round(foundCite.length / mustCite.length * 100) : 100;
  scores.missingCitations = missingCite;
  if (missingCite.length > 0) scores.issues.push(`Missing framework citations: ${missingCite.join(", ")}`);

  // 4. Placeholder detection
  const fullText = (draft.sections ?? []).flatMap(s =>
    (s.clauses ?? []).map(c => c.text ?? "")
  ).join(" ");
  scores.placeholders = PLACEHOLDER_PATTERNS
    .filter(p => p.test(fullText))
    .map(p => p.toString());
  scores.hasPlaceholders = scores.placeholders.length > 0;
  if (expected.noPlaceholders && scores.hasPlaceholders) {
    scores.issues.push(`Contains placeholder text: ${scores.placeholders.join(", ")}`);
  }

  // 5. Stub clause detection (fewer than 30 chars = likely not a real clause)
  const stubClauses = (draft.sections ?? []).flatMap(s =>
    (s.clauses ?? []).filter(c => (c.text ?? "").trim().length < 30)
  );
  if (stubClauses.length > 0) {
    scores.issues.push(`${stubClauses.length} stub clause(s) with < 30 chars text`);
  }

  // 6. Party name usage
  const partyNames = expected.partyNamesUsed ?? [];
  const missingPartyNames = partyNames.filter(n => !allText.includes(n.toLowerCase()));
  scores.partyNamesOk = missingPartyNames.length === 0;
  if (!scores.partyNamesOk) {
    scores.issues.push(`Party names not used in draft: ${missingPartyNames.join(", ")}`);
  }

  // 7. Section and clause counts
  const minSections = expected.minSections ?? 0;
  const minClauses  = expected.minClauses  ?? 0;
  scores.sectionCountOk = sectionCount >= minSections;
  scores.clauseCountOk  = clauseCount  >= minClauses;
  scores.actualSections = sectionCount;
  scores.actualClauses  = clauseCount;
  if (!scores.sectionCountOk) scores.issues.push(`Too few sections: ${sectionCount} (min ${minSections})`);
  if (!scores.clauseCountOk)  scores.issues.push(`Too few clauses: ${clauseCount} (min ${minClauses})`);

  // 8. Drafting notes
  scores.hasDraftingNotes = (draft.drafting_notes ?? []).length > 0;
  if (expected.mustHaveDraftingNotes && !scores.hasDraftingNotes) {
    scores.issues.push("Should have drafting notes for this context but returned none");
  }

  // 9. Red flag detection
  scores.redFlagsTriggered = (query.redFlags ?? []).filter(flag => {
    const f = flag.toLowerCase();
    if (f.includes("does not cite")) {
      const fw = f.replace("does not cite", "").trim().replace(/['"]/g, "");
      return !allText.includes(fw.toLowerCase());
    }
    if (f.includes("does not include") || f.includes("missing")) {
      const subject = f.replace(/does not include|missing/g, "").trim().replace(/['"]/g, "");
      return !allText.includes(subject.toLowerCase());
    }
    if (f.includes("fewer than") && f.includes("section")) {
      const n = parseInt(f.match(/\d+/)?.[0] ?? "0");
      return sectionCount < n;
    }
    if (f.includes("fewer than") && f.includes("clause")) {
      const n = parseInt(f.match(/\d+/)?.[0] ?? "0");
      return clauseCount < n;
    }
    if (f.includes("placeholder")) return scores.hasPlaceholders;
    return false;
  });
  if (scores.redFlagsTriggered.length > 0) {
    scores.issues.push(`Red flags: ${scores.redFlagsTriggered.slice(0, 2).join(" | ")}`);
  }

  // 10. Composite score
  const sectionPts  = scores.sectionCoverage  * 0.20;
  const clausePts   = scores.clauseCoverage   * 0.20;
  const framePts    = scores.frameworkCoverage * 0.15;
  const countPts    = (scores.sectionCountOk ? 10 : 0) + (scores.clauseCountOk ? 10 : 0);
  const placePts    = expected.noPlaceholders ? (scores.hasPlaceholders ? 0 : 15) : 15;
  const notePts     = expected.mustHaveDraftingNotes ? (scores.hasDraftingNotes ? 10 : 0) : 10;
  const rfPenalty   = scores.redFlagsTriggered.length * 5;
  const stubPenalty = stubClauses.length * 3;

  scores.compositeScore = Math.max(0, Math.min(100, Math.round(
    sectionPts + clausePts + framePts + countPts + placePts + notePts - rfPenalty - stubPenalty
  )));
  scores.grade = scores.compositeScore >= 85 ? "PASS"
    : scores.compositeScore >= 65 ? "REVIEW" : "FAIL";

  return scores;
}

// ─── REQUEST ─────────────────────────────────────────────────────────────────

async function runQuery(query) {
  console.log(`\n[${query.id}] ${query.label}`);
  console.log(`  Type: ${query.type}`);

  const startTime = Date.now();

  try {
    const res = await fetch(ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-audit-secret": SECRET },
      body:    JSON.stringify({ ...query.input }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`  HTTP ${res.status}: ${err.slice(0, 120)}`);
      return { queryId: query.id, status: "HTTP_ERROR", httpStatus: res.status, error: err.slice(0, 300), latencyMs: Date.now() - startTime, scores: null };
    }

    // Collect SSE stream
    let draft = null;
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const parsed = JSON.parse(line.slice(6).trim());
          if (parsed.type === "done"  && parsed.draft) draft = parsed.draft;
          if (parsed.type === "error") throw new Error(parsed.text);
        } catch (e) {
          if (e.message && !e.message.includes("JSON")) throw e;
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    if (!draft) return { queryId: query.id, status: "NO_DRAFT", latencyMs, scores: null };

    const scores = scoreDraft(query, draft);

    const mark = scores.grade === "PASS" ? "✓" : scores.grade === "REVIEW" ? "~" : "✗";
    const sectionCount = (draft.sections ?? []).length;
    const clauseCount  = (draft.sections ?? []).reduce((n, s) => n + (s.clauses ?? []).length, 0);
    console.log(`  ${mark} ${scores.grade} (${scores.compositeScore}/100) | ${sectionCount} sections, ${clauseCount} clauses | ${latencyMs}ms`);
    if (scores.missingSections?.length)   console.log(`    Missing sections: ${scores.missingSections.slice(0, 4).join(", ")}`);
    if (scores.missingClauses?.length)    console.log(`    Missing clauses: ${scores.missingClauses.slice(0, 4).join(", ")}`);
    if (scores.missingCitations?.length)  console.log(`    Missing citations: ${scores.missingCitations.join(", ")}`);
    if (scores.hasPlaceholders)           console.log(`    ⚠ Contains placeholder text`);

    return {
      queryId: query.id, label: query.label, type: query.type,
      status: "OK", latencyMs,
      agreementType:  draft.agreement_type,
      title:          draft.title,
      sectionCount,
      clauseCount,
      frameworks:     draft.frameworks ?? [],
      draftingNotes:  draft.drafting_notes ?? [],
      scores,
    };

  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    return { queryId: query.id, status: "NETWORK_ERROR", error: err.message, latencyMs: Date.now() - startTime, scores: null };
  }
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────

function buildSummary(results) {
  const valid   = results.filter(r => r.scores);
  const passed  = valid.filter(r => r.scores.grade === "PASS");
  const review  = valid.filter(r => r.scores.grade === "REVIEW");
  const failed  = valid.filter(r => r.scores.grade === "FAIL");
  const errors  = results.filter(r => !r.scores);
  const avgScore   = valid.length ? Math.round(valid.reduce((s, r) => s + r.scores.compositeScore, 0) / valid.length) : 0;
  const avgLatency = valid.length ? Math.round(valid.reduce((s, r) => s + r.latencyMs, 0) / valid.length) : 0;
  const withPlaceholders = valid.filter(r => r.scores.hasPlaceholders).length;
  const avgSections = valid.length ? Math.round(valid.reduce((s, r) => s + (r.sectionCount ?? 0), 0) / valid.length) : 0;
  const avgClauses  = valid.length ? Math.round(valid.reduce((s, r) => s + (r.clauseCount ?? 0), 0) / valid.length) : 0;

  const byType = {};
  for (const r of valid) {
    if (!byType[r.type]) byType[r.type] = [];
    byType[r.type].push(r.scores.compositeScore);
  }
  const typeAvgs = Object.fromEntries(
    Object.entries(byType).map(([t, sc]) => [t, Math.round(sc.reduce((a, b) => a + b, 0) / sc.length)])
  );

  return {
    runAt: new Date().toISOString(), endpoint: ENDPOINT,
    totalQueries: results.length,
    passed: passed.length, review: review.length, failed: failed.length, errors: errors.length,
    avgCompositeScore: avgScore, avgLatencyMs: avgLatency,
    draftsWithPlaceholders: withPlaceholders,
    avgSectionsPerDraft:    avgSections,
    avgClausesPerDraft:     avgClauses,
    byQueryType: typeAvgs,
    overallGrade: avgScore >= 85 ? "READY" : avgScore >= 70 ? "NEEDS WORK" : "NOT READY",
    results,
  };
}

function buildMarkdown(s) {
  const lines = [
    `# Norvar — Sprint 7 Petra Draft Quality Audit`,
    `**Run:** ${s.runAt}  |  **Endpoint:** ${s.endpoint}`,
    ``,
    `## Overall`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Grade | **${s.overallGrade}** |`,
    `| Avg score | ${s.avgCompositeScore}/100 |`,
    `| Pass / Review / Fail / Error | ${s.passed} / ${s.review} / ${s.failed} / ${s.errors} of ${s.totalQueries} |`,
    `| Drafts with placeholder text | ${s.draftsWithPlaceholders} |`,
    `| Avg sections per draft | ${s.avgSectionsPerDraft} |`,
    `| Avg clauses per draft | ${s.avgClausesPerDraft} |`,
    `| Avg latency | ${s.avgLatencyMs}ms |`,
    ``,
    `## By agreement type`,
    `| Type | Avg score |`,
    `|------|-----------|`,
    ...Object.entries(s.byQueryType).map(([t, sc]) => `| ${t} | ${sc}/100 |`),
    ``,
    `## Per-query results`,
    ``,
  ];

  for (const r of s.results) {
    if (!r.scores) { lines.push(`### ${r.queryId} — ERROR`, `- ${r.error}`, ``); continue; }
    const sc = r.scores;
    lines.push(
      `### ${r.queryId} — ${r.label} (${r.type})`,
      `- **Grade:** ${sc.grade} | **Score:** ${sc.compositeScore}/100 | **${r.sectionCount} sections, ${r.clauseCount} clauses** | **Latency:** ${r.latencyMs}ms`,
      `- **Sections:** ${sc.sectionCoverage}% | **Clauses:** ${sc.clauseCoverage}% | **Frameworks:** ${sc.frameworkCoverage}% | **Placeholders:** ${sc.hasPlaceholders ? "⚠ YES" : "clean"}`,
    );
    if (sc.missingSections?.length)   lines.push(`- **Missing sections:** ${sc.missingSections.join(", ")}`);
    if (sc.missingClauses?.length)    lines.push(`- **Missing clauses:** ${sc.missingClauses.join(", ")}`);
    if (sc.missingCitations?.length)  lines.push(`- **Missing citations:** ${sc.missingCitations.join(", ")}`);
    if (sc.issues?.length)            lines.push(`- **Issues:** ${sc.issues.slice(0, 3).join(" | ")}`);
    if (r.frameworks?.length)         lines.push(`- **Frameworks cited:** ${r.frameworks.slice(0, 5).join(", ")}`);
    lines.push(``);
  }

  lines.push(`---`, `*Generated by Norvar audit runner — sprint 7 (Petra)*`);
  return lines.join("\n");
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Norvar — Sprint 7: Petra Draft Quality Audit     ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nEndpoint: ${ENDPOINT}`);
  console.log(`Queries:  ${DRAFT_QUERIES.length}`);
  console.log(`Delay:    ${DELAY_MS}ms (two-pass drafting takes time)\n`);

  const results = [];
  for (let i = 0; i < DRAFT_QUERIES.length; i++) {
    results.push(await runQuery(DRAFT_QUERIES[i]));
    if (i < DRAFT_QUERIES.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const summary  = buildSummary(results);
  const markdown = buildMarkdown(summary);
  writeFileSync(REPORT_PATH,  JSON.stringify(summary, null, 2));
  writeFileSync(SUMMARY_PATH, markdown);

  console.log("\n\n╔══════════════════════════════════════════════════╗");
  console.log("║                  AUDIT COMPLETE                   ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nOverall grade:          ${summary.overallGrade}`);
  console.log(`Avg score:              ${summary.avgCompositeScore}/100`);
  console.log(`Pass/Review/Fail:       ${summary.passed}/${summary.review}/${summary.failed}`);
  console.log(`Avg sections per draft: ${summary.avgSectionsPerDraft}`);
  console.log(`Avg clauses per draft:  ${summary.avgClausesPerDraft}`);
  console.log(`With placeholders:      ${summary.draftsWithPlaceholders}`);
  console.log(`\nBy agreement type:`);
  for (const [t, sc] of Object.entries(summary.byQueryType)) {
    const bar = "█".repeat(Math.round(sc / 10)) + "░".repeat(10 - Math.round(sc / 10));
    console.log(`  ${t.padEnd(12)} ${bar} ${sc}/100`);
  }
  console.log(`\nReports: ${REPORT_PATH} | ${SUMMARY_PATH}`);
}

main().catch(err => { console.error("\nFATAL:", err); process.exit(1); });
