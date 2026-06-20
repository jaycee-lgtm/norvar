#!/usr/bin/env node
// Norvar — Sprint 5: Nora Identity & Tone Audit Runner
// Usage: node audit-runner-sprint5.mjs --url https://your-app.vercel.app --secret your-secret

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { IDENTITY_QUERIES } = await import(join(__dirname, "queries-sprint5.js"));
const { collectChatTextFromStream } = await import(join(__dirname, "sse-parse.mjs"));

const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const BASE_URL  = get("--url")    || "http://localhost:3000";
const SECRET    = get("--secret") || process.env.AUDIT_SECRET || "";
const DELAY_MS  = parseInt(get("--delay") || "2000");
const ENDPOINT  = `${BASE_URL}/api/grc-chat`;
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const REPORT_PATH  = `./tone-report-${TIMESTAMP}.json`;
const SUMMARY_PATH = `./tone-summary-${TIMESTAMP}.md`;

if (!SECRET) {
  console.error("\nERROR: --secret is required.\n");
  process.exit(1);
}

// ─── SCORING ─────────────────────────────────────────────────────────────────

function scoreResponse(query, text) {
  const lower  = text.toLowerCase();
  const scores = { issues: [], redFlagsTriggered: [], compositeScore: 0, grade: "FAIL" };

  // 1. Length check
  const maxLen = query.expected.maxLength ?? 9999;
  scores.lengthOk = text.length <= maxLen;
  scores.actualLength = text.length;
  if (!scores.lengthOk) scores.issues.push(`Too long: ${text.length} chars (max ${maxLen})`);

  // 2. mustNotInclude
  const forbidden = (query.expected.mustNotInclude ?? []).filter(f => lower.includes(f.toLowerCase()));
  scores.forbiddenFound = forbidden;
  if (forbidden.length > 0) scores.issues.push(`Forbidden phrases: ${forbidden.join(" | ")}`);

  // 3. mustInclude
  const required = query.expected.mustInclude ?? [];
  const missing  = required.filter(r => !lower.includes(r.toLowerCase()));
  scores.missingRequired = missing;
  if (missing.length > 0) scores.issues.push(`Missing required: ${missing.join(", ")}`);

  // 4. Formatting check — detect bullets, bold headers, numbered lists
  const hasBullets  = /^[\s]*[-•*]\s/m.test(text);
  const hasBold     = /\*\*[^*]+\*\*/.test(text);
  const hasHeaders  = /^#{1,3}\s/m.test(text);
  const hasNumbered = /^\d+\.\s/m.test(text);
  scores.hasFormatting = hasBullets || hasBold || hasHeaders || hasNumbered;
  if (query.expected.shouldNotFormat && scores.hasFormatting) {
    scores.issues.push(`Unwanted formatting: bullets=${hasBullets} bold=${hasBold} headers=${hasHeaders} numbered=${hasNumbered}`);
  }

  // 5. Red flag detection
  scores.redFlagsTriggered = (query.redFlags ?? []).filter(flag => {
    const f = flag.toLowerCase();
    if (f.includes("says '") || f.includes('says "')) {
      const phrase = f.match(/says ['"]([^'"]+)['"]/)?.[1];
      return phrase ? lower.includes(phrase.toLowerCase()) : false;
    }
    if (f.includes("opens with")) {
      const phrase = f.match(/opens with ['"]([^'"]+)['"]/)?.[1];
      return phrase ? lower.startsWith(phrase.toLowerCase()) || text.toLowerCase().slice(0, 50).includes(phrase.toLowerCase()) : false;
    }
    if (f.includes("longer than") || f.includes("more than")) {
      const sentMatch = f.match(/(\d+)\s+sentence/);
      if (sentMatch) {
        const limit = parseInt(sentMatch[1]);
        const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10).length;
        return sentences > limit;
      }
    }
    if (f.includes("bullet")) return hasBullets;
    if (f.includes("bold header")) return hasBold && hasHeaders;
    return false;
  });

  if (scores.redFlagsTriggered.length > 0) {
    scores.issues.push(`Red flags: ${scores.redFlagsTriggered.slice(0, 2).join(" | ")}`);
  }

  // 6. Score
  let pts = 100;
  if (!scores.lengthOk)            pts -= 25;
  if (forbidden.length > 0)        pts -= forbidden.length * 15;
  if (missing.length > 0)          pts -= missing.length * 10;
  if (query.expected.shouldNotFormat && scores.hasFormatting) pts -= 20;
  if (scores.redFlagsTriggered.length > 0) pts -= scores.redFlagsTriggered.length * 10;

  scores.compositeScore = Math.max(0, pts);
  scores.grade = scores.compositeScore >= 85 ? "PASS" : scores.compositeScore >= 65 ? "REVIEW" : "FAIL";
  return scores;
}

// ─── REQUEST ─────────────────────────────────────────────────────────────────

async function runQuery(query) {
  console.log(`\n[${query.id}] ${query.label}`);
  console.log(`  "${query.message}"`);

  const startTime = Date.now();
  try {
    const response = await fetch(ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json", "x-audit-secret": SECRET },
      body:    JSON.stringify({ message: query.message }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.log(`  HTTP ${response.status}: ${err.slice(0, 120)}`);
      return { queryId: query.id, status: "HTTP_ERROR", httpStatus: response.status, error: err.slice(0, 300), latencyMs: Date.now() - startTime, scores: null };
    }

    let text = "";
    try {
      text = await collectChatTextFromStream(response.body);
    } catch (streamErr) {
      console.log(`  ERROR: ${streamErr.message}`);
      return { queryId: query.id, status: "STREAM_ERROR", error: streamErr.message, latencyMs: Date.now() - startTime, scores: null };
    }

    const latencyMs = Date.now() - startTime;
    const scores    = scoreResponse(query, text);

    const mark = scores.grade === "PASS" ? "✓" : scores.grade === "REVIEW" ? "~" : "✗";
    console.log(`  ${mark} ${scores.grade} (${scores.compositeScore}/100) — ${text.length} chars — ${latencyMs}ms`);
    if (scores.hasFormatting) console.log(`  ⚠ Contains formatting (bullets/bold/headers)`);
    if (scores.forbiddenFound?.length) console.log(`  ✗ Forbidden: ${scores.forbiddenFound.join(", ")}`);
    if (scores.redFlagsTriggered?.length) console.log(`  ✗ Red flags: ${scores.redFlagsTriggered[0]}`);
    console.log(`  Preview: "${text.slice(0, 120)}"`);

    return { queryId: query.id, label: query.label, type: query.type, message: query.message, status: "OK", latencyMs, responseText: text, scores };
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
  const formatted  = valid.filter(r => r.scores.hasFormatting).length;
  const byType = {};
  for (const r of valid) {
    if (!byType[r.type]) byType[r.type] = [];
    byType[r.type].push(r.scores.compositeScore);
  }
  const typeAvgs = Object.fromEntries(Object.entries(byType).map(([t, sc]) => [t, Math.round(sc.reduce((a,b)=>a+b,0)/sc.length)]));
  const allIssues = valid.flatMap(r => r.scores.issues ?? []);

  return {
    runAt: new Date().toISOString(), endpoint: ENDPOINT,
    totalQueries: results.length,
    passed: passed.length, review: review.length, failed: failed.length, errors: errors.length,
    avgCompositeScore: avgScore, avgLatencyMs: avgLatency,
    responsesWithFormatting: formatted,
    byQueryType: typeAvgs,
    topIssues: allIssues.slice(0, 10),
    overallGrade: avgScore >= 85 ? "READY" : avgScore >= 70 ? "NEEDS WORK" : "NOT READY",
    results,
  };
}

function buildMarkdown(s) {
  const lines = [
    `# Norvar — Sprint 5 Nora Identity & Tone Audit`,
    `**Run:** ${s.runAt}`,
    ``,
    `## Overall`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Grade | **${s.overallGrade}** |`,
    `| Avg score | ${s.avgCompositeScore}/100 |`,
    `| Pass / Review / Fail / Error | ${s.passed} / ${s.review} / ${s.failed} / ${s.errors} of ${s.totalQueries} |`,
    `| Responses with unwanted formatting | ${s.responsesWithFormatting} |`,
    `| Avg latency | ${s.avgLatencyMs}ms |`,
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
    if (!r.scores) { lines.push(`### ${r.queryId} — ERROR`, `- ${r.error}`, ``); continue; }
    const sc = r.scores;
    lines.push(
      `### ${r.queryId} — ${r.label} (${r.type})`,
      `- **Grade:** ${sc.grade} | **Score:** ${sc.compositeScore}/100 | **Length:** ${sc.actualLength} chars (max ${queryMaxLength(r)})`,
      `- **Formatting:** ${sc.hasFormatting ? "⚠ YES" : "clean"} | **Forbidden phrases:** ${sc.forbiddenFound?.length ?? 0}`,
    );
    if (sc.issues?.length) lines.push(`- **Issues:** ${sc.issues.join(" | ")}`);
    lines.push(`- **Response:** "${r.responseText?.slice(0, 300)}..."`, ``);
  }

  lines.push(`---`, `*Generated by Norvar audit runner — sprint 5 (Nora tone)*`);
  return lines.join("\n");
}

function queryMaxLength(r) {
  const q = IDENTITY_QUERIES.find(x => x.id === r.queryId);
  return q?.expected?.maxLength ?? "?";
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  Norvar — Sprint 5: Nora Identity & Tone Audit   ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nEndpoint: ${ENDPOINT}`);
  console.log(`Queries:  ${IDENTITY_QUERIES.length}`);
  console.log(`Delay:    ${DELAY_MS}ms\n`);

  const results = [];
  for (let i = 0; i < IDENTITY_QUERIES.length; i++) {
    results.push(await runQuery(IDENTITY_QUERIES[i]));
    if (i < IDENTITY_QUERIES.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
  }

  const summary  = buildSummary(results);
  const markdown = buildMarkdown(summary);
  writeFileSync(REPORT_PATH,  JSON.stringify(summary, null, 2));
  writeFileSync(SUMMARY_PATH, markdown);

  console.log("\n\n╔══════════════════════════════════════════════════╗");
  console.log("║                  AUDIT COMPLETE                   ║");
  console.log("╚══════════════════════════════════════════════════╝");
  console.log(`\nOverall grade:       ${summary.overallGrade}`);
  console.log(`Avg score:           ${summary.avgCompositeScore}/100`);
  console.log(`Pass/Review/Fail:    ${summary.passed}/${summary.review}/${summary.failed}`);
  console.log(`With formatting:     ${summary.responsesWithFormatting} responses`);
  console.log(`\nBy type:`);
  for (const [t, sc] of Object.entries(summary.byQueryType)) {
    const bar = "█".repeat(Math.round(sc/10)) + "░".repeat(10 - Math.round(sc/10));
    console.log(`  ${t.padEnd(12)} ${bar} ${sc}/100`);
  }
  console.log(`\nReports: ${REPORT_PATH} | ${SUMMARY_PATH}`);
}

main().catch(err => { console.error("\nFATAL:", err); process.exit(1); });
