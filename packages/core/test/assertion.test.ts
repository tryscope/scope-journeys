// The assertion on the hop to the origin, run through the harness on fixture 30: the JWS
// verifies against the fixture's public key, the claims are the expected ones, the agent header
// rides beside it; the agent name by how it was named; no key means one errored decision.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { ASSERTION_TYP, agentName, assertionFromEnv, resetAssertionKeys } from "../src/assertion.js";
import type { ScopeRequest1 } from "../src/generated/request.js";
import { compilePolicy } from "../src/policy.js";
import { makeIo, runFixture, type Fixture } from "./harness.js";
import { fixtureAssertionKey } from "../../../scripts/assertion-fixture-key.mjs";

const SYNTHETIC = new URL("../../../fixtures/synthetic/", import.meta.url).pathname;
const read = (name: string, file: string): unknown => JSON.parse(readFileSync(join(SYNTHETIC, name, file), "utf8"));

function fixture(name: string, policyFile: string): Fixture {
  return { name, request: read(name, "request.json") as Fixture["request"], upstream: read(name, "upstream.json") as Fixture["upstream"], policy: JSON.parse(readFileSync(join(SYNTHETIC, policyFile), "utf8")), facts: read(name, "facts.json") as Fixture["facts"] };
}

const decode = (segment: string): unknown => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(segment.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));

test("fixture 30: the forwarded request carries an assertion that verifies against the install's public key, with the expected claims, and the agent header", async () => {
  const f = fixture("30-assertion-signed", "policy.assertion.json");
  const now = Date.parse(f.facts.ts ?? "");
  const result = await runFixture(f, makeIo({ upstream: f.upstream, now }));
  const hop = result.forwarded.find((r) => r.url === "/docs/quickstart");
  assert.ok(hop, "the hop to the origin");
  const jws = hop.headers["x-scope-assertion"];
  assert.ok(jws, "x-scope-assertion present");
  const [h, p, s] = jws.split(".");
  assert.ok(h && p && s);
  assert.deepEqual(decode(h), { alg: "ES256", kid: "jin_fixture0000000000000000:1", typ: ASSERTION_TYP });
  const { public_jwk } = fixtureAssertionKey();
  const { kid: _kid, ...jwk } = public_jwk;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const signature = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  assert.equal(signature.length, 64, "raw r||s, as JWS ES256 requires");
  assert.ok(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, new TextEncoder().encode(`${h}.${p}`)), "the signature verifies");
  const record = result.records.find((r): r is ScopeRequest1 => r.schema === "scope.request/1");
  assert.ok(record);
  const claims = decode(p) as Record<string, unknown>;
  assert.deepEqual(claims, {
    iss: "https://api.fixture.example/v1/installs/jin_fixture0000000000000000",
    aud: "acme.example",
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 300,
    jti: record.id,
    record: record.id,
    reader: "claude-code",
    agent: { name: "claude-code", named_by: "inferred" },
    signature: null,
    decisions: [],
    address_hash: record["scope.client.address_hash"],
    salt_epoch: 1,
    policy_version: record.observer.policy_version,
  });
  assert.equal(hop.headers["x-scope-agent"], "claude-code;inferred");
  assert.ok(!record["scope.decision"]?.some((d) => d.rule === "assertion"), "no errored decision when the key is present");
  const tampered = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, signature, new TextEncoder().encode(`${h}.${p}x`));
  assert.equal(tampered, false);
});

test("the assertion is omitted without a key, with one errored decision for the pseudo-rule, and off a listed audience", async () => {
  const f = fixture("30-assertion-signed", "policy.assertion.json");
  const facts = { ...f.facts };
  delete (facts as { assertion?: unknown }).assertion;
  const noKey = await runFixture({ ...f, facts }, makeIo({ upstream: f.upstream, now: Date.parse(f.facts.ts ?? "") }));
  const hop = noKey.forwarded.find((r) => r.url === "/docs/quickstart");
  assert.ok(hop && !("x-scope-assertion" in hop.headers) && !("x-scope-agent" in hop.headers));
  const record = noKey.records.find((r): r is ScopeRequest1 => r.schema === "scope.request/1");
  assert.deepEqual(record?.["scope.decision"]?.filter((d) => d.rule === "assertion"), [{ rule: "assertion", kind: "observe", mode: "live", outcome: "errored", reason: "no key" }]);
  assert.ok(noKey.logs.some((l) => /JOURNEYS_ASSERTION_KEY is not set/.test(l)));
  const elsewhere = compilePolicy({ ...(f.policy as Record<string, unknown>), assertion: { enabled: true, audience: ["other.example"] } });
  const offAudience = await runFixture(f, makeIo({ upstream: f.upstream, now: Date.parse(f.facts.ts ?? "") }), elsewhere);
  const hop2 = offAudience.forwarded.find((r) => r.url === "/docs/quickstart");
  assert.ok(hop2 && !("x-scope-assertion" in hop2.headers), "not for a host outside the audience");
});

test("the agent name: a verified signature, a declared header or MCP client, else the reader family", () => {
  const base = { "scope.signature": null, "scope.key.agent_header": null, "scope.mcp.client": null, "scope.reader": "claude-code" } as unknown as ScopeRequest1;
  assert.deepEqual(agentName(base), { name: "claude-code", named_by: "inferred" });
  assert.deepEqual(agentName({ ...base, "scope.key.agent_header": "codex" } as ScopeRequest1), { name: "codex", named_by: "declared" });
  assert.deepEqual(agentName({ ...base, "scope.mcp.client": { name: "cursor", version: "1.0" } } as unknown as ScopeRequest1), { name: "cursor", named_by: "declared" });
  assert.deepEqual(agentName({ ...base, "scope.key.agent_header": "codex", "scope.signature": { agent: "https://signer.example", keyid: "k", valid: true, reason: "verified", authority: "acme.example" } } as ScopeRequest1), { name: "https://signer.example", named_by: "verified" });
  assert.deepEqual(agentName({ ...base, "scope.signature": { agent: "https://signer.example", keyid: "k", valid: false, reason: "expired", authority: "acme.example" } } as ScopeRequest1), { name: "claude-code", named_by: "inferred" }, "an unverified signature names nothing");
});

test("assertionFromEnv: the private JWK with its kid imports once; anything else is no key", async () => {
  resetAssertionKeys();
  const { private_jwk } = fixtureAssertionKey();
  const issuer = "https://api.fixture.example/v1/installs/jin_fixture0000000000000000";
  const one = await assertionFromEnv(JSON.stringify(private_jwk), issuer);
  assert.equal(one?.kid, "jin_fixture0000000000000000:1");
  assert.equal(one?.issuer, issuer);
  assert.equal(await assertionFromEnv(JSON.stringify(private_jwk), issuer), one, "memoised per isolate");
  assert.equal(await assertionFromEnv(undefined, issuer), null);
  assert.equal(await assertionFromEnv(JSON.stringify(private_jwk), null), null, "no install id, no issuer, no assertion");
  assert.equal(await assertionFromEnv("not json", issuer), null);
  const { kid: _k, ...withoutKid } = private_jwk;
  assert.equal(await assertionFromEnv(JSON.stringify(withoutKid), issuer), null, "a key without its kid cannot name itself");
  const { d: _d, ...publicOnly } = private_jwk;
  assert.equal(await assertionFromEnv(JSON.stringify(publicOnly), issuer), null, "a public key cannot sign");
});
