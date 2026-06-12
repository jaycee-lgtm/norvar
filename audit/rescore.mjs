#!/usr/bin/env node
// Re-score a saved Sprint 1 audit report with the current scoring.mjs.
// Usage: node rescore.mjs <audit-report-*.json>

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const { TEST_QUERIES }  = await import(join(__dirname, "queries.js"));
const { scoreResponse } = await import(join(__dirname, "scoring.mjs"));

const reportPath = process.argv[2];
if (!reportPath) { console.error("Usage: node rescore.mjs <audit-report.json>"); process.exit(1); }

const report = JSON.parse(readFileSync(reportPath, "utf8"));
const byId   = Object.fromEntries(TEST_QUERIES.map(q => [q.id, q]));

let total = 0, n = 0;
const domains = {};

for (const r of report.results) {
  if (!r.fullResponse) { console.log(`${r.queryId}: no response saved, skipped`); continue; }
  const q = byId[r.queryId];
  const oldScore = r.scores?.compositeScore ?? "-";
  const s = scoreResponse(q, r.fullResponse);
  total += s.compositeScore; n++;
  (domains[q.domain] ??= []).push(s.compositeScore);
  const delta = typeof oldScore === "number" ? ` (was ${oldScore})` : "";
  console.log(`${r.queryId.padEnd(6)} ${s.grade.padEnd(7)} ${String(s.compositeScore).padStart(3)}/100${delta}`);
  if (s.missingFrameworks.length) console.log(`       missing frameworks: ${s.missingFrameworks.join(", ")}`);
  if (s.missingConcepts.length)   console.log(`       missing concepts:   ${s.missingConcepts.join(", ")}`);
}

console.log(`\nAvg: ${Math.round(total / n)}/100`);
for (const [d, arr] of Object.entries(domains)) {
  console.log(`  ${d.padEnd(16)} ${Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)}/100`);
}
