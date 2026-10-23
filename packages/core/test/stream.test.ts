// The event-stream helpers hold no copy of the stream: they pass every chunk on as it arrives and
// report the bytes once the stream ends, or once the client leaves, which also releases the origin.
import assert from "node:assert/strict";
import { test } from "node:test";

import { readFileSync } from "node:fs";

import { compilePolicy } from "../src/policy.js";
import { countBytes, gateStream } from "../src/stream.js";

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

test("a stream through the gate reports once when the client leaves or the origin fails, so its records still ship", async () => {
  const gate = compilePolicy(JSON.parse(readFileSync(new URL("../../../fixtures/synthetic/policy.json", import.meta.url), "utf8"))).rules.find((r) => r.kind === "gate");
  assert.ok(gate);
  let cancelled: unknown = null;
  const ticking = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(encoder.encode("data: tick\n\n"));
    },
    cancel(reason) {
      cancelled = reason ?? "cancelled";
    },
  });
  const left: number[] = [];
  const reader = gateStream(ticking, gate, [], true, (bytes) => left.push(bytes)).getReader();
  await reader.read();
  await reader.cancel("client left");
  assert.equal(cancelled, "client left", "the origin is released");
  assert.equal(left.length, 1);
  let sent = false;
  const failing = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent) controller.error(new Error("origin reset"));
      else controller.enqueue(encoder.encode("data: one\n\n"));
      sent = true;
    },
  });
  const failed: number[] = [];
  await assert.rejects(new Response(gateStream(failing, gate, [], true, (bytes) => failed.push(bytes))).text());
  assert.deepEqual(failed, [11]);
});
