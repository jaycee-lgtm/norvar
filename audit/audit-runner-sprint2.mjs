#!/usr/bin/env node
// Norvar — Sprint 2: Context Inference Audit Runner
// Usage: node audit-runner-sprint2.mjs --url https://your-app.vercel.app --secret your-secret
//
// Fires all 20 inference queries at POST /api/infer
// Scores domain, jurisdiction, data_types, and sector detection
// Flags confidence miscalibration and hallucinated values

import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { INFER_QUERIES } = await import(join(__dirname, "queries-sprint2.js"));
import { writeFileSync } from "fs";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const args  = process.argv.slice(2);
const get   = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const BASE_URL  = get("--url")    || "http://localhost:3000";
const SECRET    = get("--secret") || process.env.AUDIT_SECRET || "";
const DELAY_MS  = parseInt(get("--delay") || "1500");
const ENDPOINT  = `${BASE_URL}/api/infer`;
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const REPORT_PATH  = `./infer-report-${TIMESTAMP}.json`;
const SUMMARY_PATH = `./infer-summary-${TIMESTAMP}.md`;

if (!SECRET) {
  console.error("\nERROR: --secret is required.");
  console.error("  node audit-runner-sprint2.mjs --url https://your-app.vercel.app --secret your-secret\n");
  process.exit(1);
}

// ─── SCORING ─────────────────────────────────────────────────────────────────

const CONF_RANK = { high: 3, medium: 2, low: 1 };

function scoreInference(query, inferred) {
  const scores = {
    dimensions: {},
    issues: [],
    hallucinations: [],
    compositeScore: 0,
    grade: "FAIL",
  };

  const DIMS = ["domains", "jurisdictions", "data_types", "sector"];
  let totalPoints = 0, earnedPoints = 0;

  for (const dim of DIMS) {
    const expected = query.expected[dim];
    const actual   = inferred?.[dim] ?? { values: [], confidence: "low", reasoning: "" };
    const dimScore = { dim, issues: [] };

    // 1. Value accuracy — are the expected values present?
    const expectedVals = expected.values ?? [];
    const actualVals   = (actual.values ?? []).map(v => v.toLowerCase());
    const found   = expectedVals.filter(v => actualVals.includes(v.toLowerCase()));
    const missing = expectedVals.filter(v => !actualVals.includes(v.toLowerCase()));

    // 2. Hallucination check — values returned that aren't in the valid set
    const VALID_VALS = {
      domains:       ["privacy", "ai", "cyber"],
      jurisdictions: ["eu", "us_federal", "us_state", "uk", "canada", "apac", "latam", "mena"],
      data_types:    ["biometric", "health", "children", "location", "financial", "behavioural", "communications", "general_pi"],
      sector:        ["government", "healthcare", "finance", "hr_recruitment", "education", "transport", "media_adtech", "legal", "retail", "proptech", "technology"],
    };
    const hallucinated = actualVals.filter(v => !VALID_VALS[dim]?.includes(v));
    if (hallucinated.length > 0) {
      scores.hallucinations.push(`${dim}: invented values [${hallucinated.join(", ")}]`);
      dimScore.issues.push(`Hallucinated: ${hallucinated.join(", ")}`);
    }

    // 3. Confidence calibration
    const expectedConf = expected.confidence;
    const actualConf   = actual.confidence;
    const confOk = actualConf === expectedConf;
    const confOver  = CONF_RANK[actualConf] > CONF_RANK[expectedConf]; // overclaiming
    const confUnder = CONF_RANK[actualConf] < CONF_RANK[expectedConf]; // underclaiming

    if (confOver)  dimScore.issues.push(`Overconfident: expected ${expectedConf}, got ${actualConf}`);
    if (confUnder) dimScore.issues.push(`Underconfident: expected ${expectedConf}, got ${actualConf}`);
    if (missing.length > 0) dimScore.issues.push(`Missing values: ${missing.join(", ")}`);

    // 4. Special case — low expected means values should be empty
    if (expectedConf === "low" && expectedVals.length === 0 && actualVals.length > 0) {
      dimScore.issues.push(`Should be empty (low confidence) but returned: ${actualVals.join(", ")}`);
    }

    // Points: value coverage (60%) + confidence calibration (40%)
    const valuePts = expectedVals.length > 0
      ? (found.length / expectedVals.length) * 60
      : (actualVals.length === 0 ? 60 : 30); // correct to return nothing when nothing expected
    const confPts = confOk ? 40 : confOver ? 10 : 20; // overconfidence penalised more than underconfidence

    dimScore.valueCoverage  = expectedVals.length > 0 ? Math.round(found.length / expectedVals.length * 100) : (actualVals.length === 0 ? 100 : 50);
    dimScore.confCorrect    = confOk;
    dimScore.actualValues   = actualVals;
    dimScore.expectedValues = expectedVals;
    dimScore.actualConf     = actualConf;
    dimScore.expectedConf   = expectedConf;
    dimScore.points         = Math.round(valuePts + confPts);

    totalPoints  += 100;
    earnedPoints += dimScore.points;
    scores.dimensions[dim] = dimScore;
    if (dimScore.issues.length > 0) scores.issues.push(...dimScore.issues.map(i => `${dim}: ${i}`));
  }

  scores.compositeScore = Math.round(earnedPoints / totalPoints * 100);
  scores.grade =
    scores.compositeScore >= 85 ? "PASS" :
    scores.compositeScore >= 65 ? "REVIEW" : "FAIL";

  return scores;
}

// ─── REQUEST ─────────────────────────────────────────────────────────────────

async function runQuery(query) {
  console.log(`\n[${query.id}] ${query.label}`);
  console.log(`  Input: "${query.input.slice(0, 80)}..."`);

  const startTime = Date.now();

  try {
    const response = await fetch(ENDPOINT, {
      method:  "POST",
      headers: {
        "Content-Type":   "application/json",
        "x-audit-secret": SECRET,
      },
      body: JSON.stringify({ description: query.input }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        queryId: query.id, status: "HTTP_ERROR",
        httpStatus: response.status, error: errText.slice(0, 300),
        latencyMs: Date.now() - startTime, scores: null,
      };
    }

    const { inferred, error: apiErr } = await response.json();
    const latencyMs = Date.now() - startTime;

    if (apiErr || !inferred) {
      return { queryId: query.id, status: "API_ERROR", error: apiErr, latencyMs, scores: null };
    }

    const scores = scoreInference(query, inferred);

    console.log(`  Grade: ${scores.grade} (${scores.compositeScore}/100) — ${latencyMs}ms`);
    for (const [dim, d] of Object.entries(scores.dimensions)) {
      const status = d.confCorrect && d.issues.length === 0 ? "✓" : "✗";
      console.log(`  ${status} ${dim.padEnd(14)} values: ${d.valueCoverage}% | conf: ${d.actualConf} (exp: ${d.expectedConf})`);
    }
    if (scores.hallucinations.length > 0) {
      console.log(`  ⚠ HALLUCINATIONS: ${scores.hallucinations.join("; ")}`);
    }
    if (scores.issues.length > 0 && scores.grade !== "PASS") {
      console.log(`  Issues: ${scores.issues.slice(0, 2).join(" | ")}`);
    }

    return {
      queryId:  query.id,
      label:    query.label,
      type:     query.type,
      input:    query.input,
      status:   "OK",
      latencyMs,
      inferred,
      scores,
      notes:    query.notes ?? null,
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

  const avgScore   = valid.length > 0 ? Math.round(valid.reduce((s, r) => s + r.scores.compositeScore, 0) / valid.length) : 0;
  const avgLatency = valid.length > 0 ? Math.round(valid.reduce((s, r) => s + r.latencyMs, 0) / valid.length) : 0;

  // Per-type breakdown
  const byType = {};
  for (const r of valid) {
    if (!byType[r.type]) byType[r.type] = [];
    byType[r.type].push(r.scores.compositeScore);
  }
  const typeAvgs = Object.fromEntries(
    Object.entries(byType).map(([t, scores]) => [t, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)])
  );

  // Per-dimension accuracy
  const dimScores = { domains: [], jurisdictions: [], data_types: [], sector: [] };
  for (const r of valid) {
    for (const [dim, d] of Object.entries(r.scores.dimensions)) {
      if (dimScores[dim]) dimScores[dim].push(d.points);
    }
  }
  const dimAvgs = Object.fromEntries(
    Object.entries(dimScores).map(([d, pts]) => [d, pts.length > 0 ? Math.round(pts.reduce((a, b) => a + b, 0) / pts.length) : 0])
  );

  const allHallucinations = valid.flatMap(r => r.scores.hallucinations ?? []);
  const allIssues         = valid.flatMap(r => r.scores.issues ?? []);

  return {
    runAt: new Date().toISOString(),
    endpoint: ENDPOINT,
    totalQueries: results.length,
    passed: passed.length, review: review.length,
    failed: failed.length, errors: errors.length,
    avgCompositeScore: avgScore,
    avgLatencyMs: avgLatency,
    byQueryType: typeAvgs,
    byDimension: dimAvgs,
    totalHallucinations: allHallucinations.length,
    topIssues: allIssues.slice(0, 10),
    overallGrade:
      avgScore >= 85 ? "READY" :
      avgScore >= 70 ? "NEEDS WORK" : "NOT READY",
    results,
  };
}

function buildMarkdown(s) {
  const lines = [
    `# Norvar — Sprint 2 Context Inference Audit`,
    `**Run:** ${s.runAt}`,
    `**Endpoint:** ${s.endpoint}`,
    ``,
    `## Overall`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Grade | **${s.overallGrade}** |`,
    `| Avg score | ${s.avgCompositeScore}/100 |`,
    `| Pass / Review / Fail / Error | ${s.passed} / ${s.review} / ${s.failed} / ${s.errors} of ${s.totalQueries} |`,
    `| Avg latency | ${s.avgLatencyMs}ms |`,
    `| Hallucinated values | ${s.totalHallucinations} |`,
    ``,
    `## By query type`,
    `| Type | Avg score |`,
    `|------|-----------|`,
    ...Object.entries(s.byQueryType).map(([t, sc]) => `| ${t} | ${sc}/100 |`),
    ``,
    `## By dimension`,
    `| Dimension | Avg score |`,
    `|-----------|-----------|`,
    ...Object.entries(s.byDimension).map(([d, sc]) => `| ${d} | ${sc}/100 |`),
    ``,
    `## Top issues`,
    ...s.topIssues.map(i => `- ${i}`),
    ``,
    `## Per-query results`,
    ``,
  ];

  for (const r of s.results) {
    if (!r.scores) {
      lines.push(`### ${r.queryId} — ERROR`, `- ${r.error}`, ``);
      continue;
    }
    lines.push(
      `### ${r.queryId} — ${r.label} (${r.type})`,
      `- **Grade:** ${r.scores.grade} | **Score:** ${r.scores.compositeScore}/100 | **Latency:** ${r.latencyMs}ms`,
    );
    for (const [dim, d] of Object.entries(r.scores.dimensions)) {
      const ok = d.confCorrect && d.issues.length === 0 ? "✓" : "✗";
      lines.push(`- ${ok} **${dim}**: returned \`[${d.actualValues.join(", ")}]\` (${d.actualConf}) — expected \`[${d.expectedValues.join(", ")}]\` (${d.expectedConf})`);
    }
    if (r.scores.hallucinations.length > 0) lines.push(`- ⚠ **Hallucinations:** ${r.scores.hallucinations.join("; ")}`);
    if (r.notes) lines.push(`- *Note: ${r.notes}*`);
    lines.push(``);
  }

  lines.push(`---`, `*Generated by Norvar audit runner — sprint 2*`);
  return lines.join("\n");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Norvar — Sprint 2: Context Inference Audit  ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`\nEndpoint: ${ENDPOINT}`);
  console.log(`Queries:  ${INFER_QUERIES.length}`);
  console.log(`Delay:    ${DELAY_MS}ms between queries\n`);

  const results = [];
  for (let i = 0; i < INFER_QUERIES.length; i++) {
    results.push(await runQuery(INFER_QUERIES[i]));
    if (i < INFER_QUERIES.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const summary  = buildSummary(results);
  const markdown = buildMarkdown(summary);

  writeFileSync(REPORT_PATH,  JSON.stringify(summary, null, 2));
  writeFileSync(SUMMARY_PATH, markdown);

  console.log("\n\n╔══════════════════════════════════════════════╗");
  console.log("║               AUDIT COMPLETE                  ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`\nOverall grade:  ${summary.overallGrade}`);
  console.log(`Avg score:      ${summary.avgCompositeScore}/100`);
  console.log(`Pass/Review/Fail: ${summary.passed}/${summary.review}/${summary.failed}`);
  console.log(`Hallucinations: ${summary.totalHallucinations}`);
  console.log(`\nBy query type:`);
  for (const [t, sc] of Object.entries(summary.byQueryType)) {
    const bar = "█".repeat(Math.round(sc / 10)) + "░".repeat(10 - Math.round(sc / 10));
    console.log(`  ${t.padEnd(16)} ${bar} ${sc}/100`);
  }
  console.log(`\nBy dimension:`);
  for (const [d, sc] of Object.entries(summary.byDimension)) {
    const bar = "█".repeat(Math.round(sc / 10)) + "░".repeat(10 - Math.round(sc / 10));
    console.log(`  ${d.padEnd(16)} ${bar} ${sc}/100`);
  }
  console.log(`\nReports: ${REPORT_PATH} | ${SUMMARY_PATH}`);
}

main().catch(err => { console.error("\nFATAL:", err); process.exit(1); });
