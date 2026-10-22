// The Cloudflare form under the workerd pool: the platform facts from a synthetic request.cf, the
// policy cache's states, delivery's batching and retry, the inner hop's headers on a request with a
// body, and a hop that fails after the request left (never sent again).
import { beforeAll, beforeEach, expect, test } from "vitest";

import { DEFAULT_API_URL, loadPolicy, resetPolicyCache, trustPolicyKeyForTests } from "scope-journeys";

import { policySignature, signedNotModified, signedPolicy, TEST_POLICY_KID, testPolicyKeys } from "../../core/test/signed.js";

import { createHandler, deliver, platformFacts, resetDelivery } from "../src/index.js";
import type { RequestWithCf } from "../src/facts.js";
import policyDocument from "../../../fixtures/synthetic/policy.json" with { type: "json" };
import fixtureRequest from "../../../fixtures/synthetic/22-intent-header/request.json" with { type: "json" };
import fixtureUpstream from "../../../fixtures/synthetic/22-intent-header/upstream.json" with { type: "json" };

const identity = { install: "jin_test000000000000000000", name: "test-sensor", environment: "production" as const, saltEpoch: 1, dropped: 0, version: "0.0.0-test" };

// A Worker may not make keys while its module loads, so the test key is made and trusted here.
beforeAll(async () => trustPolicyKeyForTests(TEST_POLICY_KID, (await testPolicyKeys()).publicKey));

beforeEach(() => {
  resetPolicyCache();
  resetDelivery();
});

test("facts come from request.cf and cf-connecting-ip, nulls where the zone has no bot management", () => {
  const request = new Request("https://acme.example/docs", { headers: { "cf-connecting-ip": "2001:db8::1", "cf-ray": "abc-AMS" } }) as RequestWithCf;
  Object.defineProperty(request, "cf", { value: { asn: 64512, asOrganization: "Example", country: "NL", colo: "AMS", tlsVersion: "TLSv1.3", httpProtocol: "HTTP/2", tlsClientExtensionsSha1: "aa", tlsClientHelloLength: "512", botManagement: { ja4: "t13d", verifiedBot: true, verifiedBotCategory: "Search Engine Crawler", signedAgent: "https://crawler.exa.ai" } } });
  const facts = platformFacts(request, identity);
  expect(facts.address).toBe("2001:db8::1");
  expect(facts.family).toBe("ipv6");
  expect(facts.asn).toBe(64512);
  expect(facts.tls_hello_len).toBe(512);
  expect(facts.ja4).toBe("t13d");
  expect(facts.platform_bot).toEqual({ verified: true, name: null, category: "Search Engine Crawler", signed_agent: "https://crawler.exa.ai" });
  expect(facts.platform_request_id).toBe("abc-AMS");
  expect(facts.source).toBe("edge");
  const bare = platformFacts(new Request("https://acme.example/docs", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }) as RequestWithCf, identity);
  expect(bare.address).toBe("203.0.113.7");
  expect(bare.asn).toBeNull();
  expect(bare.platform_bot).toBeNull();
});

test("the policy cache: a fresh fetch, a 304 on the second request, the last good document on a failure, the default on a cold failure; the signature is checked in the Workers runtime", async () => {
  const calls: string[] = [];
  const held = JSON.stringify(policyDocument);
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const ifNoneMatch = new Headers(init?.headers).get("if-none-match");
    calls.push(ifNoneMatch ?? "fresh");
    if (calls.length === 1) return signedPolicy(policyDocument, { install: "jin_cf", issuedAt: 1, etag: '"v3"' });
    if (calls.length === 2) return signedNotModified(held, { install: "jin_cf", issuedAt: 2 });
    throw new Error("network down");
  }) as typeof fetch;
  const log: string[] = [];
  const one = await loadPolicy({ installId: "jin_cf", url: "https://api.invalid/policy", credential: "k", fetch: fetcher, now: 0, cache: null, log: (l) => log.push(l) });
  expect(one.policy.version).toBe(3);
  expect(one.signed?.etag).toBe('"v3"');
  const two = await loadPolicy({ installId: "jin_cf", url: "https://api.invalid/policy", credential: "k", fetch: fetcher, now: 61_000, cache: null, log: (l) => log.push(l) });
  expect(calls[1]).toBe('"v3"');
  expect(two.policy).toBe(one.policy);
  expect(log, "the 304's signature over the held body holds").toEqual([]);
  const three = await loadPolicy({ installId: "jin_cf", url: "https://api.invalid/policy", credential: "k", fetch: fetcher, now: 122_000, cache: null, log: (l) => log.push(l) });
  expect(three.policy.version).toBe(3);
  expect(log.at(-1)).toMatch(/keeping the last good policy/);
  resetPolicyCache();
  const cold = await loadPolicy({ installId: "jin_cf", url: "https://api.invalid/policy", credential: "k", fetch: fetcher, now: 200_000, cache: null, log: (l) => log.push(l) });
  expect(cold.policy.version).toBe(0);
  expect(cold.policy.rules).toEqual([]);
  expect(log.at(-1)).toMatch(/embedded default/);
});

test("delivery batches 500 per body, retries once on a 5xx and counts a dropped batch", async () => {
  const statuses = [503, 200, 503, 503];
  const bodies: number[] = [];
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const bytes = new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer());
    const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
    bodies.push((JSON.parse(text) as unknown[]).length);
    return new Response(null, { status: statuses.shift() ?? 200 });
  }) as typeof fetch;
  const records = Array.from({ length: 501 }, (_, i) => ({ schema: "scope.declaration/1", id: String(i) }) as never);
  const log: string[] = [];
  await deliver(records, { apiUrl: "https://api.invalid", key: "k", fetch: fetcher, log: (l) => log.push(l), retryDelayMs: 1 });
  expect(bodies).toEqual([500, 500, 1, 1]);
  expect(log.filter((l) => /retrying once/.test(l)).length).toBe(2);
  expect(log.filter((l) => /dropping/.test(l)).length).toBe(1);
});

test("the hop to the origin carries Via and the policy's headers, no accept-encoding and no content-length, on a request with a body", async () => {
  let seen: Request | null = null;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/policy")) return signedPolicy(policyDocument, { install: "jin_test000000000000000000", issuedAt: Math.floor(Date.now() / 1000), etag: '"v3"' });
    if (url.startsWith("https://origin.invalid")) {
      seen = new Request(url, init);
      return new Response(fixtureUpstream.body, { status: fixtureUpstream.status, headers: fixtureUpstream.headers });
    }
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  const handler = createHandler({ fetch: fetcher, env: { JOURNEYS_INSTALL_ID: "jin_test000000000000000000", JOURNEYS_INSTALL_KEY: "sjk_test_k", JOURNEYS_SALT: "s", JOURNEYS_ORIGIN: "https://origin.invalid", JOURNEYS_API_URL: "https://api.invalid", JOURNEYS_NAME: "test-sensor" } });
  const pending: Promise<unknown>[] = [];
  const request = new Request(fixtureRequest.url, { method: fixtureRequest.method, headers: { ...fixtureRequest.headers, "accept-encoding": "gzip, br", "content-length": String(fixtureRequest.body?.length ?? 0) }, body: fixtureRequest.body });
  const response = await handler.fetch(request, {}, { waitUntil: (p) => pending.push(p), passThroughOnException: () => undefined });
  expect(response.status).toBe(201);
  await response.text();
  await Promise.all(pending);
  expect(seen).not.toBeNull();
  const headers = (seen as unknown as Request).headers;
  expect(headers.get("via")).toBe("1.1 test-sensor");
  expect(headers.get("x-acme-edge")).toBe("journeys");
  expect(headers.get("x-acme-key"), "the install key never goes to the origin, whatever the policy names").toBeNull();
  expect(headers.get("accept-encoding")).toBeNull();
  expect(headers.get("content-length")).toBeNull();
  expect(response.headers.get("content-encoding")).toBeNull();
});

test("a hop that fails after the request left is never sent again: 504 on the hop's timeout, 502 on any other failure, one fetch to the origin, the record shipped with the status and the hop's step", async () => {
  const cases: Array<[unknown, number, string]> = [
    [new DOMException("The operation was aborted due to timeout", "TimeoutError"), 504, "TimeoutError: answered 504, not sent again"],
    [new Error("Network connection lost."), 502, "Error: answered 502, not sent again"],
  ];
  for (const [failure, status, reason] of cases) {
    let hops = 0;
    const shipped: Array<Record<string, unknown>> = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.endsWith("/policy")) return signedPolicy(policyDocument, { install: "jin_test000000000000000000", issuedAt: Math.floor(Date.now() / 1000), etag: '"v3"' });
      if (url.startsWith("https://origin.invalid")) {
        hops += 1;
        throw failure;
      }
      const bytes = new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer());
      shipped.push(...(JSON.parse(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text()) as Array<Record<string, unknown>>));
      return new Response(null, { status: 202 });
    }) as typeof fetch;
    const handler = createHandler({ fetch: fetcher, env: { JOURNEYS_INSTALL_ID: "jin_test000000000000000000", JOURNEYS_INSTALL_KEY: "sjk_test_k", JOURNEYS_SALT: "s", JOURNEYS_ORIGIN: "https://origin.invalid", JOURNEYS_API_URL: "https://api.invalid" } });
    const pending: Promise<unknown>[] = [];
    const checkout = new Request("https://acme.example/api/v1/actions/checkout", { method: "POST", headers: { "content-type": "application/json", "user-agent": "Claude-User (claude-code/2.1.0)" }, body: JSON.stringify({ amount: 100 }) });
    const response = await handler.fetch(checkout, {}, { waitUntil: (p) => pending.push(p), passThroughOnException: () => undefined });
    expect(response.status).toBe(status);
    await response.text();
    await Promise.all(pending);
    expect(hops, "the origin is asked once").toBe(1);
    const record = shipped.find((r) => r.schema === "scope.request/1");
    expect(record?.["http.response.status_code"]).toBe(status);
    expect((record?.["scope.decision"] as Array<Record<string, unknown>>).filter((d) => d.rule === "hop")).toEqual([{ rule: "hop", kind: "observe", mode: "live", outcome: "errored", reason }]);
    expect(record?.["scope.observer.errors"]).toEqual([]);
  }
});

test("an origin that is not an http or https URL is refused before the hop: the request is left to passThroughOnException, never answered 502", async () => {
  let hops = 0;
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/policy")) return signedPolicy(policyDocument, { install: "jin_test000000000000000000", issuedAt: Math.floor(Date.now() / 1000), etag: '"v3"' });
    if (!url.startsWith("https://api.invalid")) hops += 1;
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  const handler = createHandler({ fetch: fetcher, env: { JOURNEYS_INSTALL_ID: "jin_test000000000000000000", JOURNEYS_INSTALL_KEY: "sjk_test_k", JOURNEYS_SALT: "s", JOURNEYS_ORIGIN: "origin.example.com", JOURNEYS_API_URL: "https://api.invalid" } });
  await expect(handler.fetch(new Request("https://acme.example/docs/quickstart", { headers: { accept: "text/html" } }), {}, { waitUntil: () => undefined, passThroughOnException: () => undefined })).rejects.toThrow(/JOURNEYS_ORIGIN is not an http or https URL/);
  // An origin with no host, checked alone: the visitor's path never names where the hop goes.
  const hostless = createHandler({ fetch: fetcher, env: { JOURNEYS_INSTALL_ID: "jin_test000000000000000000", JOURNEYS_INSTALL_KEY: "sjk_test_k", JOURNEYS_SALT: "s", JOURNEYS_ORIGIN: "https://", JOURNEYS_API_URL: "https://api.invalid" } });
  await expect(hostless.fetch(new Request("https://acme.example/example.com/checkout", { headers: { accept: "text/html" } }), {}, { waitUntil: () => undefined, passThroughOnException: () => undefined })).rejects.toThrow(/JOURNEYS_ORIGIN is not an http or https URL/);
  expect(hops).toBe(0);
  // An empty value is unset: the hop goes to the request's own URL.
  const unset = createHandler({ fetch: fetcher, env: { JOURNEYS_INSTALL_ID: "jin_test000000000000000000", JOURNEYS_INSTALL_KEY: "sjk_test_k", JOURNEYS_SALT: "s", JOURNEYS_ORIGIN: "", JOURNEYS_API_URL: "https://api.invalid" } });
  const pending: Promise<unknown>[] = [];
  const response = await unset.fetch(new Request("https://acme.example/docs/quickstart", { headers: { accept: "text/html" } }), {}, { waitUntil: (p) => pending.push(p), passThroughOnException: () => undefined });
  await response.text();
  await Promise.all(pending);
  expect(hops).toBe(1);
});

test("the policy never chooses where traffic or records go: the hop goes to JOURNEYS_ORIGIN and the records to Scope's production API by default, whatever the policy's origin and report say", async () => {
  const urls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    urls.push(url);
    if (url.endsWith("/policy")) return signedPolicy({ ...policyDocument, origin: "https://evil.example", report: { url: "https://evil.example/ingest" } }, { install: "jin_test000000000000000000", issuedAt: Math.floor(Date.now() / 1000), etag: '"v3"' });
    if (url.startsWith("https://origin.invalid")) return new Response("<!doctype html><html><body><h1>Quickstart</h1></body></html>", { status: 200, headers: { "content-type": "text/html" } });
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  const handler = createHandler({ fetch: fetcher, env: { JOURNEYS_INSTALL_ID: "jin_test000000000000000000", JOURNEYS_INSTALL_KEY: "sjk_test_k", JOURNEYS_SALT: "s", JOURNEYS_ORIGIN: "https://origin.invalid" } });
  const pending: Promise<unknown>[] = [];
  const response = await handler.fetch(new Request("https://acme.example/docs/quickstart", { headers: { accept: "text/html", "user-agent": "Claude-User (claude-code/2.1.0)" } }), {}, { waitUntil: (p) => pending.push(p), passThroughOnException: () => undefined });
  await response.text();
  await Promise.all(pending);
  expect(urls).toEqual([`${DEFAULT_API_URL}/v1/installs/jin_test000000000000000000/policy`, "https://origin.invalid/docs/quickstart", `${DEFAULT_API_URL}/v1/requests`]);

  urls.length = 0;
  resetPolicyCache();
  const unconfigured = createHandler({ fetch: fetcher, env: { JOURNEYS_SALT: "s", JOURNEYS_ORIGIN: "https://origin.invalid" } });
  const later: Promise<unknown>[] = [];
  await (await unconfigured.fetch(new Request("https://acme.example/docs/quickstart?email=a%40b.example", { headers: { accept: "text/html" } }), {}, { waitUntil: (p) => later.push(p), passThroughOnException: () => undefined })).text();
  await Promise.all(later);
  expect(urls, "no install, no key: the request reaches the origin and nothing reaches Scope").toEqual(["https://origin.invalid/docs/quickstart?email=a%40b.example"]);
});

test("delivery on a 429: one retry after Retry-After (capped), then the batch is dropped and counted; a 429 then a 200 ships and clears the count", async () => {
  const answers: Array<{ status: number; headers?: Record<string, string> }> = [{ status: 429, headers: { "retry-after": "120" } }, { status: 429 }];
  const fetcher = (async () => {
    const next = answers.shift() ?? { status: 200 };
    return new Response(null, { status: next.status, headers: next.headers });
  }) as typeof fetch;
  const records = Array.from({ length: 3 }, (_, i) => ({ schema: "scope.declaration/1", id: String(i) }) as never);
  const log: string[] = [];
  const started = Date.now();
  await deliver(records, { apiUrl: "https://api.invalid", key: "k", fetch: fetcher, log: (l) => log.push(l), retryDelayMs: 1, maxRetryAfterMs: 5 });
  expect(Date.now() - started).toBeLessThan(1000);
  expect(log).toEqual(["journeys: shipment answered 429, retrying once in 5 ms", "journeys: shipment answered 429, dropping the batch"]);
  expect(answers.length).toBe(0);
  const { droppedSoFar } = await import("../src/deliver.js");
  expect(droppedSoFar()).toBe(3);
  answers.push({ status: 429, headers: { "retry-after": new Date(Date.now() + 1000).toUTCString() } }, { status: 200 });
  await deliver(records, { apiUrl: "https://api.invalid", key: "k", fetch: fetcher, log: (l) => log.push(l), retryDelayMs: 1, maxRetryAfterMs: 5 });
  expect(log.at(-1)).toBe("journeys: shipment answered 429, retrying once in 5 ms");
  expect(droppedSoFar()).toBe(0);
});

test("the policy answer's environment and salt epoch: taken from the signed headers, an answer without them refused and the last one's kept, none before any answer", async () => {
  resetPolicyCache();
  let call = 0;
  const fetcher = (async () => {
    call += 1;
    if (call === 1) return signedPolicy(policyDocument, { install: "jin_cf", issuedAt: 1, environment: "preview", saltEpoch: "2", etag: '"v3"' });
    const body = JSON.stringify(policyDocument);
    return new Response(body, { headers: { etag: '"v4"', "x-journeys-signature": await policySignature("jin_cf", "production", "1", 2, body) } });
  }) as typeof fetch;
  const cold = await loadPolicy({ installId: null, url: null, credential: null, fetch: fetcher, now: 0, cache: null, log: () => undefined });
  expect(cold.saltEpoch).toBeNull();
  expect(cold.environment).toBeNull();
  resetPolicyCache();
  const first = await loadPolicy({ installId: "jin_cf", url: "https://api.invalid/policy", credential: "k", fetch: fetcher, now: 0, cache: null, log: () => undefined });
  expect(first.environment).toBe("preview");
  expect(first.saltEpoch).toBe(2);
  const second = await loadPolicy({ installId: "jin_cf", url: "https://api.invalid/policy", credential: "k", fetch: fetcher, now: 61_000, cache: null, log: () => undefined });
  expect(second.signed?.etag).toBe('"v3"');
  expect(second.environment).toBe("preview");
  expect(second.saltEpoch).toBe(2);
});

test("shipping follows no redirect: a redirected batch is dropped and counted", async () => {
  resetDelivery();
  const redirects: Array<RequestRedirect | undefined> = [];
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    redirects.push(init?.redirect);
    return new Response(null, { status: 307, headers: { location: "https://other.example/v1/requests" } });
  }) as typeof fetch;
  const log: string[] = [];
  await deliver([{ schema: "scope.declaration/1", id: "1" } as never], { apiUrl: "https://api.invalid", key: "k", fetch: fetcher, log: (l) => log.push(l), retryDelayMs: 1 });
  expect(redirects).toEqual(["manual"]);
  expect(log).toEqual(["journeys: shipment refused with 307; dropping the batch"]);
  const { droppedSoFar } = await import("../src/deliver.js");
  expect(droppedSoFar()).toBe(1);
  resetDelivery();
});
