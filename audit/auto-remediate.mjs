#!/usr/bin/env node
import { fileURLToPath } from "url";
import { resolve } from "path";

function remediationKey(item) {
  return [
    item?.norvarAgent ?? item?.agent ?? "",
    item?.area ?? "",
    item?.action ?? "",
  ].join("|");
}

export async function runAutoRemediation({ detail } = {}) {
  const candidates = detail?.granularRemediation ?? detail?.needsManualRemediation ?? [];

  if (candidates.length > 0) {
    console.log(`  Auto-remediation candidates found: ${candidates.length}; leaving for manual remediation.`);
  }

  return [];
}

export function filterManualAfterAuto(manualItems = [], autoRemediated = []) {
  if (!autoRemediated.length) return manualItems;

  const fixed = new Set(autoRemediated.map(remediationKey));
  return manualItems.filter(item => !fixed.has(remediationKey(item)));
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  console.log("Auto-remediation module loaded. No deterministic auto-fixes are configured.");
}
