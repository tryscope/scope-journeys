// The fixture comparison on Node: every synthetic fixture through the core with the in-memory Io,
// the masked canonical records and response compared with expected.json, the actual output written
// to test/identity/out/node/<nn>.json for the identity test. FIXTURES_WRITE=1 (re)writes
// expected.json after a reviewed change of the core; a generated expectation nobody read is not an
// expectation.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { applyMask, canonical, maskResponse, maskText } from "../../scripts/canonical.mjs";
import { makeIo, runFixture, type Fixture } from "../../packages/core/test/harness.js";
import { validateRecord } from "../../packages/core/src/validate.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const FIXTURES = join(ROOT, "fixtures", "synthetic");
const OUT = join(ROOT, "test", "identity", "out", "node");
mkdirSync(OUT, { recursive: true });

const names = readdirSync(FIXTURES, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d\d-/.test(d.name)).map((d) => d.name).sort();
const latencies: Record<string, { p50: number; p95: number }> = {};

export function expectation(result: Awaited<ReturnType<typeof runFixture>>): unknown {
  return {
    response: maskResponse(result.response),
    forwarded: result.forwarded.map((f) => ({ ...f, headers: Object.fromEntries(Object.entries(f.headers).filter(([k]) => k !== "content-length").map(([k, v]) => [k, maskText(v)]).sort()) })),
    records: result.records.map((r) => applyMask(r)),
  };
}

for (const name of names) {
  test(`fixture ${name}`, async () => {
    const dir = join(FIXTURES, name);
    const policyRef = JSON.parse(readFileSync(join(dir, "policy.json"), "utf8"));
    // A `$ref` names a shared policy next to the fixtures (`../policy.json`, `../policy.dryrun.json`, ...); anything else is the inline document.
    const policy = typeof policyRef.$ref === "string" ? JSON.parse(readFileSync(join(dir, policyRef.$ref), "utf8")) : policyRef;
    const fixture: Fixture = { name, request: JSON.parse(readFileSync(join(dir, "request.json"), "utf8")), upstream: JSON.parse(readFileSync(join(dir, "upstream.json"), "utf8")), policy, facts: JSON.parse(readFileSync(join(dir, "facts.json"), "utf8")), ...(existsSync(join(dir, "directory.json")) ? { directory: JSON.parse(readFileSync(join(dir, "directory.json"), "utf8")) } : {}) };
    // The expectation run reconstructs a stream frame by frame with the 1 ms gap; the timed runs
    // measure the sensor's own work, so the gap is 0 there (the frames still arrive one by one).
    // Two untimed runs warm the runtime (the lab's number is a steady-state p50 over 14,990
    // requests); twenty timed runs give the p50 and p95 the identity test asserts on.
    const now = Date.parse(fixture.facts.ts ?? "2026-10-10T12:00:00.000Z");
    const result = await runFixture(fixture, makeIo({ upstream: fixture.upstream, directory: fixture.directory, salt: fixture.facts.salt, now }));
    const samples: number[] = [];
    for (let i = 0; i < 22; i += 1) {
      const timed = await runFixture(fixture, makeIo({ upstream: fixture.upstream, directory: fixture.directory, salt: fixture.facts.salt, now, streamGapMs: 0 }));
      if (i >= 2) samples.push(timed.latencyMs);
    }
    for (const record of result.records) {
      const v = validateRecord(record);
      assert.deepEqual(v.errors, [], `${name}: the record does not validate against its schema`);
    }
    const actual = expectation(result);
    const sorted = [...samples].sort((a, b) => a - b);
    latencies[name] = { p50: sorted[Math.floor(sorted.length / 2)] ?? 0, p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0 };
    writeFileSync(join(OUT, `${name}.json`), canonical(actual));
    writeFileSync(join(OUT, "latency.json"), JSON.stringify(latencies, null, 2));
    const expectedPath = join(dir, "expected.json");
    if (process.env.FIXTURES_WRITE === "1" || !existsSync(expectedPath)) {
      writeFileSync(expectedPath, `${JSON.stringify(actual, null, 2)}\n`);
      if (!process.env.FIXTURES_WRITE) assert.fail(`${name}: expected.json was absent and has been written; review it line by line (the response, the forwarded request, every record field) and commit it`);
    }
    const expected = JSON.parse(readFileSync(expectedPath, "utf8"));
    assert.equal(canonical(actual), canonical(expected), `${name}: the masked output differs from expected.json`);
  });
}
