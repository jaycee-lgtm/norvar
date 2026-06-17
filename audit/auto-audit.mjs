#!/usr/bin/env node
// Norvar — Auto Audit Orchestrator
// Runs all 7 audit sprints, emails a report after each sprint completes,
// then sends a final summary email.
//
// Usage:
//   node auto-audit.mjs --url https://norvar.io --secret norvar-audit-2026 --email jesse@norvar.io
//
// Schedule (cron examples):
//   0 6  * * * cd /path/to/audit && node auto-audit.mjs --url ... --secret ... --email ...
//   0 18 * * * cd /path/to/audit && node auto-audit.mjs --url ... --secret ... --email ...
//
// Environment (optional):
//   RESEND_API_KEY  — send email directly via Resend
//   AUDIT_FROM      — from address for audit emails

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync, statSync } from "fs";
import { spawn } from "child_process";
import { sendAuditEmail } from "./email-notify.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const get  = (flag) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : null; };

const BASE_URL    = get("--url")    || "http://localhost:3000";
const SECRET      = get("--secret") || process.env.AUDIT_SECRET || "";
const EMAIL       = get("--email")  || process.env.AUDIT_EMAIL  || "";
const RUN_SPRINTS = (get("--sprints") || "1,2,3,4,5,6,7").split(",").map(Number);
const FAST_MODE   = args.includes("--fast");
const REPORT_DIR  = get("--report-dir") || __dirname;

const TIMESTAMP   = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const REPORT_JSON = join(REPORT_DIR, `auto-audit-${TIMESTAMP}.json`);
const REPORT_MD   = join(REPORT_DIR, `auto-audit-${TIMESTAMP}.md`);

const THRESHOLDS = { PASS: 85, REVIEW: 70 };

const SPRINTS = [
  { id: 1, name: "Cassius — Query Quality",           agent: "Cassius", script: "audit-runner.mjs",           reportPrefix: "audit-report-",  fastArgs: [] },
  { id: 2, name: "Context Inference",                 agent: "Infer",   script: "audit-runner-sprint2.mjs",   reportPrefix: "infer-report-",  fastArgs: [] },
  { id: 3, name: "Nora — Chat Quality & Grounding",     agent: "Nora",    script: "audit-runner-sprint3.mjs",   reportPrefix: "nora-report-",   fastArgs: [] },
  { id: 4, name: "Cassius — Risk Tier Accuracy",        agent: "Cassius", script: "audit-runner-sprint4.mjs",   reportPrefix: "tier-report-",   fastArgs: [] },
  { id: 5, name: "Nora — Identity & Tone",              agent: "Nora",    script: "audit-runner-sprint5.mjs",   reportPrefix: "tone-report-",   fastArgs: [] },
  { id: 6, name: "Varro — Redline Quality",             agent: "Varro",   script: "audit-runner-sprint6.mjs",   reportPrefix: "varro-report-",  fastArgs: [] },
  { id: 7, name: "Petra — Draft Quality",               agent: "Petra",   script: "audit-runner-sprint7.mjs",   reportPrefix: "petra-report-",  fastArgs: [] },
];

if (!SECRET) {
  console.error("\nERROR: --secret is required.\n");
  process.exit(1);
}

function listReports(prefix) {
  if (!existsSync(REPORT_DIR)) return new Set();
  return new Set(
    readdirSync(REPORT_DIR)
      .filter(f => f.startsWith(prefix) && f.endsWith(".json")),
  );
}

function findNewReport(prefix, before) {
  const after = [...listReports(prefix)].filter(f => !before.has(f));
  if (after.length === 0) return null;

  const sorted = after
    .map(f => ({ f, m: statSync(join(REPORT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);

  try {
    return JSON.parse(readFileSync(join(REPORT_DIR, sorted[0].f), "utf8"));
  } catch {
    return null;
  }
}

function normalizeSprintResult(report) {
  const score = report?.avgCompositeScore ?? 0;
  const grade = report?.overallGrade ?? "UNKNOWN";
  const passed = report?.passed ?? 0;
  const total  = report?.totalQueries ?? 0;

  let status = "FAIL";
  if (score >= THRESHOLDS.PASS || grade === "READY" || grade === "PASS") status = "PASS";
  else if (score >= THRESHOLDS.REVIEW || grade === "NEEDS WORK" || grade === "REVIEW") status = "REVIEW";

  return { score, grade, status, passed, total, report };
}

function runRunner(script, extraArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [join(__dirname, script), "--url", BASE_URL, "--secret", SECRET, ...extraArgs],
      { cwd: __dirname, stdio: "inherit", env: process.env },
    );
    child.on("error", reject);
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`${script} exited with code ${code}`));
    });
  });
}

function sprintEmailBody(sprint, result, durationSec) {
  const icon = result.status === "PASS" ? "✅" : result.status === "REVIEW" ? "⚠️" : "🔴";
  return `${icon} Sprint ${sprint.id} complete — ${sprint.name}

Agent:    ${sprint.agent}
Grade:    ${result.grade}
Score:    ${result.score}/100
Passed:   ${result.passed}/${result.total} queries
Duration: ${durationSec}s
Target:   ${BASE_URL}

${result.status === "FAIL" ? "This sprint needs attention before the next scheduled run." : "Sprint finished successfully."}
`;
}

function remediationHints(sprint, result) {
  if (result.status === "PASS") return [];

  const hints = [];
  if (sprint.id === 2) {
    hints.push({ agent: "Infer", description: "Review /api/infer prompt — jurisdiction detection and confidence thresholds." });
  }
  if (sprint.id === 3 || sprint.id === 5) {
    hints.push({ agent: "Nora", description: `Nora score ${result.score}/100 — review GRC prompt tone, brevity, and corpus grounding rules.` });
  }
  if (sprint.id === 4) {
    hints.push({ agent: "Cassius", description: "Review deriveRiskFromGaps() and Cassius severity calibration against regulatory high-risk categories." });
  }
  if (sprint.id === 6) {
    hints.push({ agent: "Varro", description: "Review redline prompts — status derivation, corpus citations, and suggested clause text quality." });
  }
  if (sprint.id === 7) {
    hints.push({ agent: "Petra", description: "Review draft prompts — section completeness, placeholder avoidance, and framework citations." });
  }
  return hints;
}

function buildSummary(sprintResults, allRemediation) {
  const totalQueries = sprintResults.reduce((n, s) => n + s.total, 0);
  const totalPassed  = sprintResults.reduce((n, s) => n + s.passed, 0);
  const avgScore     = sprintResults.length
    ? Math.round(sprintResults.reduce((n, s) => n + s.score, 0) / sprintResults.length)
    : 0;

  const overallGrade = avgScore >= THRESHOLDS.PASS ? "HEALTHY"
    : avgScore >= THRESHOLDS.REVIEW ? "DEGRADED" : "CRITICAL";

  const agentScores = {};
  for (const s of sprintResults) {
    if (!agentScores[s.agent]) agentScores[s.agent] = [];
    agentScores[s.agent].push(s.score);
  }
  const agentHealth = Object.fromEntries(
    Object.entries(agentScores).map(([agent, scores]) => [
      agent,
      Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    ]),
  );

  return {
    runAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    fastMode: FAST_MODE,
    overallGrade,
    avgScore,
    totalQueries,
    totalPassed,
    sprintResults,
    agentHealth,
    remediationActions: allRemediation,
  };
}

function buildMarkdown(summary) {
  const gradeEmoji = { HEALTHY: "✅", DEGRADED: "⚠️", CRITICAL: "🔴" };
  const lines = [
    `# Norvar Auto Audit Report`,
    `**${summary.runAt}**`,
    ``,
    `## Overall Health: ${gradeEmoji[summary.overallGrade] ?? ""} ${summary.overallGrade}`,
    `**Avg score:** ${summary.avgScore}/100  |  **Passed:** ${summary.totalPassed}/${summary.totalQueries} queries`,
    ``,
    `## Agent Health`,
    `| Agent | Score |`,
    `|-------|-------|`,
    ...Object.entries(summary.agentHealth).map(([agent, score]) => `| ${agent} | ${score}/100 |`),
    ``,
    `## Sprint Results`,
    `| Sprint | Name | Score | Grade | Pass/Total |`,
    `|--------|------|-------|-------|------------|`,
    ...summary.sprintResults.map(s =>
      `| S${s.sprintId} | ${s.name} | ${s.score}/100 | ${s.grade} | ${s.passed}/${s.total} |`,
    ),
  ];

  if (summary.remediationActions.length > 0) {
    lines.push("", "## Remediation", "");
    for (const a of summary.remediationActions) {
      lines.push(`- **[${a.agent}]** ${a.description}`);
    }
  }

  lines.push("", "---", `*Norvar Auto Audit — ${summary.runAt}*`);
  return lines.join("\n");
}

function buildFinalEmailBody(summary) {
  const emoji = { HEALTHY: "✅", DEGRADED: "⚠️", CRITICAL: "🔴" }[summary.overallGrade] ?? "";
  const agentLines = Object.entries(summary.agentHealth)
    .map(([agent, score]) => `  ${agent.padEnd(10)} ${score}/100`)
    .join("\n");
  const sprintLines = summary.sprintResults
    .map(s => `  S${s.sprintId} ${s.name.padEnd(35)} ${s.score}/100 (${s.passed}/${s.total}) ${s.grade}`)
    .join("\n");
  const remLines = summary.remediationActions.length
    ? summary.remediationActions.map(a => `  [${a.agent}] ${a.description}`).join("\n")
    : "  None required.";

  return `${emoji} Norvar audit complete — ${summary.overallGrade} (${summary.avgScore}/100)

AGENT HEALTH
${agentLines}

SPRINT RESULTS
${sprintLines}

REMEDIATION
${remLines}

Run at: ${summary.runAt}
Queries: ${summary.totalPassed}/${summary.totalQueries} passed
Target: ${summary.baseUrl}
`;
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║         Norvar — Auto Audit Orchestrator             ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`\nTarget:   ${BASE_URL}`);
  console.log(`Sprints:  ${RUN_SPRINTS.join(", ")}`);
  console.log(`Mode:     ${FAST_MODE ? "Fast" : "Full"}`);
  console.log(`Email:    ${EMAIL || "not configured"}`);
  console.log(`Started:  ${new Date().toISOString()}\n`);

  if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });

  const sprintResults  = [];
  const allRemediation = [];

  for (const sprintId of RUN_SPRINTS) {
    const sprint = SPRINTS.find(s => s.id === sprintId);
    if (!sprint) {
      console.log(`\nSprint ${sprintId} — not configured, skipping`);
      continue;
    }

    console.log(`\n${"─".repeat(56)}`);
    console.log(`Sprint ${sprint.id}: ${sprint.name}`);
    console.log(`Agent: ${sprint.agent}  |  Runner: ${sprint.script}`);
    console.log(`${"─".repeat(56)}`);

    const before = listReports(sprint.reportPrefix);
    const start  = Date.now();
    let exitError = null;

    try {
      await runRunner(sprint.script, FAST_MODE ? sprint.fastArgs : []);
    } catch (err) {
      exitError = err.message;
      console.log(`\n  ⚠ Runner error: ${err.message}`);
    }

    const durationSec = Math.round((Date.now() - start) / 1000);
    const report      = findNewReport(sprint.reportPrefix, before);
    const normalized  = report
      ? normalizeSprintResult(report)
      : { score: 0, grade: "ERROR", status: "FAIL", passed: 0, total: 0, report: null };

    const entry = {
      sprintId: sprint.id,
      name:     sprint.name,
      agent:    sprint.agent,
      ...normalized,
      durationSec,
      error:    exitError,
      reportPath: report ? sprint.reportPrefix : null,
    };
    sprintResults.push(entry);

    const icon = normalized.status === "PASS" ? "✅" : normalized.status === "REVIEW" ? "⚠️" : "🔴";
    console.log(`\n  ${icon} Sprint ${sprint.id}: ${normalized.grade} (${normalized.score}/100) — ${durationSec}s`);

    if (normalized.status !== "PASS") {
      allRemediation.push(...remediationHints(sprint, normalized));
    }

    const sprintSubject = `[Norvar Audit] Sprint ${sprint.id} — ${normalized.grade} (${normalized.score}/100)`;
    const sprintBody    = sprintEmailBody(sprint, normalized, durationSec);
    await sendAuditEmail({
      to:        EMAIL,
      subject:   sprintSubject,
      body:      sprintBody,
      baseUrl:   BASE_URL,
      secret:    SECRET,
      reportDir: REPORT_DIR,
      timestamp: `${TIMESTAMP}-s${sprint.id}`,
    });
  }

  const summary  = buildSummary(sprintResults, allRemediation);
  const markdown = buildMarkdown(summary);

  writeFileSync(REPORT_JSON, JSON.stringify(summary, null, 2));
  writeFileSync(REPORT_MD, markdown);

  const finalSubject = `[Norvar Audit] ${summary.overallGrade} — ${summary.avgScore}/100 — ${new Date().toLocaleDateString()}`;
  const finalBody    = buildFinalEmailBody(summary);
  await sendAuditEmail({
    to:        EMAIL,
    subject:   finalSubject,
    body:      finalBody,
    baseUrl:   BASE_URL,
    secret:    SECRET,
    reportDir: REPORT_DIR,
    timestamp: TIMESTAMP,
  });

  console.log(`\n\n╔══════════════════════════════════════════════════════╗`);
  console.log(`║                  AUDIT COMPLETE                       ║`);
  console.log(`╚══════════════════════════════════════════════════════╝`);
  console.log(`\nOverall health:  ${summary.overallGrade}`);
  console.log(`Avg score:       ${summary.avgScore}/100`);
  console.log(`Queries:         ${summary.totalPassed}/${summary.totalQueries} passed`);
  console.log(`\nAgent health:`);
  for (const [agent, score] of Object.entries(summary.agentHealth)) {
    const bar  = "█".repeat(Math.round(score / 10)) + "░".repeat(10 - Math.round(score / 10));
    const icon = score >= THRESHOLDS.PASS ? "✅" : score >= THRESHOLDS.REVIEW ? "⚠️" : "🔴";
    console.log(`  ${icon} ${agent.padEnd(12)} ${bar} ${score}/100`);
  }
  console.log(`\nReports: ${REPORT_JSON}`);
  console.log(`         ${REPORT_MD}`);

  if (summary.overallGrade === "CRITICAL") process.exit(1);
}

main().catch(err => { console.error("\nFATAL:", err); process.exit(1); });
