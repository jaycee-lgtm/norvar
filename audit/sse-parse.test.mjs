import test from "node:test";
import assert from "node:assert/strict";
import {
  collectAssessmentFromStream,
  collectChatTextFromStream,
  collectDraftFromStream,
  collectRedlineFromStream,
} from "./sse-parse.mjs";

function streamFromChunks(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

test("collectChatTextFromStream handles split SSE frames and done replacement", async () => {
  const stream = streamFromChunks([
    'data: {"type":"token","text":"Hel',
    'lo"}\n\ndata: {"type":"token","text":" wor',
    'ld"}\n\ndata: {"type":"done","text":"Hello world"}\n\n',
  ]);

  assert.equal(await collectChatTextFromStream(stream), "Hello world");
});

test("collectAssessmentFromStream returns the final assessment payload", async () => {
  const assessment = { risk_tier: "high", gaps: [{ title: "Missing DPA" }] };
  const stream = streamFromChunks([
    'data: {"type":"status","text":"Analysing"}\n\n',
    `data: ${JSON.stringify({ type: "done", assessment })}\n\n`,
  ]);

  assert.deepEqual(await collectAssessmentFromStream(stream), assessment);
});

test("collectRedlineFromStream throws endpoint error events", async () => {
  const stream = streamFromChunks([
    'data: {"type":"status","text":"Parsing"}\n\n',
    'data: {"type":"error","text":"Could not parse redline"}\n\n',
  ]);

  await assert.rejects(
    () => collectRedlineFromStream(stream),
    /Could not parse redline/,
  );
});

test("collectDraftFromStream handles large split done payloads", async () => {
  const draft = {
    title: "Data Processing Agreement",
    sections: [
      {
        number: "1",
        title: "Definitions",
        clauses: [{ number: "1.1", title: "Definitions", text: "A".repeat(50000) }],
      },
    ],
  };
  const event = `data: ${JSON.stringify({ type: "done", draft })}\n\n`;
  const stream = streamFromChunks([event.slice(0, 1024), event.slice(1024, 35000), event.slice(35000)]);

  assert.deepEqual(await collectDraftFromStream(stream), draft);
});
