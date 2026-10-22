// The event-stream helpers hold no copy of the stream: they pass every chunk on as it arrives and
// report the bytes once the stream ends, or once the client leaves, which also releases the origin.
import assert from "node:assert/strict";
import { test } from "node:test";

import { countBytes } from "../src/stream.js";

const encoder = new TextEncoder();

test("countBytes passes each chunk through and reports the total when the stream ends", async () => {
  const chunks = ["data: one\n\n", "data: twö\n\n"];
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  const reported: number[] = [];
  const out = countBytes(source, (bytes) => reported.push(bytes));
  assert.equal(await new Response(out).text(), chunks.join(""));
  assert.deepEqual(reported, [encoder.encode(chunks.join("")).byteLength]);
});

test("a client that leaves cancels the origin's stream and the bytes so far are reported once", async () => {
  let cancelled: unknown = null;
  const source = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(encoder.encode("data: tick\n\n"));
    },
    cancel(reason) {
      cancelled = reason ?? "cancelled";
    },
  });
  const reported: number[] = [];
  const reader = countBytes(source, (bytes) => reported.push(bytes)).getReader();
  const first = await reader.read();
  assert.equal(first.value?.byteLength, 12);
  await reader.cancel("client left");
  assert.equal(cancelled, "client left", "the origin is released");
  assert.equal(reported.length, 1);
  assert.ok((reported[0] ?? 0) >= 12);
});
