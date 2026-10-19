// The fixture comparison on workerd: every synthetic fixture through the core inside the Workers
// runtime, compared with expected.json, and the masked canonical output handed to
// scripts/workerd-run.mjs on stdout (the runtime has no filesystem) for
// test/identity/out/workerd/<nn>.json.
import { expect, test } from "vitest";

import { applyMask, canonical, maskResponse, maskText } from "../../scripts/canonical.mjs";
import { makeIo, runFixture, type Fixture } from "../../packages/core/test/harness.js";
import { validateRecord } from "../../packages/core/src/validate.js";

const files = import.meta.glob("../../fixtures/synthetic/*/*.json", { eager: true, import: "default" }) as Record<string, unknown>;
// The shared policies next to the fixtures (`policy.json`, `policy.dryrun.json`, ...), each named by a fixture's `$ref`.
const policies = import.meta.glob("../../fixtures/synthetic/policy*.json", { eager: true, import: "default" }) as Record<string, unknown>;

const names = [...new Set(Object.keys(files).map((p) => p.split("/").at(-2) ?? "").filter((n) => /^\d\d-/.test(n)))].sort();
const file = (name: string, which: string): unknown => files[`../../fixtures/synthetic/${name}/${which}.json`];

const expectation = (result: Awaited<ReturnType<typeof runFixture>>): unknown => ({
  response: maskResponse(result.response),
  forwarded: result.forwarded.map((f) => ({ ...f, headers: Object.fromEntries(Object.entries(f.headers).filter(([k]) => k !== "content-length").map(([k, v]) => [k, maskText(v)]).sort()) })),
  records: result.records.map((r) => applyMask(r)),
});

const latencies: Record<string, { p50: number; p95: number }> = {};

for (const name of names) {
  test(`fixture ${name}`, async ({ task }) => {
    const policyRef = file(name, "policy") as { $ref?: string };
    const policy = typeof policyRef.$ref === "string" ? policies[`../../fixtures/synthetic/${policyRef.$ref.replace(/^\.\.\//, "")}`] : policyRef;
    if (policy === undefined) throw new Error(`${name}: policy.json names ${policyRef.$ref}, which is not a shared policy`);
    const directory = file(name, "directory") as Fixture["directory"] | undefined;
    const fixture: Fixture = { name, request: file(name, "request") as Fixture["request"], upstream: file(name, "upstream") as Fixture["upstream"], policy, facts: file(name, "facts") as Fixture["facts"], ...(directory ? { directory } : {}) };
    const now = Date.parse(fixture.facts.ts ?? "2026-10-10T12:00:00.000Z");
    // The expectation run reconstructs a stream frame by frame with the 1 ms gap; the timed runs
    // measure the sensor's own work, so the gap is 0 there (the frames still arrive one by one).
    const result = await runFixture(fixture, makeIo({ upstream: fixture.upstream, directory: fixture.directory, salt: fixture.facts.salt, now }));
    const samples: number[] = [];
    for (let i = 0; i < 22; i += 1) {
      const timed = await runFixture(fixture, makeIo({ upstream: fixture.upstream, directory: fixture.directory, salt: fixture.facts.salt, now, streamGapMs: 0 }));
      if (i >= 2) samples.push(timed.latencyMs);
    }
    for (const record of result.records) expect(validateRecord(record).errors, `${name}: the record does not validate`).toEqual([]);
    const actual = expectation(result);
    const sorted = [...samples].sort((a, b) => a - b);
    latencies[name] = { p50: sorted[Math.floor(sorted.length / 2)] ?? 0, p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] ?? 0 };
    const text = canonical(actual);
    task.meta.workerd = { name, out: text, p50: latencies[name].p50, p95: latencies[name].p95 };
    const expected = file(name, "expected");
    expect(expected, `${name}: expected.json is missing; run the Node suite first`).toBeDefined();
    expect(text).toEqual(canonical(expected));
  });
}
