#!/usr/bin/env node
// Norvar — Sprint 6: Varro Contract Redline Quality Audit Runner
// Usage: node audit-runner-sprint6.mjs --url https://your-app.vercel.app --secret your-secret
//
// Tests /api/redline — clause detection, severity assignment, corpus citations,
// suggested text quality, and overall status accuracy across 20 contract scenarios

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { REDLINE_QUERIES } = await import(join(__dirname, "queries-sprint6.js"));

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const BASE_URL  = get("--url")    || "http://localhost:3000";
const SECRET    = get("--secret") || process.env.AUDIT_SECRET || "";
const DELAY_MS  = parseInt(get("--delay") || "4000");
const AGENT     = get("--agent")  || "cassius";  // cassius | nora
const ENDPOINT  = `${BASE_URL}/api/redline`;
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const REPORT_PATH  = `./varro-report-${TIMESTAMP}.json`;
const SUMMARY_PATH = `./varro-summary-${TIMESTAMP}.md`;

if (!SECRET) {
  console.error("\nERROR: --secret is required.");
  console.error("  node audit-runner-sprint6.mjs --url https://... --secret your-secret\n");
  process.exit(1);
}

// ─── SCORING ─────────────────────────────────────────────────────────────────

const STATUS_RANK = {
  "do_not_sign":        4,
  "significant_issues": 3,
  "needs_work":         2,
  "clean":              1,
};

function scoreRedline(query, redline) {
  const scores = {
    statusCorrect:       false,
    statusDirection:     null,
    flagCoverage:        0,
    citationCoverage:    0,
    issueCountOk:        true,
    hasMissingClauses:   false,
    hasPositiveClauses:  false,
    suggestedTextQuality: true,
    hallucinations:      [],
    issues:              [],
    compositeScore:      0,
    grade:               "FAIL",
  };

  const allText = [
    redline.summary ?? "",
    ...(redline.clauses ?? []).map(c => `${c.clause_title} ${c.issue} ${c.suggested_text} ${(c.frameworks ?? []).join(" ")}`),
    ...(redline.missing_clauses ?? []),
    ...(redline.positive_clauses ?? []),
  ].join(" ").toLowerCase();

  // 1. Overall status accuracy
  const expected  = query.expected.overall_status ?? [];
  const actual    = redline.overall_status ?? "unknown";
  scores.statusCorrect = expected.includes(actual);

  const actualRank   = STATUS_RANK[actual] ?? 0;
  const expectedRank = Math.max(...expected.map(s => STATUS_RANK[s] ?? 0));
  scores.statusDirection = scores.statusCorrect ? "correct"
    : actualRank > expectedRank ? "too_severe"
    : "too_lenient";

  if (!scores.statusCorrect) {
    scores.issues.push(`Status wrong: got "${actual}", expected one of [${expected.join(", ")}] — ${scores.statusDirection}`);
  }

  // 2. Flag coverage — key concepts that must be surfaced
  const mustFlag  = query.expected.must_flag ?? [];
  const foundFlag = mustFlag.filter(f => allText.includes(f.toLowerCase()));
  const missFlag  = mustFlag.filter(f => !allText.includes(f.toLowerCase()));
  scores.flagCoverage = mustFlag.length > 0
    ? Math.round(foundFlag.length / mustFlag.length * 100) : 100;
  scores.missingFlags = missFlag;
  if (missFlag.length > 0) scores.issues.push(`Missing flags: ${missFlag.join(", ")}`);

  // 3. Citation coverage — required frameworks
  const mustCite  = query.expected.must_cite ?? [];
  const foundCite = mustCite.filter(c => allText.includes(c.toLowerCase()));
  const missCite  = mustCite.filter(c => !allText.includes(c.toLowerCase()));
  scores.citationCoverage = mustCite.length > 0
    ? Math.round(foundCite.length / mustCite.length * 100) : 100;
  scores.missingCitations = missCite;
  if (missCite.length > 0) scores.issues.push(`Missing citations: ${missCite.join(", ")}`);

  // 4. Issue count
  const clauseCount = (redline.clauses ?? []).length;
  const minIssues   = query.expected.min_issues ?? 0;
  const maxIssues   = query.expected.max_issues ?? 999;
  scores.issueCountOk  = clauseCount >= minIssues && clauseCount <= maxIssues;
  scores.actualIssues  = clauseCount;
  if (!scores.issueCountOk) {
    scores.issues.push(`Issue count ${clauseCount} outside expected [${minIssues}–${maxIssues === 999 ? "∞" : maxIssues}]`);
  }

  // 5. Missing clauses present when expected
  scores.hasMissingClauses  = (redline.missing_clauses ?? []).length > 0;
  scores.hasPositiveClauses = (redline.positive_clauses ?? []).length > 0;
  if (query.expected.must_have_missing_clauses && !scores.hasMissingClauses) {
    scores.issues.push("Should have identified missing clauses but returned none");
  }
  if (query.expected.must_have_positive_clauses && !scores.hasPositiveClauses) {
    scores.issues.push("Should have identified positive clauses but returned none");
  }

  // 6. Suggested text quality — check clauses have actual text (not placeholders)
  const badSuggested = (redline.clauses ?? []).filter(c =>
    !c.suggested_text || c.suggested_text.length < 20 ||
    c.suggested_text.includes("[INSERT]") || c.suggested_text.includes("[TBD]")
  );
  scores.suggestedTextQuality = badSuggested.length === 0;
  if (badSuggested.length > 0) {
    scores.issues.push(`${badSuggested.length} clause(s) have empty or placeholder suggested text`);
  }

  // 7. Red flag detection from query definitions
  scores.redFlagsTriggered = (query.redFlags ?? []).filter(flag => {
    const f = flag.toLowerCase();
    if (f.includes("returns 'clean'") || f.includes("returns \"clean\"")) {
      return actual === "clean" && !expected.includes("clean");
    }
    if (f.includes("does not flag")) {
      const subject = f.replace("does not flag", "").trim().replace(/['"]/g, "");
      return !allText.includes(subject);
    }
    if (f.includes("does not cite")) {
      const fw = f.replace("does not cite", "").trim().replace(/['"]/g, "");
      return !allText.includes(fw.toLowerCase());
    }
    return false;
  });
  if (scores.redFlagsTriggered.length > 0) {
    scores.issues.push(`Red flags: ${scores.redFlagsTriggered.slice(0, 2).join(" | ")}`);
  }

  // 8. Composite score
  const statusPts    = scores.statusCorrect ? 30 : (scores.statusDirection === "too_lenient" ? 0 : 10);
  const flagPts      = scores.flagCoverage   * 0.25;
  const citePts      = scores.citationCoverage * 0.15;
  const countPts     = scores.issueCountOk   ? 10 : 0;
  const suggestPts   = scores.suggestedTextQuality ? 10 : 0;
  const rfPenalty    = scores.redFlagsTriggered.length * 5;

  scores.compositeScore = Math.max(0, Math.min(100, Math.round(
    statusPts + flagPts + citePts + countPts + suggestPts - rfPenalty
  )));
  scores.grade = scores.compositeScore >= 85 ? "PASS"
    : scores.compositeScore >= 65 ? "REVIEW" : "FAIL";

  return scores;
}

// ─── REQUEST ─────────────────────────────────────────────────────────────────

async function runQuery(query) {
  console.log(`\n[${query.id}] ${query.label}`);
  console.log(`  Type: ${query.type} | Expected: [${query.expected.overall_status?.join(", ")}]`);

  const startTime = Date.now();

  try {
    const res = await fetch(ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-audit-secret": SECRET },
      body:    JSON.stringify({
        contract_text: query.contract,
        agent:         AGENT,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.log(`  HTTP ${res.status}: ${err.slice(0, 120)}`);
      return { queryId: query.id, status: "HTTP_ERROR", httpStatus: res.status, error: err.slice(0, 300), latencyMs: Date.now() - startTime, scores: null };
    }

    // Collect SSE stream
    let redline = null;
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const parsed = JSON.parse(line.slice(6).trim());
          if (parsed.type === "done"  && parsed.redline) redline = parsed.redline;
          if (parsed.type === "error") throw new Error(parsed.text);
        } catch (e) {
          if (e.message && !e.message.includes("JSON")) throw e;
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    if (!redline) return { queryId: query.id, status: "NO_REDLINE", latencyMs, scores: null };

    const scores = scoreRedline(query, redline);

    const mark = scores.grade === "PASS" ? "✓" : scores.grade === "REVIEW" ? "~" : "✗";
    console.log(`  ${mark} ${scores.grade} (${scores.compositeScore}/100) | status: ${redline.overall_status} | clauses: ${redline.clauses?.length ?? 0} | ${latencyMs}ms`);
    if (scores.missingFlags?.length)   console.log(`    Missing flags: ${scores.missingFlags.slice(0, 4).join(", ")}`);
    if (scores.missingCitations?.length) console.log(`    Missing citations: ${scores.missingCitations.join(", ")}`);
    if (!scores.statusCorrect)         console.log(`    Status: got "${redline.overall_status}" — ${scores.statusDirection}`);

    return {
      queryId: query.id, label: query.label, type: query.type,
      status: "OK", latencyMs,
      actualStatus:     redline.overall_status,
      clauseCount:      redline.clauses?.length ?? 0,
      missingClauses:   redline.missing_clauses ?? [],
      positiveClauses:  redline.positive_clauses ?? [],
      frameworks:       redline.frameworks ?? [],
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

  const tooLenient = valid.filter(r => r.scores.statusDirection === "too_lenient").length;
  const tooSevere  = valid.filter(r => r.scores.statusDirection === "too_severe").length;
  const avgFlags   = valid.length ? Math.round(valid.reduce((s, r) => s + r.scores.flagCoverage, 0) / valid.length) : 0;
  const avgCites   = valid.length ? Math.round(valid.reduce((s, r) => s + r.scores.citationCoverage, 0) / valid.length) : 0;

  const byType = {};
  for (const r of valid) {
    if (!byType[r.type]) byType[r.type] = [];
    byType[r.type].push(r.scores.compositeScore);
  }
  const typeAvgs = Object.fromEntries(
    Object.entries(byType).map(([t, sc]) => [t, Math.round(sc.reduce((a, b) => a + b, 0) / sc.length)])
  );

  return {
    runAt: new Date().toISOString(), endpoint: ENDPOINT, agent: AGENT,
    totalQueries: results.length,
    passed: passed.length, review: review.length, failed: failed.length, errors: errors.length,
    avgCompositeScore: avgScore, avgLatencyMs: avgLatency,
    statusAccuracy: { tooLenient, tooSevere, correct: valid.filter(r => r.scores.statusCorrect).length },
    avgFlagCoverage: avgFlags, avgCitationCoverage: avgCites,
    byQueryType: typeAvgs,
    overallGrade: avgScore >= 85 ? "READY" : avgScore >= 70 ? "NEEDS WORK" : "NOT READY",
    results,
  };
}

function buildMarkdown(s) {
  const lines = [
    `# Norvar — Sprint 6 Varro Redline Quality Audit`,
    `**Run:** ${s.runAt}  |  **Agent:** ${s.agent}  |  **Endpoint:** ${s.endpoint}`,
    ``,
    `## Overall`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Grade | **${s.overallGrade}** |`,
    `| Avg score | ${s.avgCompositeScore}/100 |`,
    `| Pass / Review / Fail / Error | ${s.passed} / ${s.review} / ${s.failed} / ${s.errors} of ${s.totalQueries} |`,
    `| Status accuracy | ${s.statusAccuracy.correct}/${s.totalQueries - s.errors} (${s.statusAccuracy.tooLenient} too lenient, ${s.statusAccuracy.tooSevere} too severe) |`,
    `| Avg flag coverage | ${s.avgFlagCoverage}% |`,
    `| Avg citation coverage | ${s.avgCitationCoverage}% |`,
    `| Avg latency | ${s.avgLatencyMs}ms |`,
    ``,
    `## By contract type`,
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
      `- **Grade:** ${sc.grade} | **Score:** ${sc.compositeScore}/100 | **Status:** ${r.actualStatus} (${sc.statusDirection}) | **Latency:** ${r.latencyMs}ms`,
      `- **Flags:** ${sc.flagCoverage}% | **Citations:** ${sc.citationCoverage}% | **Clauses found:** ${r.clauseCount} | **Suggested text ok:** ${sc.suggestedTextQuality}`,
    );
    if (sc.missingFlags?.length)      lines.push(`- **Missing flags:** ${sc.missingFlags.join(", ")}`);
    if (sc.missingCitations?.length)  lines.push(`- **Missing citations:** ${sc.missingCitations.join(", ")}`);
    if (sc.issues?.length)            lines.push(`- **Issues:** ${sc.issues.slice(0, 3).join(" | ")}`);
    lines.push(`- **Missing clauses:** ${r.missingClauses?.slice(0, 3).join(", ") || "none"}`, ``);
  }

  lines.push(`---`, `*Generated by Norvar audit runner — sprint 6 (Varro)*`);
  return lines.join("\n");
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Norvar — Sprint 6: Varro Redline Quality Audit   ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nEndpoint: ${ENDPOINT}`);
  console.log(`Agent:    ${AGENT}`);
  console.log(`Queries:  ${REDLINE_QUERIES.length}`);
  console.log(`Delay:    ${DELAY_MS}ms\n`);

  const results = [];
  for (let i = 0; i < REDLINE_QUERIES.length; i++) {
    results.push(await runQuery(REDLINE_QUERIES[i]));
    if (i < REDLINE_QUERIES.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const summary  = buildSummary(results);
  const markdown = buildMarkdown(summary);
  writeFileSync(REPORT_PATH,  JSON.stringify(summary, null, 2));
  writeFileSync(SUMMARY_PATH, markdown);

  console.log("\n\n╔══════════════════════════════════════════════════╗");
  console.log("║                  AUDIT COMPLETE                   ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nOverall grade:    ${summary.overallGrade}`);
  console.log(`Avg score:        ${summary.avgCompositeScore}/100`);
  console.log(`Pass/Review/Fail: ${summary.passed}/${summary.review}/${summary.failed}`);
  console.log(`Status accuracy:  ${summary.statusAccuracy.correct}/${summary.totalQueries - summary.errors}`);
  console.log(`  Too lenient:    ${summary.statusAccuracy.tooLenient}`);
  console.log(`  Too severe:     ${summary.statusAccuracy.tooSevere}`);
  console.log(`Avg flag coverage:     ${summary.avgFlagCoverage}%`);
  console.log(`Avg citation coverage: ${summary.avgCitationCoverage}%`);
  console.log(`\nBy contract type:`);
  for (const [t, sc] of Object.entries(summary.byQueryType)) {
    const bar = "█".repeat(Math.round(sc / 10)) + "░".repeat(10 - Math.round(sc / 10));
    console.log(`  ${t.padEnd(12)} ${bar} ${sc}/100`);
  }
  console.log(`\nReports: ${REPORT_PATH} | ${SUMMARY_PATH}`);
}

main().catch(err => { console.error("\nFATAL:", err); process.exit(1); });
