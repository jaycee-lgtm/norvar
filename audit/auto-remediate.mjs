#!/usr/bin/env node

import { fileURLToPath } from "url";

function itemKey(item) {
  return [
    item?.sprintId ?? "",
    item?.queryId ?? "",
    item?.agent ?? item?.norvarAgent ?? "",
    item?.area ?? "",
    item?.action ?? "",
  ].join("|");
}

/**
 * Placeholder remediation contract for the audit orchestrator.
 *
 * Automatic prompt/code mutation requires explicit, checked-in rules. Until
 * those exist, keep remediation read-only and leave findings in the manual queue.
 */
export async function runAutoRemediation() {
  return [];
}

export function filterManualAfterAuto(manualItems = [], autoRemediated = []) {
  if (!autoRemediated.length) return manualItems;

  const fixed = new Set(autoRemediated.map(itemKey));
  return manualItems.filter(item => !fixed.has(itemKey(item)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log("No automatic remediation rules are configured; leaving findings for manual remediation.");
}
