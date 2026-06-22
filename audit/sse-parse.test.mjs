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
  let index = 0;

  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }

      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });
}

test("collectChatTextFromStream returns final done text across chunk boundaries", async () => {
  const stream = streamFromChunks([
    'data: {"type":"token","text":"Hel',
    'lo "}\n\n',
    'data: {"type":"done","text":"Hello world"}\n\n',
  ]);

  assert.equal(await collectChatTextFromStream(stream), "Hello world");
});

test("collectAssessmentFromStream parses a split done payload", async () => {
  const stream = streamFromChunks([
    'data: {"type":"status","text":"working"}\n\n',
    'data: {"type":"done","assessment":{"risk_tier":"hi',
    'gh","gaps":[{"title":"Missing BAA"}]}}\n\n',
  ]);

  assert.deepEqual(await collectAssessmentFromStream(stream), {
    risk_tier: "high",
    gaps: [{ title: "Missing BAA" }],
  });
});

test("collectRedlineFromStream and collectDraftFromStream parse structured payloads", async () => {
  const redline = await collectRedlineFromStream(streamFromChunks([
    'data: {"type":"done","redline":{"overall_status":"needs_work","clauses":[]}}\n\n',
  ]));
  const draft = await collectDraftFromStream(streamFromChunks([
    'data: {"type":"done","draft":{"title":"DPA","sections":[{"title":"Definitions"}]}}\n\n',
  ]));

  assert.deepEqual(redline, { overall_status: "needs_work", clauses: [] });
  assert.deepEqual(draft, { title: "DPA", sections: [{ title: "Definitions" }] });
});

test("collectChatTextFromStream throws on SSE error events", async () => {
  const stream = streamFromChunks([
    'data: {"type":"error","text":"Assessment failed"}\n\n',
  ]);

  await assert.rejects(
    collectChatTextFromStream(stream),
    /Assessment failed/,
  );
});
