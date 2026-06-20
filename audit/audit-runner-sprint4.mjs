#!/usr/bin/env node
// Norvar — Sprint 4: Risk Tier Accuracy Audit Runner
// Usage: node audit-runner-sprint4.mjs --url https://your-app.vercel.app --secret your-secret

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { TIER_QUERIES } = await import(join(__dirname, "queries-sprint4.js"));
const { collectAssessmentFromStream } = await import(join(__dirname, "sse-parse.mjs"));

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const BASE_URL  = get("--url")    || "http://localhost:3000";
const SECRET    = get("--secret") || process.env.AUDIT_SECRET || "";
const DELAY_MS  = parseInt(get("--delay") || "3000");
const ENDPOINT  = `${BASE_URL}/api/assess`;
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const REPORT_PATH  = `./tier-report-${TIMESTAMP}.json`;
const SUMMARY_PATH = `./tier-summary-${TIMESTAMP}.md`;

if (!SECRET) {
  console.error("\nERROR: --secret is required.");
  console.error("  node audit-runner-sprint4.mjs --url https://your-app.vercel.app --secret your-secret\n");
  process.exit(1);
}

const TIER_RANK = { high: 3, medium: 2, low: 1 };

function normalizeTier(tier) {
  const t = (tier ?? "unknown").toLowerCase();
  return t === "critical" ? "high" : t;
}

function normalizeSeverity(sev) {
  const s = (sev ?? "").toLowerCase();
  return s === "critical" ? "high" : s;
}

// ─── SCORING ─────────────────────────────────────────────────────────────────

function scoreTier(query, assessment) {
  const scores = {
    tierMatch:       false,
    tierDirection:   null,
    domainAccuracy:  {},
    frameworkCoverage: 0,
    conceptCoverage:   0,
    gapCountOk:      true,
    consistencyOk:   true,
    issues:          [],
    compositeScore:  0,
    grade:           "FAIL",
  };

  const actual   = normalizeTier(assessment?.risk_tier);
  const expected = query.expected.overall;

  scores.tierMatch = actual === expected;
  if (actual === expected) {
    scores.tierDirection = "correct";
  } else if (TIER_RANK[actual] > TIER_RANK[expected]) {
    scores.tierDirection = "too_high";
    scores.issues.push(`Tier too high: got ${actual}, expected ${expected}`);
  } else if (TIER_RANK[actual] < TIER_RANK[expected]) {
    scores.tierDirection = "too_low";
    scores.issues.push(`Tier too low: got ${actual}, expected ${expected}`);
  }

  const byDomain = assessment?.risk_by_domain ?? {};
  for (const [domain, expected_tiers] of Object.entries(query.expected.domains)) {
    const actual_domain_tier = normalizeTier(byDomain[domain]?.tier);
    const match = expected_tiers.includes(actual_domain_tier);
    scores.domainAccuracy[domain] = {
      expected: expected_tiers,
      actual:   actual_domain_tier,
      match,
    };
    if (!match) {
      scores.issues.push(`${domain} domain tier wrong: got ${actual_domain_tier}, expected one of [${expected_tiers.join(", ")}]`);
    }
  }

  const gaps = assessment?.gaps ?? [];
  const allText = [
    assessment?.summary ?? "",
    ...gaps.map(g => `${g.title} ${g.detail} ${(g.frameworks ?? []).join(" ")}`),
  ].join(" ").toLowerCase();

  const mustFlag   = query.expected.mustFlagFrameworks ?? [];
  const foundFW    = mustFlag.filter(f => allText.includes(f.toLowerCase()));
  const missingFW  = mustFlag.filter(f => !allText.includes(f.toLowerCase()));
  scores.frameworkCoverage = mustFlag.length > 0
    ? Math.round(foundFW.length / mustFlag.length * 100) : 100;
  scores.missingFrameworks = missingFW;
  if (missingFW.length > 0) scores.issues.push(`Missing frameworks: ${missingFW.join(", ")}`);

  const mustConcepts  = query.expected.mustFlagConcepts ?? [];
  const foundC        = mustConcepts.filter(c => allText.includes(c.toLowerCase()));
  const missingC      = mustConcepts.filter(c => !allText.includes(c.toLowerCase()));
  scores.conceptCoverage = mustConcepts.length > 0
    ? Math.round(foundC.length / mustConcepts.length * 100) : 100;
  scores.missingConcepts = missingC;
  if (missingC.length > 0) scores.issues.push(`Missing concepts: ${missingC.join(", ")}`);

  const minGaps = query.expected.minGaps ?? 0;
  const maxGaps = query.expected.maxGaps ?? 999;
  scores.gapCount  = gaps.length;
  scores.gapCountOk = gaps.length >= minGaps && gaps.length <= maxGaps;
  if (!scores.gapCountOk) {
    scores.issues.push(`Gap count ${gaps.length} outside expected range [${minGaps}–${maxGaps === 999 ? "∞" : maxGaps}]`);
  }

  const severities = gaps.map(g => normalizeSeverity(g.severity));
  if (actual === "high" && !severities.includes("high")) {
    scores.consistencyOk = false;
    scores.issues.push("Inconsistent: tier=high but no high-severity gap identified");
  }
  if (actual === "low" && severities.some(s => ["medium", "high"].includes(s))) {
    scores.consistencyOk = false;
    scores.issues.push("Inconsistent: tier=low but medium/high gaps present");
  }

  const tierPoints    = scores.tierMatch ? 40 : (Math.abs(TIER_RANK[actual] - TIER_RANK[expected]) === 1 ? 15 : 0);
  const domainPoints  = Object.values(scores.domainAccuracy).filter(d => d.match).length /
                        Math.max(Object.keys(scores.domainAccuracy).length, 1) * 20;
  const fwPoints      = scores.frameworkCoverage * 0.15;
  const conceptPoints = scores.conceptCoverage   * 0.10;
  const consistPoints = scores.consistencyOk ? 10 : 0;
  const gapPoints     = scores.gapCountOk ? 5 : 0;

  scores.compositeScore = Math.min(100, Math.round(tierPoints + domainPoints + fwPoints + conceptPoints + consistPoints + gapPoints));
  scores.grade = scores.compositeScore >= 85 ? "PASS" :
                 scores.compositeScore >= 65 ? "REVIEW" : "FAIL";

  return scores;
}

// ─── REQUEST ─────────────────────────────────────────────────────────────────

async function runQuery(query) {
  console.log(`\n[${query.id}] ${query.label}`);
  console.log(`  Expected tier: ${query.expected.overall.toUpperCase()}`);

  const startTime = Date.now();

  try {
    const response = await fetch(ENDPOINT, {
      method:  "POST",
      headers: {
        "Content-Type":   "application/json",
        "x-audit-secret": SECRET,
      },
      body: JSON.stringify({
        description: query.description,
        domains:     [],
        message:     query.description,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        queryId: query.id, status: "HTTP_ERROR",
        httpStatus: response.status, error: errText.slice(0, 300),
        latencyMs: Date.now() - startTime, scores: null,
      };
    }

    let assessment = null;
    try {
      assessment = await collectAssessmentFromStream(response.body);
    } catch (streamErr) {
      console.log(`  ERROR: ${streamErr.message}`);
      return { queryId: query.id, status: "STREAM_ERROR", error: streamErr.message, latencyMs: Date.now() - startTime, scores: null };
    }

    const latencyMs = Date.now() - startTime;

    if (!assessment) {
      return { queryId: query.id, status: "NO_ASSESSMENT", latencyMs, scores: null };
    }

    const scores = scoreTier(query, assessment);

    const tierEmoji = scores.tierMatch ? "✓" : scores.tierDirection === "too_high" ? "↑" : "↓";
    console.log(`  ${tierEmoji} Tier: ${assessment.risk_tier?.toUpperCase() ?? "UNKNOWN"} (expected ${query.expected.overall.toUpperCase()}) — ${scores.grade} (${scores.compositeScore}/100) — ${latencyMs}ms`);

    for (const [dom, d] of Object.entries(scores.domainAccuracy)) {
      const ok = d.match ? "✓" : "✗";
      console.log(`    ${ok} ${dom.padEnd(14)} ${d.actual} (exp: ${d.expected.join("|")})`);
    }

    if (!scores.consistencyOk) console.log(`  ⚠ INCONSISTENT: tier does not match gap severities`);
    if (scores.missingFrameworks?.length > 0) console.log(`  Missing FW: ${scores.missingFrameworks.join(", ")}`);

    return {
      queryId:     query.id,
      label:       query.label,
      type:        query.type,
      description: query.description.slice(0, 200),
      status:      "OK",
      latencyMs,
      actualTier:    assessment.risk_tier,
      expectedTier:  query.expected.overall,
      actualDomains: assessment.risk_by_domain,
      gapCount:      assessment.gaps?.length ?? 0,
      gaps:          (assessment.gaps ?? []).map(g => ({ title: g.title, severity: g.severity, domain: g.domain })),
      scores,
      notes: query.notes ?? null,
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

  const tierCorrect  = valid.filter(r => r.scores.tierMatch).length;
  const tooHigh      = valid.filter(r => r.scores.tierDirection === "too_high").length;
  const tooLow       = valid.filter(r => r.scores.tierDirection === "too_low").length;
  const inconsistent = valid.filter(r => !r.scores.consistencyOk).length;

  const avgScore   = valid.length > 0 ? Math.round(valid.reduce((s, r) => s + r.scores.compositeScore, 0) / valid.length) : 0;
  const avgLatency = valid.length > 0 ? Math.round(valid.reduce((s, r) => s + r.latencyMs, 0) / valid.length) : 0;

  const byTier = {};
  for (const r of valid) {
    const t = r.expectedTier;
    if (!byTier[t]) byTier[t] = { total: 0, correct: 0 };
    byTier[t].total++;
    if (r.scores.tierMatch) byTier[t].correct++;
  }

  return {
    runAt: new Date().toISOString(),
    endpoint: ENDPOINT,
    totalQueries: results.length,
    passed: passed.length, review: review.length,
    failed: failed.length, errors: errors.length,
    avgCompositeScore: avgScore,
    avgLatencyMs: avgLatency,
    tierAccuracy: { correct: tierCorrect, tooHigh, tooLow, total: valid.length },
    byExpectedTier: byTier,
    inconsistentAssessments: inconsistent,
    overallGrade:
      avgScore >= 85 ? "READY" :
      avgScore >= 70 ? "NEEDS WORK" : "NOT READY",
    results,
  };
}

function buildMarkdown(s) {
  const { tierAccuracy: ta } = s;
  const lines = [
    `# Norvar — Sprint 4 Risk Tier Accuracy Audit (Cassius)`,
    `**Run:** ${s.runAt}  |  **Endpoint:** ${s.endpoint}`,
    ``,
    `## Overall`,
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Grade | **${s.overallGrade}** |`,
    `| Avg score | ${s.avgCompositeScore}/100 |`,
    `| Pass / Review / Fail / Error | ${s.passed} / ${s.review} / ${s.failed} / ${s.errors} of ${s.totalQueries} |`,
    `| Tier accuracy | ${ta.correct}/${ta.total} correct (${ta.tooHigh} too high, ${ta.tooLow} too low) |`,
    `| Inconsistent assessments | ${s.inconsistentAssessments} (tier doesn't match gap severities) |`,
    `| Avg latency | ${s.avgLatencyMs}ms |`,
    ``,
    `## Accuracy by expected tier`,
    `| Tier | Correct | Total | % |`,
    `|------|---------|-------|---|`,
    ...Object.entries(s.byExpectedTier).map(([t, d]) =>
      `| ${t} | ${d.correct} | ${d.total} | ${Math.round(d.correct/d.total*100)}% |`
    ),
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
    const tierMark = sc.tierMatch ? "✓" : sc.tierDirection === "too_high" ? "↑ too high" : "↓ too low";
    lines.push(
      `### ${r.queryId} — ${r.label} (expected: ${r.expectedTier})`,
      `- **Grade:** ${sc.grade} | **Score:** ${sc.compositeScore}/100 | **Tier:** ${r.actualTier} ${tierMark} | **Latency:** ${r.latencyMs}ms`,
      `- **Gaps found:** ${r.gapCount} | **Consistent:** ${sc.consistencyOk ? "Yes" : "No"} | **Frameworks:** ${sc.frameworkCoverage}% | **Concepts:** ${sc.conceptCoverage}%`,
    );
    for (const [dom, d] of Object.entries(sc.domainAccuracy)) {
      lines.push(`- ${d.match ? "✓" : "✗"} ${dom}: got \`${d.actual}\` (expected \`${d.expected.join("|")}\`)`);
    }
    if (sc.missingFrameworks?.length > 0) lines.push(`- Missing frameworks: ${sc.missingFrameworks.join(", ")}`);
    if (sc.missingConcepts?.length > 0)   lines.push(`- Missing concepts: ${sc.missingConcepts.join(", ")}`);
    if (sc.issues?.length > 0)             lines.push(`- Issues: ${sc.issues.slice(0,3).join(" | ")}`);
    if (r.notes)                           lines.push(`- *${r.notes}*`);
    lines.push(`- Gaps: ${r.gaps?.map(g => `${g.severity}/${g.domain}: ${g.title}`).slice(0,3).join(" | ")}`, ``);
  }

  lines.push(`---`, `*Generated by Norvar audit runner — sprint 4 (Cassius)*`);
  return lines.join("\n");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║  Norvar — Sprint 4: Risk Tier Accuracy Audit  ║");
  console.log("║  Agent: Cassius                               ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log(`\nEndpoint: ${ENDPOINT}`);
  console.log(`Queries:  ${TIER_QUERIES.length}`);
  console.log(`Delay:    ${DELAY_MS}ms between queries\n`);

  const results = [];
  for (let i = 0; i < TIER_QUERIES.length; i++) {
    results.push(await runQuery(TIER_QUERIES[i]));
    if (i < TIER_QUERIES.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
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
  console.log(`\nTier accuracy:  ${summary.tierAccuracy.correct}/${summary.tierAccuracy.total} correct`);
  console.log(`  Too high:     ${summary.tierAccuracy.tooHigh}`);
  console.log(`  Too low:      ${summary.tierAccuracy.tooLow}`);
  console.log(`  Inconsistent: ${summary.inconsistentAssessments}`);
  console.log(`\nBy expected tier:`);
  for (const [t, d] of Object.entries(summary.byExpectedTier)) {
    const bar = "█".repeat(Math.round(d.correct/d.total*10)) + "░".repeat(10 - Math.round(d.correct/d.total*10));
    console.log(`  ${t.padEnd(10)} ${bar} ${d.correct}/${d.total} (${Math.round(d.correct/d.total*100)}%)`);
  }
  console.log(`\nReports: ${REPORT_PATH} | ${SUMMARY_PATH}`);
}

main().catch(err => { console.error("\nFATAL:", err); process.exit(1); });
