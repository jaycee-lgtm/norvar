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
import {
  buildSprintDetail,
  formatSprintEmailBody,
  formatFinalEmailBody,
  buildDetailedMarkdown,
  buildAgentsTestedSummary,
} from "./report-detail.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnvFile(filename) {
  const path = join(dirname(__dirname), filename);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i <= 0) continue;
    const key = trimmed.slice(0, i).trim();
    const val = trimmed.slice(i + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(".env.local");
loadEnvFile(".env");

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
  { id: 3, name: "Nora — Chat Quality & Grounding",   agent: "Nora",    script: "audit-runner-sprint3.mjs",   reportPrefix: "nora-report-",   fastArgs: [] },
  { id: 4, name: "Cassius — Risk Tier Accuracy",      agent: "Cassius", script: "audit-runner-sprint4.mjs",   reportPrefix: "tier-report-",   fastArgs: [] },
  { id: 5, name: "Nora — Identity & Tone",            agent: "Nora",    script: "audit-runner-sprint5.mjs",   reportPrefix: "tone-report-",   fastArgs: [] },
  { id: 6, name: "Varro — Redline Quality",           agent: "Varro",   script: "audit-runner-sprint6.mjs",   reportPrefix: "varro-report-",  fastArgs: [] },
  { id: 7, name: "Petra — Draft Quality",             agent: "Petra",   script: "audit-runner-sprint7.mjs",   reportPrefix: "petra-report-",  fastArgs: [] },
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

function buildSummary(sprintResults, sprintDetails) {
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

  const needsManualRemediation = sprintDetails.flatMap(d => d.detail.granularRemediation ?? []);

  return {
    runAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    fastMode: FAST_MODE,
    overallGrade,
    avgScore,
    totalQueries,
    totalPassed,
    sprintResults,
    sprintDetails: sprintDetails.map(({ sprintId, detail }) => ({ sprintId, ...detail })),
    agentHealth,
    agentsTested: buildAgentsTestedSummary(sprintResults, sprintDetails),
    autoRemediated: sprintDetails.flatMap(d => d.detail.autoRemediated),
    needsManualRemediation,
  };
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
  const sprintDetails  = [];

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

    const detail = buildSprintDetail(sprint, report);
    sprintDetails.push({ sprintId: sprint.id, detail });

    const icon = normalized.status === "PASS" ? "✅" : normalized.status === "REVIEW" ? "⚠️" : "🔴";
    console.log(`\n  ${icon} Sprint ${sprint.id}: ${normalized.grade} (${normalized.score}/100) — ${durationSec}s`);

    if (detail.needsManualRemediation.length) {
      console.log(`  Manual remediation items: ${detail.needsManualRemediation.length}`);
    }

    const sprintSubject = `[Norvar Audit] Sprint ${sprint.id} — ${normalized.grade} (${normalized.score}/100)`;
    const sprintBody    = formatSprintEmailBody(sprint, entry, detail);
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

  const summary  = buildSummary(sprintResults, sprintDetails);
  const markdown = buildDetailedMarkdown(summary, sprintDetails);

  writeFileSync(REPORT_JSON, JSON.stringify(summary, null, 2));
  writeFileSync(REPORT_MD, markdown);

  const finalSubject = `[Norvar Audit] ${summary.overallGrade} — ${summary.avgScore}/100 — ${new Date().toLocaleDateString()}`;
  const finalBody    = formatFinalEmailBody(summary, sprintDetails);
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
  if (summary.needsManualRemediation.length > 0) {
    console.log(`\nManual remediation items: ${summary.needsManualRemediation.length}`);
    const byAgent = {};
    for (const item of summary.needsManualRemediation) {
      const key = item.norvarAgent ?? item.agent ?? "?";
      byAgent[key] = (byAgent[key] ?? 0) + 1;
    }
    for (const [agent, count] of Object.entries(byAgent)) {
      console.log(`  ${agent}: ${count} issue(s)`);
    }
  }
  console.log(`\nAgents tested:`);
  for (const a of summary.agentsTested ?? []) {
    const icon = a.tested ? "✓" : "–";
    console.log(`  ${icon} ${a.name.padEnd(8)} ${a.tested ? `${a.passedQueries}/${a.totalQueries} passed` : "not tested"}`);
  }
  console.log(`\nReports: ${REPORT_JSON}`);
  console.log(`         ${REPORT_MD}`);

  if (summary.overallGrade === "CRITICAL") process.exit(1);
}

main().catch(err => { console.error("\nFATAL:", err); process.exit(1); });
