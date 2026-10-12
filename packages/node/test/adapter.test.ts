// J5.1 on Node: the socket's facts (the trusted forwarded address, the dual-stack prefix, the
// family), the three mounts end to end (Express 5, Fastify 5, Hono 4 on @hono/node-server) with
// the hop to the app's own listener marked and carrying exactly the gateway's headers, the pass
// paths (the inner hop, an unobserved host, a failed hop), the standalone proxy's drain (a request
// in flight when close is called completes and its record ships), and the listen address parser.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { test } from "node:test";

import { serve } from "@hono/node-server";
import express from "express";
import Fastify from "fastify";
import { Hono } from "hono";

import { canonicalAddress, createNodeHandler, fastifyJourneys, honoJourneys, journeys, parseListen, platformFacts, resetCache, resetDelivery, resetPolicyCache, serveProxy, socketFacts } from "../src/index.js";

const POLICY = JSON.parse(readFileSync(new URL("../../../fixtures/synthetic/policy.json", import.meta.url), "utf8")) as Record<string, unknown>;
const INSTALL = "jin_test0000000000000000000000";
const API = "https://api.test.invalid";
const KEY = "sjk_test_dddddddddddddddddddddddddddddddd";
const env = { JOURNEYS_INSTALL_ID: INSTALL, JOURNEYS_INSTALL_KEY: KEY, JOURNEYS_SALT: "fixture-salt", JOURNEYS_API_URL: API };

interface World {
  calls: Array<{ url: string; headers: Record<string, string> }>;
  shipped: Array<Array<Record<string, unknown>>>;
  fetch: typeof fetch;
}

function world(): World {
  const w: World = {
    calls: [],
    shipped: [],
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      w.calls.push({ url, headers });
      if (url === `${API}/v1/installs/${INSTALL}/policy`) return Response.json(POLICY, { headers: { etag: '"3"', "x-journeys-salt-epoch": "2" } });
      if (url === `${API}/v1/requests`) {
        const bytes = new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer());
        const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
        w.shipped.push(JSON.parse(text) as Array<Record<string, unknown>>);
        return new Response(null, { status: 202 });
      }
      throw new Error(`the sensor fetched ${url}, which the test does not serve`);
    }) as typeof fetch,
  };
  return w;
}

const reset = (): void => {
  resetPolicyCache();
  resetDelivery();
  resetCache();
};

const until = async (ready: () => boolean, what: string): Promise<void> => {
  for (let i = 0; i < 300 && !ready(); i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.ok(ready(), what);
};

const PAGE = '<!doctype html><html><body><h1>Quickstart</h1><a href="https://acme.example/docs/install">Install</a></body></html>';

/** What the app saw on the request that reached it: the hop's headers, verbatim. */
interface Seen {
  path: string;
  headers: Record<string, string>;
  body: string;
}

const headersOf = (req: IncomingMessage): Record<string, string> => Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : (v ?? "")]));

const assertHop = (seen: Seen, host: string): void => {
  assert.equal(seen.headers["x-journeys-inner"], "1", "the hop is marked as the inner pass");
  assert.equal(seen.headers.host, host, "the hop keeps the request's own Host");
  assert.equal(seen.headers.via, "1.1 scope-journeys");
  assert.equal(seen.headers["x-acme-edge"], "journeys", "the policy's forward header");
  assert.equal(seen.headers["x-acme-key"], KEY, "the policy's key header carries the install key");
  assert.equal(seen.headers["accept-encoding"], undefined, "a conforming gateway sends no accept-encoding");
  assert.equal(seen.headers["x-forwarded-for"], "127.0.0.1", "the client's address, appended for the app");
  assert.equal(seen.headers["x-forwarded-proto"], "http");
  assert.equal(seen.headers["user-agent"], "Claude-User (claude-code/2.1.0; +https://www.anthropic.com/claude-code)", "the client's agent string, not the hop's");
};

const assertRecord = (w: World, host: string): Record<string, unknown> => {
  assert.equal(w.shipped.length, 1, "one shipment after the response");
  const record = (w.shipped[0] ?? []).find((r) => r.schema === "scope.request/1");
  assert.ok(record, "a request record");
  assert.equal(record.install, INSTALL);
  assert.equal(record.source, "node");
  assert.deepEqual(record.observer, { package: "scope-journeys-node", version: (record.observer as { version: string }).version, adapter: "node", policy_version: 3, salt_epoch: 2, name: "scope-journeys" });
  assert.equal(record["server.address"], host);
  assert.equal(record["scope.route"], "docs");
  assert.equal(record["scope.reader"], "claude-code");
  assert.equal(record["scope.client.address_family"], "ipv4");
  assert.match(String(record["scope.client.address_hash"]), /^[0-9a-f]{12}$/);
  assert.equal(record["scope.client.asn"], null);
  assert.equal(record["scope.client.country"], null);
  assert.equal(record["network.protocol.version"], "HTTP/1.1");
  assert.equal(record["tls.protocol.version"], null);
  assert.equal((record["scope.page"] as { face: string }).face, "html");
  const shipment = w.calls.find((c) => c.url.endsWith("/v1/requests"));
  assert.equal(shipment?.headers.authorization, `Bearer ${KEY}`);
  assert.equal(shipment?.headers["content-encoding"], "gzip");
  return record;
};

const listen = (server: Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });

const agent = { "user-agent": "Claude-User (claude-code/2.1.0; +https://www.anthropic.com/claude-code)", accept: "text/html" };

test("the socket's facts: the peer by default, the first x-forwarded-for when trusted, the dual-stack prefix dropped, the family from the address", () => {
  const req = { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }, socket: { remoteAddress: "::ffff:10.0.0.9" }, httpVersion: "1.1" } as unknown as IncomingMessage;
  const untrusted = socketFacts(req, false);
  assert.deepEqual(untrusted, { address: "10.0.0.9", peer: "10.0.0.9", tls_protocol_version: null, network_protocol_version: "HTTP/1.1" });
  const trusted = socketFacts(req, true);
  assert.deepEqual(trusted, { address: "203.0.113.7", peer: "10.0.0.9", tls_protocol_version: null, network_protocol_version: "HTTP/1.1" });
  assert.equal(canonicalAddress("::ffff:203.0.113.7"), "203.0.113.7");
  assert.equal(canonicalAddress("2001:db8::1"), "2001:db8::1");
  assert.equal(canonicalAddress(null), null);
  const identity = { install: INSTALL, name: "n", environment: "production" as const, saltEpoch: 1, dropped: 0, version: "0.0.0-test" };
  const v6 = platformFacts({ address: "2001:db8::1", peer: "2001:db8::1", tls_protocol_version: "TLSv1.3", network_protocol_version: "HTTP/1.1" }, "req-1", identity);
  assert.equal(v6.family, "ipv6");
  assert.equal(v6.tls_protocol_version, "TLSv1.3");
  assert.equal(v6.platform_request_id, "req-1");
  assert.equal(v6.source, "node");
  assert.equal(v6.observer.adapter, "node");
  assert.equal(v6.asn, null);
  assert.equal(v6.ja4, null);
  assert.equal(platformFacts({ address: null, peer: null, tls_protocol_version: null, network_protocol_version: null }, null, identity).family, null);
});

test("behind a trusted proxy the record names the forwarded host and scheme, JOURNEYS_HOST is matched against that host, and the hop keeps the Host as received", async () => {
  reset();
  const w = world();
  const seen: Seen[] = [];
  const app = express();
  app.use(journeys({ env: { ...env, JOURNEYS_TRUST_PROXY: "1", JOURNEYS_HOST: "docs.example" }, fetch: w.fetch, log: () => undefined }));
  app.get("/docs/quickstart", (req, res) => {
    seen.push({ path: req.url, headers: headersOf(req), body: "" });
    res.type("html").send(PAGE);
  });
  const server = createServer(app);
  const port = await listen(server);
  const host = `127.0.0.1:${port}`;
  try {
    // A proxy that rewrites Host to the upstream (Apache's default) and names the agent's host and scheme in the forwarded headers.
    const page = await fetch(`http://${host}/docs/quickstart`, { headers: { ...agent, "x-forwarded-host": "docs.example", "x-forwarded-proto": "https", "x-forwarded-for": "203.0.113.7" } });
    assert.equal(page.status, 200);
    await page.text();
    await until(() => w.shipped.length === 1, "the record shipped after the response");
    assert.equal(seen.length, 1, "the observed host went through the hop once");
    assert.equal(seen[0]?.headers["x-journeys-inner"], "1");
    assert.equal(seen[0]?.headers.host, host, "the hop keeps the Host as received, not the forwarded host");
    assert.equal(seen[0]?.headers["x-forwarded-host"], "docs.example");
    assert.equal(seen[0]?.headers["x-forwarded-proto"], "https", "the hop names the scheme the agent used");
    assert.equal(seen[0]?.headers["x-forwarded-for"], "203.0.113.7, 127.0.0.1");
    assertRecord(w, "docs.example");
    const other = await fetch(`http://${host}/docs/quickstart`, { headers: { ...agent, "x-forwarded-host": "other.example" } });
    assert.equal(other.status, 200);
    await other.text();
    assert.equal(seen[1]?.headers.via, undefined, "a forwarded host the install does not observe reaches the app untouched");
    assert.equal(w.shipped.length, 1);
    const direct = await fetch(`http://${host}/docs/quickstart`, { headers: agent });
    assert.equal(direct.status, 200);
    await direct.text();
    assert.equal(seen[2]?.headers.via, undefined, "with no forwarded host the Host header names the request, which is not the observed host either");
    assert.equal(w.shipped.length, 1);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("Express 5: app.use(journeys()) first; a page read goes through the hop to the app's own listener once, marked, with the gateway's headers; the record ships after the response; the inner pass, an unobserved host and a failed hop reach the app untouched", async () => {
  reset();
  const w = world();
  const seen: Seen[] = [];
  const app = express();
  app.use(journeys({ env, fetch: w.fetch, log: () => undefined }));
  app.use(express.text({ type: "*/*" }));
  app.use((req, _res, next) => {
    seen.push({ path: req.url, headers: headersOf(req), body: typeof req.body === "string" ? req.body : "" });
    next();
  });
  app.get("/docs/quickstart", (_req, res) => {
    res.type("html").send(PAGE);
  });
  app.post("/api/v1/hooks", (req, res) => {
    res.status(201).json({ echoed: req.body });
  });
  const server = createServer(app);
  const port = await listen(server);
  const host = `127.0.0.1:${port}`;
  try {
    const page = await fetch(`http://${host}/docs/quickstart`, { headers: agent });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<h1>Quickstart<\/h1>/);
    assert.equal(page.headers.get("content-encoding"), null);
    await until(() => w.shipped.length === 1, "the record shipped after the response");
    assert.equal(seen.length, 1, "the app saw the request once, through the hop");
    assertHop(seen[0] as Seen, host);
    assertRecord(w, host);

    const call = await fetch(`http://${host}/api/v1/hooks`, { method: "POST", headers: { ...agent, "content-type": "application/json", "accept-encoding": "gzip, br" }, body: JSON.stringify({ hook: "orders" }) });
    assert.equal(call.status, 201);
    assert.deepEqual(await call.json(), { echoed: JSON.stringify({ hook: "orders" }) });
    await until(() => w.shipped.length === 2, "the second record shipped");
    assert.equal(seen[1]?.body, JSON.stringify({ hook: "orders" }), "the body reached the app through the hop");
    assert.equal(seen[1]?.headers["content-length"], String(JSON.stringify({ hook: "orders" }).length), "Node framed the hop's body");
    assert.equal(seen[1]?.headers["accept-encoding"], undefined);
    const record = (w.shipped[1] ?? []).find((r) => r.schema === "scope.request/1");
    assert.equal(record?.["scope.route"], "api");
    assert.equal(record?.["http.response.status_code"], 201);

    const inner = await fetch(`http://${host}/docs/quickstart`, { headers: { ...agent, "x-journeys-inner": "1" } });
    assert.equal(inner.status, 200);
    await inner.text();
    assert.equal(seen.length, 3);
    assert.equal(seen[2]?.headers.via, undefined, "the inner pass is handed to the app untouched");
    assert.equal(w.shipped.length, 2, "nothing observed on the inner pass");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }

  reset();
  const other = world();
  const seen2: Seen[] = [];
  const app2 = express();
  app2.use(journeys({ env: { ...env, JOURNEYS_HOST: "acme.example" }, fetch: other.fetch, log: () => undefined }));
  app2.get("/docs/quickstart", (req, res) => {
    seen2.push({ path: req.url, headers: headersOf(req), body: "" });
    res.type("html").send(PAGE);
  });
  const server2 = createServer(app2);
  const port2 = await listen(server2);
  try {
    const response = await fetch(`http://127.0.0.1:${port2}/docs/quickstart`, { headers: agent });
    assert.equal(response.status, 200);
    await response.text();
    assert.equal(seen2[0]?.headers.via, undefined, "a host the install does not observe goes to the app untouched");
    assert.equal(other.shipped.length, 0);
  } finally {
    server2.closeAllConnections();
    await new Promise((resolve) => server2.close(resolve));
  }

  reset();
  const broken = world();
  const seen3: Seen[] = [];
  const logs: string[] = [];
  const app3 = express();
  // An origin nothing listens on: the hop fails inside the sensor, and the app answers the request itself.
  app3.use(journeys({ env: { ...env, JOURNEYS_ORIGIN: "http://127.0.0.1:1" }, fetch: broken.fetch, log: (_level, line) => logs.push(line) }));
  app3.get("/docs/quickstart", (req, res) => {
    seen3.push({ path: req.url, headers: headersOf(req), body: "" });
    res.type("html").send(PAGE);
  });
  const server3 = createServer(app3);
  const port3 = await listen(server3);
  try {
    const response = await fetch(`http://127.0.0.1:${port3}/docs/quickstart`, { headers: agent });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Quickstart/);
    assert.equal(seen3.length, 1);
    assert.equal(seen3[0]?.headers.via, undefined, "the failed hop hands the request to the app untouched");
    assert.ok(logs.some((l) => /the sensor failed, passing the request on untouched/.test(l)), logs.join("\n"));
  } finally {
    server3.closeAllConnections();
    await new Promise((resolve) => server3.close(resolve));
  }
});

test("Fastify 5: register(fastifyJourneys) hijacks the reply for an observed request and lets the inner pass reach the route", async () => {
  reset();
  const w = world();
  const seen: Seen[] = [];
  const app = Fastify({ forceCloseConnections: true });
  await app.register(fastifyJourneys, { env, fetch: w.fetch, log: () => undefined });
  app.get("/docs/quickstart", (request, reply) => {
    seen.push({ path: request.url, headers: headersOf(request.raw), body: "" });
    return reply.type("text/html").send(PAGE);
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  const host = `127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
  try {
    const page = await fetch(`http://${host}/docs/quickstart`, { headers: agent });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<h1>Quickstart<\/h1>/);
    await until(() => w.shipped.length === 1, "the record shipped after the response");
    assert.equal(seen.length, 1);
    assertHop(seen[0] as Seen, host);
    assertRecord(w, host);
    const inner = await fetch(`http://${host}/docs/quickstart`, { headers: { ...agent, "x-journeys-inner": "1" } });
    assert.equal(inner.status, 200);
    await inner.text();
    assert.equal(seen.length, 2);
    assert.equal(seen[1]?.headers.via, undefined);
    assert.equal(w.shipped.length, 1);
  } finally {
    await app.close();
  }
});

test("Hono 4 on @hono/node-server: app.use(honoJourneys()) returns the core's Response; the socket's facts and the finish come from c.env", async () => {
  reset();
  const w = world();
  const seen: Seen[] = [];
  const app = new Hono();
  app.use(honoJourneys({ env, fetch: w.fetch, log: () => undefined }));
  app.get("/docs/quickstart", (c) => {
    seen.push({ path: c.req.path, headers: Object.fromEntries(Object.entries(c.req.header())), body: "" });
    return c.html(PAGE);
  });
  const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  const port = await new Promise<number>((resolve) => {
    server.once("listening", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });
  const host = `127.0.0.1:${port}`;
  try {
    const page = await fetch(`http://${host}/docs/quickstart`, { headers: agent });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<h1>Quickstart<\/h1>/);
    await until(() => w.shipped.length === 1, "the record shipped after the response");
    assert.equal(seen.length, 1);
    assertHop(seen[0] as Seen, host);
    assertRecord(w, host);
    const inner = await fetch(`http://${host}/docs/quickstart`, { headers: { ...agent, "x-journeys-inner": "1" } });
    await inner.text();
    assert.equal(seen.length, 2);
    assert.equal(w.shipped.length, 1);
  } finally {
    server.close();
  }
});

test("the standalone proxy: the origin's Host on the hop, no marker; close() drains a request in flight and its record ships; a 502 when the origin is down", async () => {
  reset();
  const w = world();
  const seen: Seen[] = [];
  const origin = createServer((req, res) => {
    seen.push({ path: req.url ?? "", headers: headersOf(req), body: "" });
    setTimeout(() => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
    }, 300);
  });
  const originPort = await listen(origin);
  const proxy = await serveProxy({ origin: `http://127.0.0.1:${originPort}`, listen: "127.0.0.1:0", env: { ...env, JOURNEYS_TRUST_PROXY: "1" }, fetch: w.fetch, drainMs: 3_000, signals: false, log: () => undefined });
  try {
    const pending = fetch(`${proxy.url}/docs/quickstart`, { headers: { ...agent, "x-forwarded-for": "203.0.113.7" } });
    await until(() => seen.length === 1, "the request reached the origin");
    const closing = proxy.close();
    const response = await pending;
    assert.equal(response.status, 200, "the request in flight completes");
    assert.match(await response.text(), /Quickstart/);
    await closing;
    assert.equal(w.shipped.length, 1, "the record shipped before the drain ended");
    assert.equal(seen[0]?.headers.host, `127.0.0.1:${originPort}`, "the hop carries the origin's Host");
    assert.equal(seen[0]?.headers["x-journeys-inner"], undefined, "no inner marker on the proxy's hop");
    assert.equal(seen[0]?.headers["x-forwarded-for"], "203.0.113.7, 127.0.0.1", "the client's own header kept, the peer appended");
    assert.equal(seen[0]?.headers.via, "1.1 scope-journeys");
    const record = (w.shipped[0] ?? []).find((r) => r.schema === "scope.request/1");
    assert.equal(record?.["server.address"], `${proxy.host}:${proxy.port}`);
    await assert.rejects(fetch(`${proxy.url}/docs/quickstart`), "the listener is closed after the drain");
  } finally {
    await proxy.close();
    origin.closeAllConnections();
    await new Promise((resolve) => origin.close(resolve));
  }

  reset();
  const down = world();
  const logs: string[] = [];
  const proxy2 = await serveProxy({ origin: "http://127.0.0.1:1", listen: "127.0.0.1:0", env, fetch: down.fetch, drainMs: 500, signals: false, log: (_level, line) => logs.push(line) });
  try {
    const response = await fetch(`${proxy2.url}/docs/quickstart`, { headers: agent });
    assert.equal(response.status, 502);
    assert.ok(logs.some((l) => /could not be reached/.test(l)), logs.join("\n"));
  } finally {
    await proxy2.close();
  }
});

test("a mount's handler with no next and no origin: the hop goes to the listener the request arrived on", async () => {
  reset();
  const w = world();
  const seen: string[] = [];
  const handler = createNodeHandler({ env, fetch: w.fetch, log: () => undefined });
  const server = createServer((req, res) => {
    if (req.headers["x-journeys-inner"]) {
      seen.push(req.headers.host ?? "");
      res.writeHead(200, { "content-type": "text/html" });
      res.end(PAGE);
      return;
    }
    void handler(req, res);
  });
  const port = await listen(server);
  try {
    const response = await fetch(`http://127.0.0.1:${port}/docs/quickstart`, { headers: agent });
    assert.equal(response.status, 200);
    await response.text();
    assert.deepEqual(seen, [`127.0.0.1:${port}`]);
    await until(() => w.shipped.length === 1, "shipped");
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("parseListen: host:port, :port, port, a bracketed IPv6 host; refuses the rest", () => {
  assert.deepEqual(parseListen("127.0.0.1:8787"), { host: "127.0.0.1", port: 8787 });
  assert.deepEqual(parseListen(":8080"), { host: undefined, port: 8080 });
  assert.deepEqual(parseListen("8080"), { host: undefined, port: 8080 });
  assert.deepEqual(parseListen("[::1]:9000"), { host: "::1", port: 9000 });
  assert.throws(() => parseListen("eighty"), /not host:port/);
  assert.throws(() => parseListen(":70000"), /out of range/);
});
