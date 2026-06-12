"use client";

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

function parseBlocks(content: string): Block[] {
  const chunks = content.split(/\n{2,}/).map(c => c.trim()).filter(Boolean);
  const blocks: Block[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    if (lines.length === 1) {
      const line = lines[0];
      if (/^#{1,3}\s+/.test(line)) {
        blocks.push({ type: "heading", text: line.replace(/^#{1,3}\s+/, "") });
        continue;
      }
      if (/^[A-Z0-9][A-Z0-9 &/\-–—]{2,}$/.test(line) && line.length < 48) {
        blocks.push({ type: "heading", text: line });
        continue;
      }
      blocks.push({ type: "paragraph", text: line });
      continue;
    }

    const numbered = lines.every(l => /^\d+\.\s/.test(l));
    const bullets  = lines.every(l => /^[•\-\*]\s/.test(l));

    if (numbered) {
      blocks.push({
        type:    "list",
        ordered: true,
        items:   lines.map(l => l.replace(/^\d+\.\s+/, "")),
      });
      continue;
    }

    if (bullets) {
      blocks.push({
        type:    "list",
        ordered: false,
        items:   lines.map(l => l.replace(/^[•\-\*]\s+/, "")),
      });
      continue;
    }

    blocks.push({ type: "paragraph", text: lines.join("\n") });
  }

  return blocks;
}

export default function FormattedMessage({ content }: { content: string }) {
  const blocks = parseBlocks(content);

  if (blocks.length === 0) {
    return <p className="formatted-message-p">{content}</p>;
  }

  return (
    <div className="formatted-message">
      {blocks.map((block, i) => {
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
      })}
    </div>
  );
}
