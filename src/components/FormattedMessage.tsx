"use client";

import RefsLine from "@/components/RefsLine";
import { splitRefsLine } from "@/lib/regulatory-ref-urls";

type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] };

const REDLINE_LABEL = /^(Issue|Current language|Proposed revision|Rationale|Priority|Next step):\s*(.*)$/i;

function inlineBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function formatLine(line: string) {
  const label = line.match(REDLINE_LABEL);
  if (label) {
    return (
      <>
        <span className="formatted-message-label">{label[1]}:</span>
        {label[2] ? ` ${label[2]}` : null}
      </>
    );
  }
  if (/^\d+\.\s*$/.test(line.trim())) return null;
  return inlineBold(line);
}

function parseListLines(lines: string[]): { ordered: boolean; items: string[] } | null {
  if (lines.length === 0) return null;
  const numbered = lines.every(l => /^\d+\.\s/.test(l));
  if (numbered) {
    return { ordered: true, items: lines.map(l => l.replace(/^\d+\.\s+/, "")) };
  }
  const bullets = lines.every(l => /^[•\-\*]\s/.test(l));
  if (bullets) {
    return { ordered: false, items: lines.map(l => l.replace(/^[•\-\*]\s+/, "")) };
  }
  return null;
}

function parseBlocks(content: string): Block[] {
  const chunks = content.split(/\n{2,}/).map(c => c.trim()).filter(Boolean);
  const blocks: Block[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    if (/^#{1,3}\s+/.test(lines[0])) {
      blocks.push({ type: "heading", text: lines[0].replace(/^#{1,3}\s+/, "") });
      const rest = lines.slice(1);
      if (rest.length === 0) continue;
      const list = parseListLines(rest);
      if (list) {
        blocks.push({ type: "list", ordered: list.ordered, items: list.items });
        continue;
      }
      blocks.push({ type: "paragraph", text: rest.join("\n") });
      continue;
    }

    if (lines.length === 1) {
      const line = lines[0];
      if (/^[A-Z0-9][A-Z0-9 &/\-–—]{2,}$/.test(line) && line.length < 48) {
        blocks.push({ type: "heading", text: line });
        continue;
      }
      blocks.push({ type: "paragraph", text: line });
      continue;
    }

    const wholeList = parseListLines(lines);
    if (wholeList) {
      blocks.push({ type: "list", ordered: wholeList.ordered, items: wholeList.items });
      continue;
    }

    const tailList = parseListLines(lines.slice(1));
    if (tailList) {
      blocks.push({ type: "paragraph", text: lines[0] });
      blocks.push({ type: "list", ordered: tailList.ordered, items: tailList.items });
      continue;
    }

    blocks.push({ type: "paragraph", text: lines.join("\n") });
  }

  return blocks;
}

export default function FormattedMessage({ content }: { content: string }) {
  const { body, refsLine } = splitRefsLine(content);
  const blocks = parseBlocks(body);

  if (blocks.length === 0 && !refsLine) {
    return <p className="formatted-message-p">{content}</p>;
  }

  return (
    <div className="formatted-message">
      {blocks.length === 0 ? (
        body ? <p className="formatted-message-p">{body}</p> : null
      ) : (
        blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <h3 key={i} className="formatted-message-heading">
              {block.text}
            </h3>
          );
        }
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={i} className={`formatted-message-list${block.ordered ? " ordered" : ""}`}>
              {block.items.map((item, j) => (
                <li key={j}>{inlineBold(item)}</li>
              ))}
            </Tag>
          );
        }
        const lines = block.text.split("\n").map(l => l.trim()).filter(l => l && !/^\d+\.\s*$/.test(l));
        return (
          <p key={i} className="formatted-message-p">
            {lines.map((line, j) => (
              <span key={j}>
                {formatLine(line)}
                {j < lines.length - 1 && <br />}
              </span>
            ))}
          </p>
        );
      })
      )}
      {refsLine && <RefsLine line={refsLine} />}
    </div>
  );
}
