export type RemediationStepItem = {
  id: string;
  text: string;
  order: number;
  completed_at: string | null;
  completed_by: string | null;
};

export function splitRemediationSteps(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n").map(l => l.trim()).filter(Boolean);
  const steps: string[] = [];

  for (const line of lines) {
    const bullet = line.replace(/^([•\-*]|\d+[.)])\s+/, "").trim();
    if (bullet) steps.push(bullet);
  }

  if (steps.length > 1) return steps;

  const singleLineParts = normalized
    .split(/(?=•\s)|(?=\d+[.)]\s)/)
    .map(s => s.replace(/^([•\-*]|\d+[.)])\s+/, "").trim())
    .filter(Boolean);

  return singleLineParts.length > 1 ? singleLineParts : [normalized];
}

/** @deprecated use splitRemediationSteps */
export const parseRemediationSteps = splitRemediationSteps;

export function checklistProgress(items: RemediationStepItem[] | null | undefined) {
  const list = items ?? [];
  const done = list.filter(s => s.completed_at).length;
  return { done, total: list.length };
}
