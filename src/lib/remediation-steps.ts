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

const CHAT_INTRO_RE = /here'?s what you need to do to close this gap[.:]?\s*/i;

export function hasRemediationAdviceIntro(text: string): boolean {
  return CHAT_INTRO_RE.test(text);
}

/** Strip gap-chat preamble and keep actionable remediation guidance. */
export function extractActionableContentFromChat(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  const introMatch = normalized.match(CHAT_INTRO_RE);
  if (!introMatch || introMatch.index === undefined) return normalized;

  let rest = normalized.slice(introMatch.index + introMatch[0].length).trim();

  // Drop the follow-on intro paragraph before section headers or numbered steps.
  const bodyStart = rest.search(/\n\s*(?:[A-Z][A-Z0-9\s()/\u2014\u2013\-—:]+|\*{0,2}\d+[.)])/);
  if (bodyStart > 0) {
    rest = rest.slice(bodyStart).trim();
  }

  return rest;
}

function isSectionHeader(line: string): boolean {
  return (
    /^[A-Z][A-Z0-9\s()/\u2014\u2013\-—:]+$/.test(line)
    && line.length < 90
    && !/^\d+[.)]/.test(line)
  );
}

function stripChatMarkdown(line: string): string {
  return line.replace(/\*\*/g, "").trim();
}

/** Parse top-level numbered actions from a gap-chat assistant reply. */
export function parseChatResponseToSteps(text: string): string[] {
  const body = extractActionableContentFromChat(text);
  if (!body) return [];

  const lines = body.split("\n");
  const steps: string[] = [];
  let section = "";
  let stepNum = 0;
  let stepLines: string[] = [];

  const flush = () => {
    if (stepNum === 0 || stepLines.length === 0) return;
    const sectionPrefix = section ? `${section}\n\n` : "";
    const content = stepLines.join("\n").trim();
    steps.push(`${sectionPrefix}${stepNum}. ${content}`);
    stepNum = 0;
    stepLines = [];
  };

  for (const raw of lines) {
    const line = stripChatMarkdown(raw);
    if (!line) {
      if (stepLines.length > 0 && stepLines[stepLines.length - 1] !== "") {
        stepLines.push("");
      }
      continue;
    }

    if (isSectionHeader(line)) {
      flush();
      section = line;
      continue;
    }

    const numbered = line.match(/^(\d+)[.)]\s+(.+)/);
    if (numbered) {
      flush();
      stepNum = Number(numbered[1]);
      stepLines = [numbered[2]];
      continue;
    }

    if (stepNum > 0) {
      stepLines.push(line);
    }
  }

  flush();

  if (steps.length > 0) return steps;
  return splitRemediationSteps(body);
}

export function buildStepItemsFromTexts(
  texts: string[],
  startOrder = 0,
  createId: () => string,
): RemediationStepItem[] {
  return texts
    .map(t => t.trim())
    .filter(Boolean)
    .map((stepText, i) => ({
      id:           createId(),
      text:         stepText,
      order:        startOrder + i,
      completed_at: null,
      completed_by: null,
    }));
}

export function checklistProgress(items: RemediationStepItem[] | null | undefined) {
  const list = items ?? [];
  const done = list.filter(s => s.completed_at).length;
  return { done, total: list.length };
}
