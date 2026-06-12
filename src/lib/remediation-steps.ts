export function splitRemediationSteps(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const lines = normalized.split("\n").map(l => l.trim()).filter(Boolean);
  const steps: string[] = [];

  for (const line of lines) {
    const bullet = line.replace(/^([•\-\*]|\d+\.)\s+/, "").trim();
    if (bullet) steps.push(bullet);
  }

  if (steps.length > 1) return steps;

  const singleLineParts = normalized
    .split(/(?=•\s)|(?=\d+\.\s)/)
    .map(s => s.replace(/^([•\-\*]|\d+\.)\s+/, "").trim())
    .filter(Boolean);

  return singleLineParts.length > 1 ? singleLineParts : [normalized];
}
