// The shape-hash leak test: redaction by field name misses signed values under unexpected field
// names; redaction by value shape catches them. Twelve values of the toy product's signed shape are
// planted in a path segment, query values, JSON body fields under names the field list does not
// know, a form body, a Location header and an error message body, and in a text and an HTML body;
// no record may carry any of them raw, and each is hashed where its field is recorded.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { FIXTURE_SALT, makeIo, runFixture, sha12, type Fixture, type FixtureFacts, type FixtureRequest, type FixtureUpstream } from "../../packages/core/test/harness.js";
import type { ScopeRequest1 } from "../../packages/core/src/generated/request.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const SYNTHETIC = join(ROOT, "fixtures", "synthetic");

interface Interaction {
  name: string;
  planted: string[];
  hashedWhere?: string[];
  expect?: "bytes-and-type" | "page-facts";
  request: FixtureRequest;
  upstream: FixtureUpstream;
}

const leak = JSON.parse(readFileSync(join(SYNTHETIC, "leak", "interactions.json"), "utf8")) as { planted: string[]; interactions: Interaction[]; bodies: Interaction[] };
const policy = JSON.parse(readFileSync(join(SYNTHETIC, "policy.json"), "utf8")) as { secrets: { shapes: string[] } };
const facts: FixtureFacts = { address: "203.0.113.9", asn: 64512, as_org: "Example", country: "NL", colo: "AMS", tls: { protocol_version: "TLSv1.3", network_protocol_version: "HTTP/2", ja4: null, tls_ext_sha1: null, tls_hello_len: null }, platform_request_id: "leak-test" };

const SHAPE = new RegExp(policy.secrets.shapes[0] ?? "(?!)");

test("the twelve planted values match the toy policy's signed shape (the test plants what the policy hashes)", () => {
  assert.equal(leak.planted.length, 12);
  for (const value of leak.planted) assert.match(value, SHAPE, `${value} is not of the policy's shape`);
  const inFixtures = new Set([...leak.interactions, ...leak.bodies].flatMap((i) => i.planted));
  assert.deepEqual([...inFixtures].sort(), [...leak.planted].sort(), "every planted value is used by exactly the interactions");
});

test("no record carries a planted value raw, and each is hashed where its field is recorded (six interactions)", async () => {
  for (const interaction of leak.interactions) {
    const fixture: Fixture = { name: `leak/${interaction.name}`, request: interaction.request, upstream: interaction.upstream, policy, facts };
    const result = await runFixture(fixture, makeIo({ upstream: interaction.upstream }));
    assert.ok(result.records.length >= 1, `${interaction.name}: no record`);
    const serialised = JSON.stringify(result.records);
    for (const value of interaction.planted) {
      assert.ok(!serialised.includes(value), `${interaction.name}: the record carries ${value.slice(0, 6)}... raw`);
      const hash = await sha12(FIXTURE_SALT, value);
      assert.match(hash, /^[0-9a-f]{12}$/);
      const record = result.records[0] as ScopeRequest1;
      const where = (interaction.hashedWhere ?? []).map((field) => JSON.stringify((record as unknown as Record<string, unknown>)[field] ?? null));
      assert.ok(where.some((text) => text.includes(hash)), `${interaction.name}: the hash of a planted value is absent from ${interaction.hashedWhere?.join(", ")}`);
    }
  }
});

test("a text body is recorded as bytes and type only; an HTML page as page facts only; neither carries the planted value", async () => {
  for (const interaction of leak.bodies) {
    const fixture: Fixture = { name: `leak/${interaction.name}`, request: interaction.request, upstream: interaction.upstream, policy, facts };
    const result = await runFixture(fixture, makeIo({ upstream: interaction.upstream }));
    const record = result.records[0] as ScopeRequest1;
    const serialised = JSON.stringify(result.records);
    for (const value of interaction.planted) assert.ok(!serialised.includes(value), `${interaction.name}: the record carries ${value.slice(0, 6)}... raw`);
    if (interaction.expect === "bytes-and-type") {
      const body = record["scope.body.response"] as Record<string, unknown> | null;
      assert.ok(body, `${interaction.name}: an observed text answer is recorded as bytes and type`);
      assert.deepEqual(Object.keys(body).sort(), ["bytes", "type"]);
      assert.equal(body.type, "text/plain");
      assert.equal(body.bytes, interaction.upstream.body?.length ?? 0);
    } else {
      assert.equal(record["scope.body.response"], null, `${interaction.name}: a page body is never recorded`);
      assert.ok(record["scope.page"], `${interaction.name}: a page read carries its page facts`);
      assert.equal(record["scope.page"]?.face, "html");
    }
  }
});
