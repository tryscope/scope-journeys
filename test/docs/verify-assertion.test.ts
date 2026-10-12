// J3.4 step 8: the verification samples on the docs host (`docs/content/verify/{next,express}.md`)
// are run, as written, against the assertion the sensor produces on fixture 30: the first fenced
// block of each page is extracted, imported, and handed the forwarded header with a fetch that
// answers Scope's directory for the fixture's kid.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { makeIo, runFixture, type Fixture } from "../../packages/core/test/harness.js";
import { fixtureAssertionKey } from "../../scripts/assertion-fixture-key.mjs";

const ROOT = new URL("../../", import.meta.url).pathname;
const SYNTHETIC = join(ROOT, "fixtures", "synthetic");
const GENERATED = join(ROOT, "test", "docs", ".generated");
mkdirSync(GENERATED, { recursive: true });

function sample(page: string, language: string): string {
  const text = readFileSync(join(ROOT, "docs", "content", "verify", page), "utf8");
  const match = new RegExp("```" + language + "\\n([\\s\\S]*?)```").exec(text);
  assert.ok(match?.[1], `${page}: no ${language} sample`);
  return match[1];
}

async function forwardedAssertion(): Promise<{ assertion: string; agent: string; recordId: string }> {
  const name = "30-assertion-signed";
  const read = (file: string): unknown => JSON.parse(readFileSync(join(SYNTHETIC, name, file), "utf8"));
  const fixture: Fixture = { name, request: read("request.json") as Fixture["request"], upstream: read("upstream.json") as Fixture["upstream"], policy: JSON.parse(readFileSync(join(SYNTHETIC, "policy.assertion.json"), "utf8")), facts: read("facts.json") as Fixture["facts"] };
  // Signed at the real clock: jose checks exp against the real clock, and the samples are the customer's code as written.
  const result = await runFixture(fixture, makeIo({ upstream: fixture.upstream, now: Date.now() }));
  const hop = result.forwarded.find((r) => r.url === "/docs/quickstart");
  assert.ok(hop?.headers["x-scope-assertion"]);
  const record = result.records.find((r) => r.schema === "scope.request/1");
  assert.ok(record);
  return { assertion: hop.headers["x-scope-assertion"], agent: hop.headers["x-scope-agent"] ?? "", recordId: record.id };
}

const { public_jwk, kid } = fixtureAssertionKey();
const directory = { keys: [{ ...public_jwk, use: "sig", alg: "ES256" }] };
const fetches: string[] = [];
const directoryFetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  fetches.push(url);
  if (url === `https://api.tryscope.com/.well-known/scope-observer?kid=${encodeURIComponent(kid)}`) return Response.json(directory);
  return new Response("not found", { status: 404 });
}) as typeof fetch;

test("the Next sample verifies the fixture's assertion for its host, refuses another host and a tampered token, and fetches the directory once", async () => {
  const path = join(GENERATED, "next-sample.ts");
  writeFileSync(path, sample("next.md", "ts"));
  const mod = (await import(path)) as { verifyScopeObserver: (assertion: string | null, host: string, fetchFn?: typeof fetch) => Promise<Record<string, unknown> | null> };
  const { assertion, agent, recordId } = await forwardedAssertion();
  {
    fetches.length = 0;
    const observer = await mod.verifyScopeObserver(assertion, "acme.example", directoryFetch);
    assert.ok(observer, "verified");
    assert.equal(observer.record, recordId);
    assert.equal(observer.reader, "claude-code");
    assert.deepEqual(observer.agent, { name: "claude-code", named_by: "inferred" });
    assert.equal(observer.aud, "acme.example");
    assert.equal(agent, "claude-code;inferred");
    assert.equal(await mod.verifyScopeObserver(assertion, "other.example", directoryFetch), null, "another host");
    assert.equal(await mod.verifyScopeObserver(`${assertion.slice(0, -2)}AA`, "acme.example", directoryFetch), null, "a tampered signature");
    assert.equal(await mod.verifyScopeObserver(null, "acme.example", directoryFetch), null);
    assert.equal(fetches.length, 1, "the directory is fetched once per kid");
    const unknown = assertion.replace(/^[^.]+/, (h) => Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(h, "base64url").toString()), kid: "jin_other:1" })).toString("base64url"));
    assert.equal(await mod.verifyScopeObserver(unknown, "acme.example", directoryFetch), null, "an unknown kid: the directory answers 404 and the verifier fails closed");
  }
});

test("the Express sample's middleware exposes request.scopeObserver, null for a stranger's header", async () => {
  const path = join(GENERATED, "express-sample.js");
  writeFileSync(path, sample("express.md", "js"));
  const mod = (await import(path)) as { scopeObserver: (fetchFn?: typeof fetch) => (request: Record<string, unknown>, response: unknown, next: () => void) => Promise<void> };
  const { assertion, recordId } = await forwardedAssertion();
  {
    const middleware = mod.scopeObserver(directoryFetch);
    const request: Record<string, unknown> = { hostname: "acme.example", get: (name: string) => (name === "x-scope-assertion" ? assertion : undefined) };
    let called = false;
    await middleware(request, {}, () => {
      called = true;
    });
    assert.ok(called);
    assert.equal((request.scopeObserver as { record: string }).record, recordId);
    const stranger: Record<string, unknown> = { hostname: "acme.example", get: () => "eyJhbGciOiJub25lIn0.e30." };
    await middleware(stranger, {}, () => undefined);
    assert.equal(stranger.scopeObserver, null);
  }
});
