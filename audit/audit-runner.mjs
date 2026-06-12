#!/usr/bin/env node
// Norvar — Sprint 1: Query Quality Audit Runner
// Usage: node audit-runner.mjs --url https://your-app.vercel.app --secret your-audit-secret
//
// Fires all 15 test queries against POST /api/chat
// Scores each response against expected criteria
// Writes a full JSON report + human-readable markdown summary

import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { TEST_QUERIES } = await import(join(__dirname, "queries.js"));
import { writeFileSync } from "fs";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const BASE_URL  = get("--url")    || "http://localhost:3000";
const SECRET    = get("--secret") || process.env.AUDIT_SECRET || "";
const DELAY_MS  = parseInt(get("--delay") || "2500");
const ENDPOINT  = `${BASE_URL}/api/chat`;
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const REPORT_PATH  = `./audit-report-${TIMESTAMP}.json`;
const SUMMARY_PATH = `./audit-summary-${TIMESTAMP}.md`;

if (!SECRET) {
  console.error("\nERROR: --secret is required. Pass the value you set as AUDIT_SECRET in Vercel.");
  console.error("  node audit-runner.mjs --url https://your-app.vercel.app --secret your-secret\n");
  process.exit(1);
}

// ─── SCORING ─────────────────────────────────────────────────────────────────

function scoreResponse(query, responseText) {
  const text = responseText.toLowerCase();
  const scores = {
    frameworkCoverage: 0,
    conceptCoverage:   0,
    citationPresent:   false,
    outOfScopeHandled: false,
    redFlagsTriggered: [],
    notes: [],
  };

  const expectedFrameworks = query.expected.frameworks || [];
  const foundFrameworks    = expectedFrameworks.filter(f => text.includes(f.toLowerCase()));
  scores.frameworkCoverage = expectedFrameworks.length > 0
    ? Math.round((foundFrameworks.length / expectedFrameworks.length) * 100) : 100;
  scores.foundFrameworks   = foundFrameworks;
  scores.missingFrameworks = expectedFrameworks.filter(f => !text.includes(f.toLowerCase()));

  const expectedConcepts = query.expected.concepts || [];
  const foundConcepts    = expectedConcepts.filter(c => text.includes(c.toLowerCase()));
  scores.conceptCoverage = expectedConcepts.length > 0
    ? Math.round((foundConcepts.length / expectedConcepts.length) * 100) : 100;
  scores.foundConcepts   = foundConcepts;
  scores.missingConcepts = expectedConcepts.filter(c => !text.includes(c.toLowerCase()));

  const citationPatterns = [
    /art(?:icle)?\.?\s*\d+/i, /§\s*\d+/, /section\s+\d+/i,
    /local law\s+\d+/i, /\d+\s+cfr/i, /recital\s+\d+/i,
  ];
  scores.citationPresent = citationPatterns.some(p => p.test(responseText));

  if (query.type === "out-of-scope") {
    const refusalSignals = [
      "outside", "not a compliance", "technical question", "beyond", "scope",
      "not able to", "cannot assess", "architecture", "product comparison", "benchmark",
    ];
    scores.outOfScopeHandled = refusalSignals.some(s => text.includes(s));
    if (!scores.outOfScopeHandled && text.length > 200) {
      scores.notes.push("WARNING: May have hallucinated compliance findings for out-of-scope query");
    }
  }

  scores.redFlagsTriggered = (query.redFlags || []).filter(flag => {
    const flagLower = flag.toLowerCase();
    if (flagLower.includes("no mention of")) {
      const subject = flagLower.replace("no mention of", "").trim();
      return !text.includes(subject);
    }
    return false;
  });

  const baseScore = Math.round(
    (scores.frameworkCoverage * 0.4) +
    (scores.conceptCoverage   * 0.4) +
    (scores.citationPresent ? 20 : 0)
  );
  scores.compositeScore = Math.min(100, baseScore);
  scores.grade =
    scores.compositeScore >= 85 ? "PASS" :
    scores.compositeScore >= 65 ? "REVIEW" : "FAIL";

  return scores;
}

// ─── REQUEST ─────────────────────────────────────────────────────────────────

async function runQuery(query) {
  console.log(`\n[${query.id}] ${query.domain} — ${query.type}`);
  console.log(`  Query: "${query.query.slice(0, 80)}..."`);

  const startTime = Date.now();

  try {
    const response = await fetch(ENDPOINT, {
      method:  "POST",
      headers: {
        "Content-Type":   "application/json",
        "x-audit-secret": SECRET,
      },
      body: JSON.stringify({ message: query.query }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        queryId: query.id, status: "HTTP_ERROR",
        httpStatus: response.status, error: errText.slice(0, 500),
        latencyMs: Date.now() - startTime, scores: null,
      };
    }

    // Collect SSE stream
    let responseText = "";
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const line of chunk.split("\n")) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6).trim();
          if (data && data !== "[DONE]") {
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === "token" && parsed.text) responseText += parsed.text;
              else if (parsed.type === "done"  && parsed.text) responseText = parsed.text;
            } catch { responseText += data; }
          }
        }
      }
    }

    const latencyMs = Date.now() - startTime;
    const scores    = scoreResponse(query, responseText);

    console.log(`  Status: ${scores.grade} (${scores.compositeScore}/100) — ${latencyMs}ms`);
    console.log(`  Frameworks: ${scores.frameworkCoverage}% | Concepts: ${scores.conceptCoverage}% | Citations: ${scores.citationPresent}`);
    if (scores.missingFrameworks.length > 0) console.log(`  Missing frameworks: ${scores.missingFrameworks.join(", ")}`);
    if (scores.missingConcepts.length   > 0) console.log(`  Missing concepts:   ${scores.missingConcepts.slice(0, 3).join(", ")}`);

    return {
      queryId: query.id, domain: query.domain, type: query.type,
      query: query.query, status: "OK", latencyMs,
      responseLength: responseText.length,
      responsePreview: responseText.slice(0, 400),
      fullResponse: responseText,
      scores,
      expectedFrameworks: query.expected.frameworks,
      expectedConcepts:   query.expected.concepts,
    };

  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    return {
      queryId: query.id, status: "NETWORK_ERROR",
      error: err.message, latencyMs: Date.now() - startTime, scores: null,
    };
  }
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────

function buildSummary(results) {
  const valid  = results.filter(r => r.scores);
  const passed = valid.filter(r => r.scores.grade === "PASS");
  const review = valid.filter(r => r.scores.grade === "REVIEW");
  const failed = valid.filter(r => r.scores.grade === "FAIL");
  const errors = results.filter(r => !r.scores);

  const avgScore   = valid.length > 0 ? Math.round(valid.reduce((s, r) => s + r.scores.compositeScore, 0) / valid.length) : 0;
  const avgLatency = valid.length > 0 ? Math.round(valid.reduce((s, r) => s + r.latencyMs, 0) / valid.length) : 0;

  const byDomain = {};
  for (const r of valid) {
    if (!byDomain[r.domain]) byDomain[r.domain] = [];
    byDomain[r.domain].push(r.scores.compositeScore);
  }
  const domainAvgs = Object.fromEntries(
    Object.entries(byDomain).map(([d, scores]) => [
      d, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    ])
  );

  const allMissing = valid.flatMap(r => r.scores.missingFrameworks || []);
  const freq = {};
  for (const f of allMissing) freq[f] = (freq[f] || 0) + 1;
  const topMissing = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5);

  return {
    runAt: new Date().toISOString(),
    endpoint: ENDPOINT,
    totalQueries: results.length,
    passed: passed.length, review: review.length,
    failed: failed.length, errors: errors.length,
    avgCompositeScore: avgScore,
    avgLatencyMs: avgLatency,
    domainScores: domainAvgs,
    topMissingFrameworks: topMissing,
    overallGrade:
      avgScore >= 85 ? "READY" :
      avgScore >= 70 ? "NEEDS WORK" : "NOT READY",
    results,
  };
}

function buildMarkdown(summary) {
  const { overallGrade, avgCompositeScore, avgLatencyMs, passed, review, failed, errors, totalQueries } = summary;
  const lines = [
    `# Norvar — Sprint 1 Query Quality Audit`,
    `**Run:** ${summary.runAt}`,
    `**Endpoint:** ${summary.endpoint}`,
    ``,
    `## Overall`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Grade | **${overallGrade}** |`,
    `| Avg score | ${avgCompositeScore}/100 |`,
    `| Pass / Review / Fail / Error | ${passed} / ${review} / ${failed} / ${errors} of ${totalQueries} |`,
    `| Avg latency | ${avgLatencyMs}ms |`,
    ``,
    `## Domain scores`,
    `| Domain | Avg score |`,
    `|--------|-----------|`,
    ...Object.entries(summary.domainScores).map(([d, s]) => `| ${d} | ${s}/100 |`),
    ``,
    `## Top missing frameworks`,
  ];

  if (summary.topMissingFrameworks.length > 0) {
    lines.push(`| Framework | Missed in N queries |`, `|-----------|---------------------|`);
    for (const [f, n] of summary.topMissingFrameworks) lines.push(`| ${f} | ${n} |`);
  } else {
    lines.push(`None — all expected frameworks were cited.`);
  }

  lines.push(``, `## Per-query results`, ``);

  for (const r of summary.results) {
    if (!r.scores) {
      lines.push(`### ${r.queryId} — ERROR`, `- **Error:** ${r.error}`, ``);
      continue;
    }
    const s = r.scores;
    lines.push(
      `### ${r.queryId} — ${r.domain} (${r.type})`,
      `- **Grade:** ${s.grade} | **Score:** ${s.compositeScore}/100 | **Latency:** ${r.latencyMs}ms`,
      `- **Frameworks:** ${s.frameworkCoverage}% | **Concepts:** ${s.conceptCoverage}% | **Citations:** ${s.citationPresent ? "Yes" : "No"}`,
    );
    if (s.missingFrameworks.length > 0) lines.push(`- **Missing frameworks:** ${s.missingFrameworks.join(", ")}`);
    if (s.missingConcepts.length   > 0) lines.push(`- **Missing concepts:** ${s.missingConcepts.join(", ")}`);
    if (s.notes.length             > 0) lines.push(`- **Notes:** ${s.notes.join("; ")}`);
    lines.push(`- **Preview:** ${r.responsePreview?.slice(0, 200)}...`, ``);
  }

  lines.push(`---`, `*Generated by Norvar audit runner — sprint 1*`);
  return lines.join("\n");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║   Norvar — Sprint 1: Query Quality Audit ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\nEndpoint: ${ENDPOINT}`);
  console.log(`Queries:  ${TEST_QUERIES.length}`);
  console.log(`Delay:    ${DELAY_MS}ms between queries`);
  console.log(`\nStarting...\n`);

  const results = [];
  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const result = await runQuery(TEST_QUERIES[i]);
    results.push(result);
    if (i < TEST_QUERIES.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const summary  = buildSummary(results);
  const markdown = buildMarkdown(summary);

  writeFileSync(REPORT_PATH,  JSON.stringify(summary, null, 2));
  writeFileSync(SUMMARY_PATH, markdown);

  console.log("\n\n╔══════════════════════════════════════════╗");
  console.log("║              AUDIT COMPLETE               ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\nOverall grade:  ${summary.overallGrade}`);
  console.log(`Avg score:      ${summary.avgCompositeScore}/100`);
  console.log(`Pass/Review/Fail/Error: ${summary.passed}/${summary.review}/${summary.failed}/${summary.errors}`);
  console.log(`Avg latency:    ${summary.avgLatencyMs}ms`);
  console.log(`\nDomain scores:`);
  for (const [domain, score] of Object.entries(summary.domainScores)) {
    const bar = "█".repeat(Math.round(score / 10)) + "░".repeat(10 - Math.round(score / 10));
    console.log(`  ${domain.padEnd(20)} ${bar} ${score}/100`);
  }
  if (summary.topMissingFrameworks.length > 0) {
    console.log(`\nTop corpus gaps:`);
    for (const [f, n] of summary.topMissingFrameworks) {
      console.log(`  ${f.padEnd(25)} missed in ${n} quer${n === 1 ? "y" : "ies"}`);
    }
  }
  console.log(`\nReports written:`);
  console.log(`  JSON: ${REPORT_PATH}`);
  console.log(`  MD:   ${SUMMARY_PATH}`);
}

main().catch(err => { console.error("\nFATAL:", err); process.exit(1); });
