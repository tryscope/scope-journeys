// J0.6 under the workerd pool: the platform facts from a synthetic request.cf, the policy cache's
// states, delivery's batching and retry, the inner hop's headers on a request with a body.
import { expect, test, beforeEach } from "vitest";

import { createHandler, deliver, loadPolicy, platformFacts, resetDelivery, resetPolicyCache } from "../src/index.js";
import type { RequestWithCf } from "../src/facts.js";
import policyDocument from "../../../fixtures/synthetic/policy.json" with { type: "json" };
import fixtureRequest from "../../../fixtures/synthetic/22-intent-header/request.json" with { type: "json" };
import fixtureUpstream from "../../../fixtures/synthetic/22-intent-header/upstream.json" with { type: "json" };

const identity = { install: "jin_test000000000000000000", name: "test-sensor", environment: "production" as const, saltEpoch: 1, dropped: 0, version: "0.0.0-test" };

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

test("the policy cache: a fresh fetch, a 304 on the second request, the last good document on a failure, the default on a cold failure", async () => {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const ifNoneMatch = new Headers(init?.headers).get("if-none-match");
    calls.push(ifNoneMatch ?? "fresh");
    if (calls.length === 1) return Response.json(policyDocument, { headers: { etag: '"v3"' } });
    if (calls.length === 2) return new Response(null, { status: 304 });
    throw new Error("network down");
  }) as typeof fetch;
  const log: string[] = [];
  const one = await loadPolicy({ url: "https://api.invalid/policy", credential: "k", fetch: fetcher, now: 0, cache: null, log: (l) => log.push(l) });
  expect(one.policy.version).toBe(3);
  expect(one.etag).toBe('"v3"');
  const two = await loadPolicy({ url: "https://api.invalid/policy", credential: "k", fetch: fetcher, now: 61_000, cache: null, log: (l) => log.push(l) });
  expect(calls[1]).toBe('"v3"');
  expect(two.policy).toBe(one.policy);
  const three = await loadPolicy({ url: "https://api.invalid/policy", credential: "k", fetch: fetcher, now: 122_000, cache: null, log: (l) => log.push(l) });
  expect(three.policy.version).toBe(3);
  expect(log.at(-1)).toMatch(/keeping the last good policy/);
  resetPolicyCache();
  const cold = await loadPolicy({ url: "https://api.invalid/policy", credential: "k", fetch: fetcher, now: 200_000, cache: null, log: (l) => log.push(l) });
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
  await deliver(records, { apiUrl: "https://api.invalid", key: "k", report: null, fetch: fetcher, log: (l) => log.push(l), retryDelayMs: 1 });
  expect(bodies).toEqual([500, 500, 1, 1]);
  expect(log.filter((l) => /retrying once/.test(l)).length).toBe(2);
  expect(log.filter((l) => /dropping/.test(l)).length).toBe(1);
});

test("the hop to the origin carries Via and the policy's headers, no accept-encoding and no content-length, on a request with a body", async () => {
  let seen: Request | null = null;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith("/policy")) return Response.json(policyDocument, { headers: { etag: '"v3"' } });
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
  expect(headers.get("x-acme-key")).toBe("sjk_test_k");
  expect(headers.get("accept-encoding")).toBeNull();
  expect(headers.get("content-length")).toBeNull();
  expect(response.headers.get("content-encoding")).toBeNull();
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
  await deliver(records, { apiUrl: "https://api.invalid", key: "k", report: null, fetch: fetcher, log: (l) => log.push(l), retryDelayMs: 1, maxRetryAfterMs: 5 });
  expect(Date.now() - started).toBeLessThan(1000);
  expect(log).toEqual(["journeys: shipment answered 429, retrying once in 5 ms", "journeys: shipment answered 429, dropping the batch"]);
  expect(answers.length).toBe(0);
  const { droppedSoFar } = await import("../src/deliver.js");
  expect(droppedSoFar()).toBe(3);
  answers.push({ status: 429, headers: { "retry-after": new Date(Date.now() + 1000).toUTCString() } }, { status: 200 });
  await deliver(records, { apiUrl: "https://api.invalid", key: "k", report: null, fetch: fetcher, log: (l) => log.push(l), retryDelayMs: 1, maxRetryAfterMs: 5 });
  expect(log.at(-1)).toBe("journeys: shipment answered 429, retrying once in 5 ms");
  expect(droppedSoFar()).toBe(0);
});

test("the policy answer's environment and salt epoch: taken from the headers, kept from the last answer when a later one carries none, epoch 1 and no environment before any answer", async () => {
  resetPolicyCache();
  let call = 0;
  const fetcher = (async () => {
    call += 1;
    if (call === 1) return Response.json(policyDocument, { headers: { etag: '"v3"', "x-journeys-environment": "preview", "x-journeys-salt-epoch": "2" } });
    return Response.json(policyDocument, { headers: { etag: '"v4"' } });
  }) as typeof fetch;
  const cold = await loadPolicy({ url: null, credential: null, fetch: fetcher, now: 0, cache: null, log: () => undefined });
  expect(cold.saltEpoch).toBeNull();
  expect(cold.environment).toBeNull();
  resetPolicyCache();
  const first = await loadPolicy({ url: "https://api.invalid/policy", credential: "k", fetch: fetcher, now: 0, cache: null, log: () => undefined });
  expect(first.environment).toBe("preview");
  expect(first.saltEpoch).toBe(2);
  const second = await loadPolicy({ url: "https://api.invalid/policy", credential: "k", fetch: fetcher, now: 61_000, cache: null, log: () => undefined });
  expect(second.etag).toBe('"v4"');
  expect(second.environment).toBe("preview");
  expect(second.saltEpoch).toBe(2);
});
