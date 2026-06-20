#!/usr/bin/env node
// Norvar — Sprint 3: Nora Chat Quality Audit Runner
// Usage: node audit-runner-sprint3.mjs --url https://your-app.vercel.app --secret your-secret

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { CHAT_QUERIES } = await import(join(__dirname, "queries-sprint3.js"));
const { collectChatTextFromStream } = await import(join(__dirname, "sse-parse.mjs"));

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const BASE_URL  = get("--url")    || "http://localhost:3000";
const SECRET    = get("--secret") || process.env.AUDIT_SECRET || "";
const DELAY_MS  = parseInt(get("--delay") || "2500");
const ENDPOINT  = `${BASE_URL}/api/chat`;
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const REPORT_PATH  = `./nora-report-${TIMESTAMP}.json`;
const SUMMARY_PATH = `./nora-summary-${TIMESTAMP}.md`;

if (!SECRET) {
  console.error("\nERROR: --secret is required.");
  console.error("  node audit-runner-sprint3.mjs --url https://your-app.vercel.app --secret your-secret\n");
  process.exit(1);
}

// ─── SCORING ─────────────────────────────────────────────────────────────────

function scoreResponse(query, responseText) {
  const text   = responseText.toLowerCase();
  const scores = {
    mustIncludeScore:   100,
    mustNotIncludeHits: [],
    citationPresent:    false,
    uncertaintySignal:  false,
    hallucinations:     [],
    issues:             [],
    compositeScore:     0,
    grade:              "FAIL",
  };

  const expected = query.expected;

  // 1. mustInclude — required concepts
  const mustInclude = expected.mustInclude ?? [];
  const found       = mustInclude.filter(t => text.includes(t.toLowerCase()));
  const missing     = mustInclude.filter(t => !text.includes(t.toLowerCase()));
  scores.mustIncludeScore = mustInclude.length > 0
    ? Math.round(found.length / mustInclude.length * 100)
    : 100;
  scores.foundTerms   = found;
  scores.missingTerms = missing;
  if (missing.length > 0) scores.issues.push(`Missing required terms: ${missing.join(", ")}`);

  // 2. mustNotInclude — forbidden concepts (hallucination / bad framing)
  const mustNotInclude = expected.mustNotInclude ?? [];
  scores.mustNotIncludeHits = mustNotInclude.filter(t => text.includes(t.toLowerCase()));
  if (scores.mustNotIncludeHits.length > 0) {
    scores.issues.push(`Forbidden terms found: ${scores.mustNotIncludeHits.join(", ")}`);
    scores.hallucinations.push(...scores.mustNotIncludeHits.map(t => `Used forbidden term: "${t}"`));
  }

  // 3. Citation check
  const citationPatterns = [
    /art(?:icle)?\.?\s*\d+/i, /§\s*\d+/, /section\s+\d+/i,
    /local law\s+\d+/i, /\d+\s+cfr/i, /recital\s+\d+/i, /annex\s+[ivx\d]+/i,
  ];
  scores.citationPresent = citationPatterns.some(p => p.test(responseText));
  if (expected.shouldCite && !scores.citationPresent) {
    scores.issues.push("Should cite specific articles but no citations found");
  }

  // 4. Uncertainty / admission signals for hallucination traps and out-of-scope
  const uncertaintySignals = [
    "i don't have", "i'm not able to", "i cannot", "not in my",
    "recommend consulting", "legal counsel", "qualified", "outside",
    "not certain", "i'm not sure", "cannot confirm", "may not be accurate",
    "does not exist", "not aware of", "no such", "hypothetical",
    "cannot give a legal opinion", "not legal advice", "not a lawyer",
    "no access to competitor", "cannot compare",
  ];
  scores.uncertaintySignal = uncertaintySignals.some(s => text.includes(s));

  if (expected.shouldAdmitUncertainty && !scores.uncertaintySignal) {
    scores.issues.push("Should admit uncertainty or redirect but did not");
    scores.hallucinations.push("Possible hallucination — answered authoritatively when uncertainty was required");
  }

  // 5. Red flag detection
  const triggeredRedFlags = (query.redFlags ?? []).filter(flag => {
    const f = flag.toLowerCase();
    if (f.includes("does not mention") || f.includes("misses")) {
      const subject = f.replace(/does not mention|misses/g, "").trim();
      return !text.includes(subject);
    }
    if (f.includes("states") && f.includes("instead of")) {
      return false;
    }
    if (f.includes("invents") || f.includes("fabricates")) {
      return false;
    }
    return false;
  });
  if (triggeredRedFlags.length > 0) {
    scores.issues.push(`Red flags: ${triggeredRedFlags.join("; ")}`);
  }

  // 6. Composite score
  let score = scores.mustIncludeScore * 0.5;
  if (expected.shouldCite) {
    score += scores.citationPresent ? 20 : 0;
    score += scores.mustNotIncludeHits.length === 0 ? 15 : 0;
    score += 15;
  } else if (expected.shouldAdmitUncertainty) {
    score += scores.uncertaintySignal ? 40 : 0;
    score += scores.mustNotIncludeHits.length === 0 ? 10 : 0;
  } else {
    score += scores.mustNotIncludeHits.length === 0 ? 30 : 0;
    score += scores.citationPresent ? 20 : 10;
  }

  scores.compositeScore = Math.min(100, Math.round(score));
  scores.grade =
    scores.compositeScore >= 85 ? "PASS" :
    scores.compositeScore >= 65 ? "REVIEW" : "FAIL";

  return scores;
}

// ─── REQUEST ─────────────────────────────────────────────────────────────────

async function runQuery(query) {
  console.log(`\n[${query.id}] ${query.label}`);
  console.log(`  Type: ${query.type}`);
  console.log(`  Message: "${query.message.slice(0, 80)}"`);

  const startTime = Date.now();

  try {
    const messages = [
      ...(query.context ? [{
        role: "assistant",
        content: `[Assessment context]: ${query.context}`,
      }] : []),
      { role: "user", content: query.message },
    ];

    const response = await fetch(ENDPOINT, {
      method:  "POST",
      headers: {
        "Content-Type":   "application/json",
        "x-audit-secret": SECRET,
      },
      body: JSON.stringify({ messages, message: query.message }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        queryId: query.id, status: "HTTP_ERROR",
        httpStatus: response.status, error: errText.slice(0, 300),
        latencyMs: Date.now() - startTime, scores: null,
      };
    }

    let responseText = "";
    try {
      responseText = await collectChatTextFromStream(response.body);
    } catch (streamErr) {
      console.log(`  ERROR: ${streamErr.message}`);
      return { queryId: query.id, status: "STREAM_ERROR", error: streamErr.message, latencyMs: Date.now() - startTime, scores: null };
    }

    const latencyMs = Date.now() - startTime;
    const scores    = scoreResponse(query, responseText);

    console.log(`  Grade: ${scores.grade} (${scores.compositeScore}/100) — ${latencyMs}ms`);
    console.log(`  Terms found: ${scores.mustIncludeScore}% | Citations: ${scores.citationPresent} | Uncertainty: ${scores.uncertaintySignal}`);
    if (scores.hallucinations.length > 0) console.log(`  ⚠ ${scores.hallucinations[0]}`);
    if (scores.missingTerms?.length > 0)  console.log(`  Missing: ${scores.missingTerms.slice(0, 3).join(", ")}`);

    return {
      queryId: query.id, label: query.label, type: query.type,
      message: query.message, context: query.context,
      status: "OK", latencyMs,
      responsePreview: responseText.slice(0, 500),
      fullResponse: responseText,
      scores,
    };

  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    return { queryId: query.id, status: "NETWORK_ERROR", error: err.message, latencyMs: Date.now() - startTime, scores: null };
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

  const byType = {};
  for (const r of valid) {
    if (!byType[r.type]) byType[r.type] = [];
    byType[r.type].push(r.scores.compositeScore);
  }
  const typeAvgs = Object.fromEntries(
    Object.entries(byType).map(([t, sc]) => [t, Math.round(sc.reduce((a, b) => a + b, 0) / sc.length)])
  );

  const totalHallucinations = valid.reduce((s, r) => s + (r.scores.hallucinations?.length ?? 0), 0);
  const allIssues           = valid.flatMap(r => r.scores.issues ?? []);

  return {
    runAt: new Date().toISOString(),
    endpoint: ENDPOINT,
    totalQueries: results.length,
    passed: passed.length, review: review.length,
    failed: failed.length, errors: errors.length,
    avgCompositeScore: avgScore,
    avgLatencyMs: avgLatency,
    byQueryType: typeAvgs,
    totalHallucinations,
    topIssues: allIssues.slice(0, 10),
    overallGrade:
      avgScore >= 85 ? "READY" :
      avgScore >= 70 ? "NEEDS WORK" : "NOT READY",
    results,
  };
}

function buildMarkdown(s) {
  const lines = [
    `# Norvar — Sprint 3 Nora Chat Quality Audit`,
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
    `| Hallucinations detected | ${s.totalHallucinations} |`,
    ``,
    `## By query type`,
    `| Type | Avg score |`,
    `|------|-----------|`,
    ...Object.entries(s.byQueryType).map(([t, sc]) => `| ${t} | ${sc}/100 |`),
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
    const sc = r.scores;
    lines.push(
      `### ${r.queryId} — ${r.label} (${r.type})`,
      `- **Grade:** ${sc.grade} | **Score:** ${sc.compositeScore}/100 | **Latency:** ${r.latencyMs}ms`,
      `- **Terms found:** ${sc.mustIncludeScore}% | **Citations:** ${sc.citationPresent} | **Uncertainty signal:** ${sc.uncertaintySignal}`,
    );
    if (sc.missingTerms?.length > 0)    lines.push(`- **Missing terms:** ${sc.missingTerms.join(", ")}`);
    if (sc.hallucinations?.length > 0)  lines.push(`- **⚠ Hallucinations:** ${sc.hallucinations.join("; ")}`);
    if (sc.issues?.length > 0)          lines.push(`- **Issues:** ${sc.issues.join(" | ")}`);
    lines.push(`- **Preview:** ${r.responsePreview?.slice(0, 250)}...`, ``);
  }

  lines.push(`---`, `*Generated by Norvar audit runner — sprint 3 (Nora)*`);
  return lines.join("\n");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   Norvar — Sprint 3: Nora Chat Quality Audit  ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`\nEndpoint: ${ENDPOINT}`);
  console.log(`Queries:  ${CHAT_QUERIES.length}`);
  console.log(`Delay:    ${DELAY_MS}ms between queries\n`);

  const results = [];
  for (let i = 0; i < CHAT_QUERIES.length; i++) {
    results.push(await runQuery(CHAT_QUERIES[i]));
    if (i < CHAT_QUERIES.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
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
    console.log(`  ${t.padEnd(18)} ${bar} ${sc}/100`);
  }
  console.log(`\nReports: ${REPORT_PATH} | ${SUMMARY_PATH}`);
}

main().catch(err => { console.error("\nFATAL:", err); process.exit(1); });
