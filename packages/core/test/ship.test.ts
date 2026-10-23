// Shipping: one send at a time from a queue with a memory budget, batches of at most 500 records
// and about 2 MB, a failed send sent again as the same bytes with backoff until the ingest stores it,
// refuses it or its time runs out, and every record that never lands counted exactly once: the
// ingest adds `scope.observer.dropped` up across the records it stores.
import assert from "node:assert/strict";
import { test } from "node:test";

import { createShipper, deliver, droppedSoFar, resetDelivery, type ShipTiming } from "../src/ship.js";

type Answer = { status: number; headers?: Record<string, string>; body?: unknown } | "network" | "hang";

interface Ingest {
  fetch: typeof fetch;
  /** Every attempt as received: the records it carried and its gzip body's bytes. */
  attempts: Array<{ records: Array<Record<string, unknown>>; bytes: string; authorization: string | null; at: number }>;
  /** How many attempts were open at once, at most. */
  peak: () => number;
}

async function gunzip(body: BodyInit): Promise<{ text: string; bytes: string }> {
  const raw = new Uint8Array(await new Response(body).arrayBuffer());
  const text = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
  return { text, bytes: Buffer.from(raw).toString("base64") };
}

/** An ingest that answers each attempt from the list (then 202), recording what it received. */
function ingest(answers: Answer[], delayMs = 0): Ingest {
  let open = 0;
  let peak = 0;
  const attempts: Ingest["attempts"] = [];
  return {
    attempts,
    peak: () => peak,
    fetch: (async (_input: RequestInfo | URL, init?: RequestInit) => {
      open += 1;
      peak = Math.max(peak, open);
      try {
        const { text, bytes } = await gunzip(init?.body as BodyInit);
        const received = JSON.parse(text) as Array<Record<string, unknown>>;
        attempts.push({ records: received, bytes, authorization: new Headers(init?.headers).get("authorization"), at: performance.now() });
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        const answer = answers.shift() ?? { status: 202 };
        if (answer === "network") throw new TypeError("fetch failed");
        if (answer === "hang") return await new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
        // A stored batch is answered as the ingest answers it, unless the test says otherwise.
        const body = answer.body ?? (answer.status === 202 ? { accepted: received.length, rejected: [], warnings: [] } : null);
        return new Response(body === null ? null : JSON.stringify(body), { status: answer.status, headers: answer.headers });
      } finally {
        open -= 1;
      }
    }) as typeof fetch,
  };
}

// The production timing shortened, so a test runs in milliseconds.
const FAST: ShipTiming = { intervalMs: 0, baseDelayMs: 1, maxDelayMs: 4, giveUpMs: 2_000, budgetBytes: 32 * 1024 * 1024, attemptTimeoutMs: 50 };
const API = "https://api.test.invalid";

let next = 0;
const request = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({ schema: "scope.request/1", id: `r${(next += 1)}`, "scope.observer.dropped": 0, ...extra });
const declaration = (): Record<string, unknown> => ({ schema: "scope.declaration/1", id: `d${(next += 1)}` });
const records = (n: number): never[] => Array.from({ length: n }, () => request()) as never[];
const carried = (attempt: Ingest["attempts"][number] | undefined): number[] => (attempt?.records ?? []).map((r) => (typeof r["scope.observer.dropped"] === "number" ? r["scope.observer.dropped"] : 0));

test("one send at a time: records added while a send is out wait and go together; at most 500 records and about 2 MB a send", async () => {
  resetDelivery();
  const w = ingest([], 20);
  const shipper = createShipper({ fetch: w.fetch, log: () => undefined, timing: FAST });
  await Promise.all(Array.from({ length: 60 }, () => shipper.add(records(1), API, "sjk_test_k")));
  assert.equal(w.peak(), 1, "never more than one send open");
  assert.ok(w.attempts.length < 60, `records that waited went together (${w.attempts.length} sends for 60 requests)`);
  assert.equal(w.attempts.flatMap((a) => a.records).length, 60, "every record landed once");
  assert.equal(w.attempts[0]?.authorization, "Bearer sjk_test_k");

  const big = ingest([]);
  const bigShipper = createShipper({ fetch: big.fetch, log: () => undefined, timing: FAST });
  await bigShipper.add(records(1_200), API, "k");
  assert.deepEqual(big.attempts.map((a) => a.records.length), [500, 500, 200], "500 records a send at most");
  const heavy = ingest([]);
  const heavyShipper = createShipper({ fetch: heavy.fetch, log: () => undefined, timing: FAST });
  await heavyShipper.add(Array.from({ length: 40 }, () => request({ "scope.body.response": { text: "x".repeat(100_000) } })) as never[], API, "k");
  assert.ok(heavy.attempts.length >= 2, "about 2 MB a send at most");
  for (const attempt of heavy.attempts) assert.ok(JSON.stringify(attempt.records).length <= 2 * 1024 * 1024 + 110_000, "no send passes the byte cap by more than one record");
  assert.equal(droppedSoFar(), 0);
});

test("a send that fails for a reason that can pass is sent again as the same bytes until the ingest stores it", async () => {
  resetDelivery();
  const w = ingest(["network", { status: 503, headers: { "retry-after": "0" } }, { status: 502 }, { status: 504 }, { status: 408 }, { status: 429 }, "hang"]);
  const shipper = createShipper({ fetch: w.fetch, log: () => undefined, timing: FAST });
  await shipper.add(records(3), API, "k");
  assert.equal(w.attempts.length, 8, "seven failures, then stored");
  assert.equal(new Set(w.attempts.map((a) => a.bytes)).size, 1, "every attempt resends the same bytes, so a send the ingest already stored is a duplicate it skips");
  assert.equal(droppedSoFar(), 0);
});

test("a send the ingest refuses is dropped and counted at once; a 500 gets three tries", async () => {
  for (const status of [400, 401, 403, 409, 413, 307, 501]) {
    resetDelivery();
    const w = ingest([{ status }]);
    const log: string[] = [];
    await createShipper({ fetch: w.fetch, log: (l) => log.push(l), timing: FAST }).add(records(2), API, "k");
    assert.equal(w.attempts.length, 1, `${status}: one attempt`);
    assert.equal(droppedSoFar(), 2, `${status}: both records counted`);
    assert.ok(log.some((l) => l.includes(`refused with ${status}`)), log.join("\n"));
  }
  resetDelivery();
  const w = ingest([{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }]);
  await createShipper({ fetch: w.fetch, log: () => undefined, timing: FAST }).add(records(2), API, "k");
  assert.equal(w.attempts.length, 3, "a 500 is tried three times");
  assert.equal(droppedSoFar(), 2);
});

test("a send still failing when its time runs out is dropped and counted; a Retry-After past that time drops it at once", async () => {
  resetDelivery();
  const w = ingest(Array.from({ length: 1_000 }, () => ({ status: 503 })));
  const started = Date.now();
  await createShipper({ fetch: w.fetch, log: () => undefined, timing: { ...FAST, giveUpMs: 200 } }).add(records(4), API, "k");
  assert.ok(Date.now() - started < 1_000, "given up near the time limit");
  assert.ok(w.attempts.length > 1);
  assert.equal(droppedSoFar(), 4);

  resetDelivery();
  const quota = ingest([{ status: 429, headers: { "retry-after": "3600" } }]);
  const log: string[] = [];
  await createShipper({ fetch: quota.fetch, log: (l) => log.push(l), timing: FAST }).add(records(2), API, "k");
  assert.equal(quota.attempts.length, 1, "no wait past the time limit");
  assert.equal(droppedSoFar(), 2);
  assert.ok(log.some((l) => /asked to wait 3600 s/.test(l)), log.join("\n"));
});

test("the drop count rides on exactly one record, the first request record of the next send; a send carrying it that is dropped puts it back; records rejected inside a 202 are counted", async () => {
  resetDelivery();
  // 800 records go out as 500 then 300: the first send is refused, the second stores. The second carries the 500.
  const w = ingest([{ status: 400 }, { status: 202, body: { accepted: 300, rejected: [], warnings: [] } }]);
  const shipper = createShipper({ fetch: w.fetch, log: () => undefined, timing: FAST });
  await shipper.add(records(800), API, "k");
  assert.deepEqual(carried(w.attempts[1]), [500, ...Array.from({ length: 299 }, () => 0)], "only the first request record carries the count");
  assert.equal(droppedSoFar(), 0, "reported, so nothing is pending");

  // A send carrying a count is itself dropped: the count comes back with its own records.
  resetDelivery();
  const again = ingest([{ status: 400 }, { status: 400 }, { status: 202 }]);
  const second = createShipper({ fetch: again.fetch, log: () => undefined, timing: FAST });
  await second.add(records(2), API, "k");
  await second.add(records(3), API, "k");
  await second.add([declaration(), request()] as never[], API, "k");
  assert.deepEqual(carried(again.attempts[1]), [2, 0, 0]);
  assert.deepEqual(carried(again.attempts[2]), [0, 5], "a declaration never carries it; the first request record does");
  assert.equal(droppedSoFar(), 0);

  // Records the ingest rejects inside a 202 never land: counted, and a rejected carrier's count comes back.
  resetDelivery();
  const partial = ingest([{ status: 400 }, { status: 202, body: { accepted: 1, rejected: [{ index: 0, reason: "invalid:url.path" }, { index: 2, reason: "install_mismatch" }], warnings: [] } }, { status: 202 }]);
  const third = createShipper({ fetch: partial.fetch, log: () => undefined, timing: FAST });
  await third.add(records(1), API, "k");
  await third.add(records(3), API, "k");
  assert.equal(droppedSoFar(), 3, "the rejected carrier's 1 and the 2 rejected records");
  await third.add(records(1), API, "k");
  assert.deepEqual(carried(partial.attempts[2]), [3]);
  assert.equal(droppedSoFar(), 0);

  // The ingest stored a send whose answer was lost: the resend is a duplicate, and its count was reported.
  resetDelivery();
  const lost = ingest([{ status: 400 }, "hang", { status: 202, body: { accepted: 0, rejected: [], warnings: [{ index: 0, reason: "duplicate" }] } }]);
  const fourth = createShipper({ fetch: lost.fetch, log: () => undefined, timing: FAST });
  await fourth.add(records(1), API, "k");
  await fourth.add(records(1), API, "k");
  assert.equal(lost.attempts[1]?.bytes, lost.attempts[2]?.bytes, "the resend is the same bytes, the same count");
  assert.equal(droppedSoFar(), 0);
});

test("the memory budget: when the queue is full, the oldest waiting records are dropped and counted, never the send that is out", async () => {
  resetDelivery();
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  let first = true;
  const received: string[] = [];
  const counts: Record<string, unknown> = {};
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const { text } = await gunzip(init?.body as BodyInit);
    for (const r of JSON.parse(text) as Array<{ id: string; "scope.observer.dropped": number }>) {
      received.push(r.id);
      counts[r.id] = r["scope.observer.dropped"];
    }
    if (first) {
      first = false;
      await held;
    }
    return Response.json({ accepted: 1, rejected: [], warnings: [] }, { status: 202 });
  }) as typeof fetch;
  const log: string[] = [];
  // Each record is about 10 KB; the budget holds about four.
  const shipper = createShipper({ fetch: fetcher, log: (l) => log.push(l), timing: { ...FAST, budgetBytes: 45_000 } });
  const sized = (id: string): never => ({ schema: "scope.request/1", id, "scope.observer.dropped": 0, pad: "x".repeat(10_000) }) as never;
  // The first add's batch is taken at once, so "out" is the send in flight while the others wait.
  const done = [shipper.add([sized("out")], API, "k")];
  for (const id of ["a", "b", "c", "d", "e"]) done.push(shipper.add([sized(id)], API, "k"));
  release();
  await Promise.all(done);
  assert.deepEqual(received, ["out", "c", "d", "e"], "the send that was out landed; the two oldest waiting records were dropped");
  assert.equal(counts.c, 2, "the next send's first record reports the two");
  assert.ok(log.some((l) => /queue is full/.test(l)), log.join("\n"));
  assert.equal(droppedSoFar(), 0);

  // Records too large for the budget on their own are dropped alone; the queue keeps what it holds.
  resetDelivery();
  const w = ingest([]);
  const small = createShipper({ fetch: w.fetch, log: () => undefined, timing: { ...FAST, budgetBytes: 45_000, intervalMs: 50 } });
  const kept = [small.add([sized("x")], API, "k"), small.add([sized("y")], API, "k")];
  await small.add(Array.from({ length: 5 }, (_, i) => sized(`big${i}`)), API, "k");
  await Promise.all(kept);
  assert.deepEqual(w.attempts.flatMap((a) => a.records.map((r) => r.id)), ["x", "y"], "nothing waiting was evicted for records that could never fit");
  assert.equal(w.attempts[1]?.records[0]?.["scope.observer.dropped"], 5, "the next send reports the five");
  assert.equal(droppedSoFar(), 0);
});

test("the interval: a send waits for the interval since the last one, so a busy process sends at most once a second", async () => {
  resetDelivery();
  const w = ingest([]);
  const shipper = createShipper({ fetch: w.fetch, log: () => undefined, timing: { ...FAST, intervalMs: 150 } });
  const started = Date.now();
  await shipper.add(records(1), API, "k");
  assert.ok(Date.now() - started < 100, "an idle queue sends at once");
  await shipper.add(records(1), API, "k");
  assert.ok(Date.now() - started >= 140, "the next send waits for the interval");

  // A full batch does not wait: a process above 500 records a second ships at the ingest's pace.
  const busy = ingest([]);
  const fast = createShipper({ fetch: busy.fetch, log: () => undefined, timing: { ...FAST, intervalMs: 300 } });
  await fast.add(records(1), API, "k");
  await fast.add(records(1_100), API, "k");
  const at = busy.attempts.map((a) => a.at);
  const gaps = at.slice(1).map((t, i) => t - (at[i] ?? t));
  assert.deepEqual(busy.attempts.map((a) => a.records.length), [1, 500, 500, 100]);
  assert.ok((gaps[1] ?? Infinity) < 150, `the second full batch went at once (${Math.round(gaps[1] ?? 0)} ms)`);
  assert.ok((gaps[2] ?? 0) >= 290, "the last, partial batch waited for the rhythm");
});

test("an answer that is not the ingest's is not taken for stored: a 2xx without the ingest's answer is counted", async () => {
  resetDelivery();
  const w = ingest([{ status: 200, body: "<html>a login page</html>" }]);
  const log: string[] = [];
  await createShipper({ fetch: w.fetch, log: (l) => log.push(l), timing: FAST }).add(records(2), API, "k");
  assert.equal(droppedSoFar(), 2);
  assert.ok(log.some((l) => /answered 200 without the ingest's answer/.test(l)), log.join("\n"));
});

test("a logger that throws never stops the queue", async () => {
  resetDelivery();
  const w = ingest([{ status: 503 }, { status: 400 }]);
  const shipper = createShipper({ fetch: w.fetch, log: () => {
    throw new Error("the logger broke");
  }, timing: FAST });
  await shipper.add(records(1), API, "k");
  await shipper.add(records(1), API, "k");
  assert.equal(w.attempts.length, 3, "the retry, the refusal, then the next send all happened");
  assert.equal(droppedSoFar(), 0, "the one refused record was reported by the next send");
});

test("no install key or no ingest url: nothing is sent, the records count as dropped, said once", async () => {
  resetDelivery();
  const w = ingest([]);
  const log: string[] = [];
  const shipper = createShipper({ fetch: w.fetch, log: (l) => log.push(l), timing: FAST });
  await shipper.add(records(2), API, null);
  await shipper.add(records(1), API, null);
  await shipper.add(records(1), null, "k");
  assert.equal(w.attempts.length, 0);
  assert.equal(droppedSoFar(), 4);
  assert.equal(log.filter((l) => /no install key/.test(l)).length, 1);
});

test("deliver, the Worker's form: one request's records under the same rules, inside a deadline", async () => {
  resetDelivery();
  const w = ingest([{ status: 503 }, { status: 202 }]);
  await deliver(records(3), { apiUrl: API, key: "k", fetch: w.fetch, log: () => undefined, timing: FAST, windowMs: 1_000 });
  assert.equal(w.attempts.length, 2);
  assert.equal(droppedSoFar(), 0);

  resetDelivery();
  const down = ingest(Array.from({ length: 1_000 }, () => ({ status: 503 })));
  const started = Date.now();
  await deliver(records(1_200), { apiUrl: API, key: "k", fetch: down.fetch, log: () => undefined, timing: { ...FAST, attemptTimeoutMs: 20 }, windowMs: 150 });
  assert.ok(Date.now() - started < 260, `every batch stops inside the one window (${Date.now() - started} ms)`);
  assert.equal(droppedSoFar(), 1_200);

  // The ingest's 503 asks for 30 s, more than the window holds: one last try lands before the deadline.
  resetDelivery();
  const busy = ingest([{ status: 503, headers: { "retry-after": "30" } }, { status: 202 }]);
  const tried = Date.now();
  await deliver(records(2), { apiUrl: API, key: "k", fetch: busy.fetch, log: () => undefined, timing: { ...FAST, attemptTimeoutMs: 100 }, windowMs: 600 });
  assert.equal(busy.attempts.length, 2);
  assert.ok(Date.now() - tried < 600);
  assert.equal(droppedSoFar(), 0);
});

test("the count is taken when a batch is built: two Worker deliveries side by side never both carry it", async () => {
  resetDelivery();
  await deliver(records(3), { apiUrl: API, key: "k", fetch: ingest([{ status: 400 }]).fetch, log: () => undefined, timing: FAST });
  const w = ingest([]);
  await Promise.all([deliver(records(1), { apiUrl: API, key: "k", fetch: w.fetch, log: () => undefined, timing: FAST }), deliver(records(1), { apiUrl: API, key: "k", fetch: w.fetch, log: () => undefined, timing: FAST })]);
  assert.deepEqual(w.attempts.flatMap(carried).sort(), [0, 3], "one of the two carries the 3");
  assert.equal(droppedSoFar(), 0);
});

test("a retry waits at least the rhythm; the last try is cut to the time left rather than given up", async () => {
  resetDelivery();
  const w = ingest([{ status: 503 }, { status: 202 }]);
  await createShipper({ fetch: w.fetch, log: () => undefined, timing: { ...FAST, intervalMs: 150 } }).add(records(1), API, "k");
  assert.ok((w.attempts[1]?.at ?? 0) - (w.attempts[0]?.at ?? 0) >= 140, "the retry waited for the rhythm");

  resetDelivery();
  const late = ingest([{ status: 503 }, { status: 202 }]);
  await deliver(records(1), { apiUrl: API, key: "k", fetch: late.fetch, log: () => undefined, timing: { ...FAST, baseDelayMs: 60_000, maxDelayMs: 60_000, attemptTimeoutMs: 100 }, windowMs: 600 });
  assert.equal(late.attempts.length, 2, "a backoff longer than the window still leaves one try before the deadline");
  assert.equal(droppedSoFar(), 0);
});

test("a quota spent past the time limit holds the queue: later batches are dropped and counted unsent until it lifts", async () => {
  resetDelivery();
  const w = ingest([{ status: 429, headers: { "retry-after": "3600" } }]);
  const shipper = createShipper({ fetch: w.fetch, log: () => undefined, timing: FAST });
  await shipper.add(records(2), API, "k");
  await shipper.add(records(3), API, "k");
  assert.equal(w.attempts.length, 1, "the second batch was not sent against the spent quota");
  assert.equal(droppedSoFar(), 5);
});
