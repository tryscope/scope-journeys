// The Next form end to end on Node: the policy from
// the install's route with its environment header, the facts from Vercel's headers, the inner hop
// to the app's own host marked as such, the records shipped after the response with the install
// key or the OIDC token as the bearer, the pass-throughs (the inner hop, a host not observed, no
// install id), and the shipper's 429 (one retry after Retry-After, capped, then a counted drop).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { NextRequest } from "next/server.js";

import { droppedSoFar } from "../src/deliver.js";
import { DEFAULT_API_URL, loadPolicy, resetPolicyCache } from "scope-journeys";

import { INNER_HEADER, deliver, resetCache, resetDelivery, withJourneys } from "../src/index.js";

const POLICY = JSON.parse(readFileSync(new URL("../../../fixtures/synthetic/policy.json", import.meta.url), "utf8")) as Record<string, unknown>;
const INSTALL = "jin_test0000000000000000000000";
const API = "https://api.test.invalid";

interface World {
  calls: Array<{ url: string; method: string; headers: Record<string, string>; body: string | null }>;
  shipped: unknown[][];
  pending: Promise<unknown>[];
  fetch: typeof fetch;
  event: { waitUntil(p: Promise<unknown>): void };
}

async function gunzip(body: BodyInit | null | undefined): Promise<string> {
  const bytes = new Uint8Array(await new Response(body ?? null).arrayBuffer());
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
}

function world(options: { policyStatus?: number; ship?: Array<{ status: number; headers?: Record<string, string> }>; api?: string } = {}): World {
  const api = options.api ?? API;
  const w: World = {
    calls: [],
    shipped: [],
    pending: [],
    event: { waitUntil: (p) => w.pending.push(p) },
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const headers: Record<string, string> = {};
      new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).forEach((v, k) => (headers[k] = v));
      const method = init?.method ?? "GET";
      if (url === `${api}/v1/installs/${INSTALL}/policy`) {
        w.calls.push({ url, method, headers, body: null });
        if (options.policyStatus && options.policyStatus !== 200) return new Response(null, { status: options.policyStatus });
        return Response.json(POLICY, { headers: { etag: '"3"', "x-journeys-environment": "preview", "x-journeys-salt-epoch": "2" } });
      }
      if (url === `${api}/v1/requests`) {
        const text = await gunzip(init?.body);
        w.calls.push({ url, method, headers, body: text });
        w.shipped.push(JSON.parse(text) as unknown[]);
        const answer = options.ship?.shift() ?? { status: 202 };
        return new Response(null, { status: answer.status, headers: answer.headers });
      }
      // The app's own host: the inner hop, answered as the origin would.
      w.calls.push({ url, method, headers, body: init?.body ? await new Response(init.body as BodyInit).text() : null });
      return new Response("<!doctype html><html><body><h1>Quickstart</h1><a href=\"https://acme.example/docs/install\">Install</a></body></html>", { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
    }) as typeof fetch,
  };
  return w;
}

const request = (url: string, headers: Record<string, string> = {}): NextRequest => new NextRequest(url, { headers: { accept: "text/html", "user-agent": "Claude-User (claude-code/2.1.0; +https://www.anthropic.com/claude-code)", "x-real-ip": "203.0.113.7", "x-vercel-ip-as-number": "64512", "x-vercel-ip-country": "NL", "x-vercel-ja4-digest": "t13d1516h2_8daaf6152771_e5627efa2ab1", "x-vercel-id": "ams1::abc", ...headers } });

const env = { JOURNEYS_INSTALL_ID: INSTALL, JOURNEYS_INSTALL_KEY: "sjk_test_dddddddddddddddddddddddddddddddd", JOURNEYS_SALT: "fixture-salt", JOURNEYS_API_URL: API };

function reset(): void {
  resetPolicyCache();
  resetDelivery();
  resetCache();
}

test("a page read: the policy from the install's route, the inner hop marked and forwarded with Via, the response passed back, one record shipped with the install key, the facts from Vercel's headers", async () => {
  reset();
  const w = world();
  const handler = withJourneys({ env, fetch: w.fetch, now: () => Date.parse("2026-10-10T12:00:00.000Z") });
  const response = await handler(request("https://acme.example/docs/quickstart"), w.event as never);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<h1>Quickstart<\/h1>/);
  await Promise.all(w.pending);
  const policy = w.calls.find((c) => c.url.endsWith("/policy"));
  assert.ok(policy, "the policy fetched from the install's route");
  assert.equal(policy.headers.authorization, `Bearer ${env.JOURNEYS_INSTALL_KEY}`);
  const hop = w.calls.find((c) => c.url === "https://acme.example/docs/quickstart");
  assert.ok(hop, "the inner hop to the app's own host");
  assert.equal(hop.headers[INNER_HEADER], "1", "the forward sets the marker the check reads");
  assert.match(hop.headers.via ?? "", /scope-journeys/);
  assert.equal(hop.headers["accept-encoding"], "identity", "the hop asks for an uncompressed answer: fetch would add gzip, deflate to a request without one");
  assert.equal(hop.headers["x-acme-key"], undefined, "the install key never goes to the origin, whatever the policy names");
  assert.equal(w.shipped.length, 1, "one shipment after the response");
  const [records] = w.shipped;
  const record = (records as Array<Record<string, unknown>>).find((r) => r.schema === "scope.request/1") as Record<string, unknown>;
  assert.ok(record);
  assert.equal(record.install, INSTALL);
  assert.equal(record.source, "inapp");
  assert.deepEqual(record.observer, { package: "scope-journeys-next", version: record.observer && (record.observer as { version: string }).version, adapter: "next", policy_version: 3, salt_epoch: 2, name: "scope-journeys" });
  assert.equal(record["scope.client.asn"], 64512);
  assert.equal(record["scope.client.country"], "NL");
  assert.equal(record["scope.client.ja4"], "t13d1516h2_8daaf6152771_e5627efa2ab1");
  assert.equal(record.request_id, "ams1::abc");
  assert.equal(record["scope.reader"], "claude-code");
  assert.equal(record["scope.route"], "docs");
  assert.match(String(record["scope.client.address_hash"]), /^[0-9a-f]{12}$/);
  assert.equal(record["server.address"], "acme.example");
  const decisions = record["scope.decision"] as Array<{ mode: string }>;
  assert.ok(decisions.length > 0 && decisions.every((d) => d.mode === "live"), "the policy's live rules are live on the preview environment the API named");
  const shipment = w.calls.find((c) => c.url.endsWith("/v1/requests"));
  assert.equal(shipment?.headers["content-encoding"], "gzip");
  assert.equal(shipment?.headers.authorization, `Bearer ${env.JOURNEYS_INSTALL_KEY}`);
});

test("with no JOURNEYS_API_URL the policy and the records go to Scope's production API; a plain-http one is refused once and nothing is fetched or sent", async () => {
  reset();
  const production = world({ api: DEFAULT_API_URL });
  const installed = { JOURNEYS_INSTALL_ID: INSTALL, JOURNEYS_INSTALL_KEY: env.JOURNEYS_INSTALL_KEY, JOURNEYS_SALT: env.JOURNEYS_SALT };
  const handler = withJourneys({ env: installed, fetch: production.fetch });
  await (await handler(request("https://acme.example/docs/quickstart"), production.event as never)).text();
  await Promise.all(production.pending);
  assert.deepEqual(production.calls.map((c) => c.url).filter((u) => u.startsWith(DEFAULT_API_URL)), [`${DEFAULT_API_URL}/v1/installs/${INSTALL}/policy`, `${DEFAULT_API_URL}/v1/requests`]);

  reset();
  const plain = world({ api: "http://api.test.invalid" });
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (line: string) => {
    warnings.push(line);
  };
  try {
    const refusing = withJourneys({ env: { ...installed, JOURNEYS_API_URL: "http://api.test.invalid" }, fetch: plain.fetch });
    for (let i = 0; i < 2; i += 1) await (await refusing(request("https://acme.example/docs/quickstart"), plain.event as never)).text();
  } finally {
    console.warn = realWarn;
  }
  await Promise.all(plain.pending);
  assert.deepEqual(plain.calls.map((c) => c.url).filter((u) => !u.startsWith("https://acme.example")), [], "no policy fetch and no shipment over plain http");
  assert.equal(warnings.filter((l) => /JOURNEYS_API_URL must be https/.test(l)).length, 1, "said once");

  reset();
  const keyless = world({ api: DEFAULT_API_URL });
  const unkeyed = withJourneys({ env: { JOURNEYS_INSTALL_ID: INSTALL, JOURNEYS_SALT: env.JOURNEYS_SALT }, fetch: keyless.fetch });
  await (await unkeyed(request("https://acme.example/docs/quickstart"), keyless.event as never)).text();
  await Promise.all(keyless.pending);
  assert.deepEqual(keyless.calls.map((c) => c.url).filter((u) => u.endsWith("/v1/requests")), [], "no install key and no OIDC token: nothing ships");
});

test("the inner hop and a host the install does not observe go to the app's own logic untouched, with no fetch", async () => {
  reset();
  const w = world();
  const seen: string[] = [];
  const next = async (r: NextRequest): Promise<Response> => {
    seen.push(`${r.headers.get("host") ?? new URL(r.url).host} ${r.headers.get(INNER_HEADER) ?? "-"}`);
    return new Response("mine", { status: 200 });
  };
  const handler = withJourneys({ env: { ...env, JOURNEYS_HOST: "acme.example" }, fetch: w.fetch, next });
  const inner = await handler(request("https://acme.example/docs/quickstart", { [INNER_HEADER]: "1" }), w.event as never);
  assert.equal(await inner.text(), "mine");
  assert.equal(w.calls.length, 0, "the inner pass fetches nothing: no policy, no hop");
  const other = await handler(request("https://other.example/docs/quickstart"), w.event as never);
  assert.equal(await other.text(), "mine");
  await Promise.all(w.pending);
  assert.deepEqual(seen, ["acme.example 1", "other.example -"]);
  assert.equal(w.calls.length, 0, "an unobserved host fetches nothing either");
  assert.equal(w.shipped.length, 0, "nothing observed, nothing shipped");
});

test("no install id and no policy URL: the probe is answered by the adapter itself, every other request goes to the app's own logic with no inner hop and no fetch, one warning", async () => {
  reset();
  const w = world();
  const seen: string[] = [];
  const next = async (r: NextRequest): Promise<Response> => {
    seen.push(`${new URL(r.url).pathname} ${r.headers.get(INNER_HEADER) ?? "-"}`);
    return new Response("mine", { status: 200 });
  };
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (line: string) => {
    warnings.push(line);
  };
  try {
    const handler = withJourneys({ env: { JOURNEYS_SALT: "s" }, fetch: w.fetch, next });
    const page = await handler(request("https://acme.example/docs/quickstart"), w.event as never);
    assert.equal(await page.text(), "mine");
    const twin = await handler(request("https://acme.example/docs/quickstart.md", { accept: "text/markdown" }), w.event as never);
    assert.equal(await twin.text(), "mine");
    const probe = await handler(request("https://acme.example/.well-known/journeys-probe?journeys_probe=c21va2U"), w.event as never);
    assert.equal(probe.status, 204);
    assert.equal(probe.headers.get("x-journeys-probe"), "received");
    assert.equal(probe.headers.get("cache-control"), "no-store");
    const posted = await handler(new NextRequest("https://acme.example/.well-known/journeys-probe", { method: "POST" }), w.event as never);
    assert.equal(await posted.text(), "mine", "only a GET of the probe path is the probe");
  } finally {
    console.warn = realWarn;
  }
  await Promise.all(w.pending);
  assert.deepEqual(seen, ["/docs/quickstart -", "/docs/quickstart.md -", "/.well-known/journeys-probe -"]);
  assert.equal(w.calls.length, 0, "no policy fetch, no hop, no shipment without an install");
  assert.equal(warnings.filter((l) => /JOURNEYS_INSTALL_ID is not set/.test(l)).length, 1, warnings.join("\n"));
});

test("the proxy's own URL names the listen address, not the host the client named: the hop goes to the listen address with the marker, and the re-entered proxy hands it to the app without a second hop", async () => {
  // `next start -H 127.0.0.1 -p 3917` builds request.url on localhost:3917 while Host and
  // x-forwarded-host say 127.0.0.1:3917; the server receiving the hop runs the proxy again with
  // the same rebuilt URL and the hop's headers, x-forwarded-host among them. Before the fix the
  // adapter compared the URL's host with the header's, took the hop for a fetch to another host,
  // sent it without the marker, and the chain recursed until Node answered 431.
  reset();
  const w = world();
  const seen: string[] = [];
  const hops: Array<{ url: string; inner: string | null; via: string | null }> = [];
  let depth = 0;
  let deepest = 0;
  const app = async (r: NextRequest): Promise<Response> => {
    seen.push(`${r.headers.get(INNER_HEADER) ?? "-"} ${r.url}`);
    return new Response("# Scope Journeys\n", { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  };
  const server = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    // Scope's API at its default address: no policy and no ingest here, so the embedded default runs.
    if (url.startsWith(DEFAULT_API_URL)) return new Response(null, { status: 404 });
    const headers = new Headers(init?.headers);
    hops.push({ url, inner: headers.get(INNER_HEADER), via: headers.get("via") });
    depth += 1;
    deepest = Math.max(deepest, depth);
    if (depth > 20) throw new Error("the hop re-entered the sensor without bound");
    try {
      const rebuilt = new URL(url);
      rebuilt.host = "localhost:3917";
      return await handler(new NextRequest(rebuilt, { method: init?.method ?? "GET", headers }), w.event as never);
    } finally {
      depth -= 1;
    }
  }) as typeof fetch;
  const handler = withJourneys({ env: { JOURNEYS_INSTALL_ID: INSTALL, JOURNEYS_SALT: "s" }, fetch: server, next: app });
  const response = await handler(new NextRequest("http://localhost:3917/llms.txt", { headers: { host: "127.0.0.1:3917", "x-forwarded-host": "127.0.0.1:3917", "x-forwarded-proto": "http", "x-forwarded-for": "127.0.0.1", accept: "*/*", "user-agent": "curl/8.1.1" } }), w.event as never);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "# Scope Journeys\n");
  await Promise.all(w.pending);
  assert.deepEqual(hops, [{ url: "http://localhost:3917/llms.txt", inner: "1", via: "1.1 scope-journeys" }], "exactly one hop, to the listen address, marked");
  assert.deepEqual(seen, ["1 http://localhost:3917/llms.txt"], "the app saw the request once, as the inner pass");
  assert.equal(deepest, 1);
});

test("the host observed is the one the agent spoke to: under next start the forwarded host, never the listen address the request URL names, with the hop to the listen address once; on Vercel nothing changes; with neither forwarded header the URL's host; JOURNEYS_HOST matches the resolved host", async () => {
  reset();
  const w = world();
  const hops: Array<{ url: string; inner: string | null; forwardedHost: string | null; proto: string | null }> = [];
  // The app answers the hop as a product would: its MCP link names the host the agent spoke to, which the policy's inject rule matches on {host}.
  const app = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith(API)) return w.fetch(input, init);
    const headers = new Headers(init?.headers);
    hops.push({ url, inner: headers.get(INNER_HEADER), forwardedHost: headers.get("x-forwarded-host"), proto: headers.get("x-forwarded-proto") });
    const spoken = headers.get("x-forwarded-host") ?? new URL(url).host;
    return new Response(`<!doctype html><html><body><h1>Quickstart</h1><a href="https://${spoken}/mcp">MCP</a></body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
  }) as typeof fetch;
  const handler = withJourneys({ env, fetch: app, now: () => Date.parse("2026-10-10T12:00:00.000Z") });
  const shapes: Array<{ name: string; url: string; headers: Record<string, string>; hop: string; host: string; proto: string | null }> = [
    { name: "next start behind a proxy", url: "http://localhost:3917/docs/quickstart", headers: { host: "docs.example", "x-forwarded-host": "docs.example", "x-forwarded-proto": "https" }, hop: "http://localhost:3917/docs/quickstart", host: "docs.example", proto: "https" },
    { name: "next start reached directly", url: "http://localhost:3917/docs/quickstart", headers: { host: "127.0.0.1:3917", "x-forwarded-host": "127.0.0.1:3917", "x-forwarded-proto": "http" }, hop: "http://localhost:3917/docs/quickstart", host: "127.0.0.1:3917", proto: "http" },
    { name: "Vercel", url: "https://acme.example/docs/quickstart", headers: { host: "acme.example", "x-forwarded-host": "acme.example", "x-forwarded-proto": "https" }, hop: "https://acme.example/docs/quickstart", host: "acme.example", proto: "https" },
    { name: "neither forwarded header", url: "https://acme.example/docs/quickstart", headers: {}, hop: "https://acme.example/docs/quickstart", host: "acme.example", proto: null },
  ];
  for (const shape of shapes) {
    hops.length = 0;
    w.shipped.length = 0;
    const response = await handler(request(shape.url, shape.headers), w.event as never);
    assert.equal(response.status, 200, shape.name);
    assert.match(await response.text(), new RegExp(`href="https://${shape.host.replaceAll(".", "\\.")}/mcp\\?ref=[0-9A-HJKMNP-TV-Z]{8}"`), `${shape.name}: the inject rule's {host} is the host the agent spoke to`);
    await Promise.all(w.pending);
    assert.deepEqual(hops, [{ url: shape.hop, inner: "1", forwardedHost: shape.headers["x-forwarded-host"] ?? null, proto: shape.proto }], `${shape.name}: exactly one hop, to the listen address, marked, carrying the forwarded headers as received`);
    assert.equal(w.shipped.length, 1, `${shape.name}: one shipment`);
    const record = (w.shipped[0] as Array<Record<string, unknown>>).find((r) => r.schema === "scope.request/1");
    assert.equal(record?.["server.address"], shape.host, `${shape.name}: server.address is the host the agent spoke to`);
    assert.equal(record?.["url.path"], "/docs/quickstart", shape.name);
    assert.equal(record?.["scope.route"], "docs", shape.name);
  }
  const seen: string[] = [];
  const only = withJourneys({ env: { ...env, JOURNEYS_HOST: "docs.example" }, fetch: app, next: async (r: NextRequest) => {
    seen.push(r.headers.get("x-forwarded-host") ?? "-");
    return new Response("mine", { status: 200 });
  } });
  hops.length = 0;
  const observed = await only(request("http://localhost:3917/docs/quickstart", { host: "docs.example", "x-forwarded-host": "docs.example", "x-forwarded-proto": "https" }), w.event as never);
  assert.equal(observed.status, 200);
  await observed.text();
  const other = await only(request("http://localhost:3917/docs/quickstart", { host: "other.example", "x-forwarded-host": "other.example", "x-forwarded-proto": "https" }), w.event as never);
  assert.equal(await other.text(), "mine");
  await Promise.all(w.pending);
  assert.equal(hops.length, 1, "the observed host hops once; the other host does not hop at all");
  assert.deepEqual(seen, ["other.example"], "JOURNEYS_HOST is matched against the forwarded host, not the listen address");
  // Behind a TLS-terminating proxy Next builds request.url as https://localhost:<port>, which is
  // not the listener: the hop goes where `next start` says its listener is.
  const started = withJourneys({ env: { ...env, __NEXT_PRIVATE_ORIGIN: "http://127.0.0.1:3917" }, fetch: app, now: () => Date.parse("2026-10-10T12:00:00.000Z") });
  hops.length = 0;
  w.shipped.length = 0;
  const behindTls = await started(request("https://localhost:3917/docs/quickstart", { host: "docs.example", "x-forwarded-host": "docs.example", "x-forwarded-proto": "https" }), w.event as never);
  assert.equal(behindTls.status, 200);
  await behindTls.text();
  await Promise.all(w.pending);
  assert.deepEqual(hops.map((h) => h.url), ["http://127.0.0.1:3917/docs/quickstart"], "the hop goes to the listener next start named, not to the forwarded scheme on the listen host");
  assert.equal((w.shipped[0] as Array<Record<string, unknown>>).find((r) => r.schema === "scope.request/1")?.["server.address"], "docs.example");
});

test("a request already carrying this sensor's Via without the marker is its own hop come back: handed to the app with one warning, never forwarded again; another sensor's Via is observed as usual", async () => {
  reset();
  const w = world();
  const seen: string[] = [];
  const next = async (r: NextRequest): Promise<Response> => {
    seen.push(r.headers.get("via") ?? "-");
    return new Response("mine", { status: 200 });
  };
  const warnings: string[] = [];
  const realWarn = console.warn;
  console.warn = (line: string) => {
    warnings.push(line);
  };
  try {
    const handler = withJourneys({ env, fetch: w.fetch, next });
    for (const via of ["1.1 scope-journeys", "1.1 cdn-edge, 1.1 scope-journeys", "1.1 scope-journeys, 1.1 cdn-edge"]) {
      const looped = await handler(request("https://acme.example/docs/quickstart", { via }), w.event as never);
      assert.equal(await looped.text(), "mine", via);
    }
    assert.equal(w.calls.length, 0, "a loop fetches nothing");
    const fronted = await handler(request("https://acme.example/docs/quickstart", { via: "1.1 cdn-edge, 1.1 scope-journeys-edge" }), w.event as never);
    assert.equal(fronted.status, 200);
    assert.match(await fronted.text(), /<h1>Quickstart<\/h1>/);
  } finally {
    console.warn = realWarn;
  }
  await Promise.all(w.pending);
  assert.deepEqual(seen, ["1.1 scope-journeys", "1.1 cdn-edge, 1.1 scope-journeys", "1.1 scope-journeys, 1.1 cdn-edge"]);
  const hop = w.calls.find((c) => c.url === "https://acme.example/docs/quickstart");
  assert.equal(hop?.headers.via, "1.1 cdn-edge, 1.1 scope-journeys-edge, 1.1 scope-journeys", "another sensor's Via is kept and this one's appended");
  assert.equal(hop?.headers[INNER_HEADER], "1");
  assert.equal(warnings.filter((l) => /already carries "1.1 scope-journeys" in Via/.test(l)).length, 1, warnings.join("\n"));
});

test("the OIDC form: the project's token is the bearer on the policy fetch and on the shipment", async () => {
  reset();
  const w = world();
  const token = "eyJhbGciOiJSUzI1NiJ9.eyJpc3MiOiJodHRwczovL29pZGMudmVyY2VsLmNvbSJ9.sig";
  const handler = withJourneys({ env: { JOURNEYS_INSTALL_ID: INSTALL, JOURNEYS_SALT: "s", JOURNEYS_API_URL: API }, fetch: w.fetch });
  // The record finishes when the response body has streamed through, so the body is read before the shipment is awaited.
  await (await handler(request("https://acme.example/docs/quickstart", { "x-vercel-oidc-token": token }), w.event as never)).text();
  await Promise.all(w.pending);
  assert.equal(w.calls.find((c) => c.url.endsWith("/policy"))?.headers.authorization, `Bearer ${token}`);
  assert.equal(w.calls.find((c) => c.url.endsWith("/v1/requests"))?.headers.authorization, `Bearer ${token}`);
  assert.ok(w.calls.some((c) => c.url === "https://acme.example/docs/quickstart"), "the inner hop to the app");
});

test("the shipper on a 429: one retry after Retry-After (capped), then the batch is dropped and counted into the next record", async () => {
  reset();
  const answers: Array<{ status: number; headers?: Record<string, string> }> = [{ status: 429, headers: { "retry-after": "120" } }, { status: 429 }];
  const fetcher = (async () => {
    const next = answers.shift() ?? { status: 202 };
    return new Response(null, { status: next.status, headers: next.headers });
  }) as typeof fetch;
  const records = Array.from({ length: 2 }, (_, i) => ({ schema: "scope.declaration/1", id: String(i) }) as never);
  const log: string[] = [];
  await deliver(records, { apiUrl: API, credential: "k", fetch: fetcher, log: (l) => log.push(l), retryDelayMs: 1, maxRetryAfterMs: 5 });
  assert.deepEqual(log, ["journeys: shipment answered 429, retrying once in 5 ms", "journeys: shipment answered 429, dropping the batch"]);
  assert.equal(droppedSoFar(), 2);
  const w = world();
  const handler = withJourneys({ env, fetch: w.fetch });
  await (await handler(request("https://acme.example/docs/quickstart"), w.event as never)).text();
  await Promise.all(w.pending);
  const record = (w.shipped[0] as Array<Record<string, unknown>>).find((r) => r.schema === "scope.request/1");
  assert.equal(record?.["scope.observer.dropped"], 2, "the next record carries the drop count");
  assert.equal(droppedSoFar(), 0, "a successful shipment clears it");
});

test("the policy answer's environment and salt epoch are kept from the last answer when a later one carries none", async () => {
  reset();
  let call = 0;
  const fetcher = (async () => {
    call += 1;
    if (call === 1) return Response.json(POLICY, { headers: { etag: '"v3"', "x-journeys-environment": "preview", "x-journeys-salt-epoch": "2" } });
    return Response.json(POLICY, { headers: { etag: '"v4"' } });
  }) as typeof fetch;
  const first = await loadPolicy({ url: `${API}/policy`, credential: "k", fetch: fetcher, now: 0, cache: null, log: () => undefined });
  assert.equal(first.saltEpoch, 2);
  assert.equal(first.environment, "preview");
  const second = await loadPolicy({ url: `${API}/policy`, credential: "k", fetch: fetcher, now: 61_000, cache: null, log: () => undefined });
  assert.equal(second.etag, '"v4"');
  assert.equal(second.saltEpoch, 2, "the last epoch seen");
  assert.equal(second.environment, "preview");
});
