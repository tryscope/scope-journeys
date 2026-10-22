// `npm run test:envoy`: every synthetic fixture through the real Envoy of the
// compose stack beside this file, the processor and the toy origin running in this process on the
// ports envoy.yaml names (18790 and 18789), the listener on 10000. The response, what reached the
// origin and the shipped records are compared with expected.json (expected.envoy.json for the
// three server-sent-event fixtures the gate would have amended) under the identity mask, with the
// form's stated allowances: Envoy's own headers on both hops and the facts the stream cannot give.
// Needs Docker and Compose; it fails, never skips, when the stack does not come up.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, request as httpRequest, type IncomingMessage, type Server } from "node:http";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { resetPolicyCache } from "scope-journeys";

import { applyMask, canonical, maskResponse, maskText } from "../../scripts/canonical.mjs";
import type { FixtureDirectory, FixtureFacts, FixtureRequest, FixtureUpstream } from "../../packages/core/test/harness.js";
import { validateRecord } from "../../packages/core/src/validate.js";
import { VERSION } from "../../packages/core/src/version.js";
import { resetCache, resetDelivery, serveExtProc, type RunningServer } from "../../packages/envoy/src/index.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const HERE = join(ROOT, "test", "envoy");
const FIXTURES = join(ROOT, "fixtures", "synthetic");
const INSTALL = "jin_fixture0000000000000000";
const API = "https://api.fixture.example";
const ORIGIN_PORT = 18789;
const PROCESSOR_PORT = 18790;
const ENVOY = "http://127.0.0.1:10000";
const ENVOY_EXPECTATION = new Set(["10-sse-tools-list", "11-sse-tool-call", "12-sse-declaration-appended"]);
// Envoy's own headers on the hop to the origin and on the answer to the client, and the two this test adds.
const ENVOY_HEADERS = /^(x-envoy-|x-forwarded-|x-request-id$|server$|host$|content-length$|transfer-encoding$|connection$|keep-alive$|date$)/;

const names = readdirSync(FIXTURES, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d\d-/.test(d.name)).map((d) => d.name).sort();

interface Captured {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

const readAll = (message: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    message.on("data", (chunk: Buffer) => chunks.push(chunk));
    message.once("end", () => resolve(Buffer.concat(chunks)));
    message.once("error", reject);
  });

let current: { upstream: FixtureUpstream; forwarded: Captured[] } | null = null;
let origin: Server;

before(async () => {
  origin = createServer((req, res) => {
    void readAll(req).then(async (raw) => {
      const fixture = current;
      if (!fixture) {
        res.writeHead(503);
        res.end();
        return;
      }
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
      fixture.forwarded.push({ method: req.method ?? "", url: req.url ?? "", headers, body: req.method === "GET" || req.method === "HEAD" ? null : raw.toString("utf8") });
      const upstream = fixture.upstream;
      const out = Object.fromEntries(Object.entries(upstream.headers).filter(([k]) => !["content-length", "transfer-encoding"].includes(k.toLowerCase())));
      res.writeHead(upstream.status, out);
      if (upstream.stream) {
        for (const frame of upstream.stream) {
          res.write(frame);
          await new Promise((resolve) => setTimeout(resolve, 1));
        }
        res.end();
        return;
      }
      if (upstream.body === null || upstream.body === undefined) res.end();
      else res.end(upstream.bodyEncoding === "base64" ? Buffer.from(upstream.body, "base64") : upstream.body);
    });
  });
  await new Promise<void>((resolve, reject) => {
    origin.once("error", reject);
    origin.listen(ORIGIN_PORT, "0.0.0.0", () => resolve());
  });
  execFileSync("docker", ["compose", "-f", join(HERE, "docker-compose.yml"), "up", "-d"], { stdio: "inherit" });
  let up = false;
  for (let i = 0; i < 120 && !up; i += 1) {
    try {
      const response = await fetch(`${ENVOY}/`, { signal: AbortSignal.timeout(2_000) });
      up = response.status > 0;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  assert.ok(up, "Envoy did not answer on 10000 within a minute");
});

after(async () => {
  try {
    execFileSync("docker", ["compose", "-f", join(HERE, "docker-compose.yml"), "down"], { stdio: "inherit" });
  } finally {
    origin.closeAllConnections();
    await new Promise((resolve) => origin.close(resolve));
  }
});

function world(name: string, policy: unknown, facts: FixtureFacts, directory: FixtureDirectory | undefined, shipped: unknown[][], forwarded: Captured[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `https://policy.fixture.example/${name}`) return Response.json(policy, { headers: { etag: `"${name}"`, "x-journeys-salt-epoch": String(facts.salt_epoch ?? 1), "x-journeys-environment": facts.environment ?? "production" } });
    if (url === `${API}/v1/requests`) {
      const bytes = new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer());
      const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
      shipped.push(JSON.parse(text) as unknown[]);
      return new Response(null, { status: 202 });
    }
    if (directory && url === directory.url) {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      forwarded.push({ method: init?.method ?? "GET", url, headers, body: null });
      if (directory.unreachable) throw new TypeError("fetch failed");
      return Response.json(directory.body ?? null, { status: directory.status ?? 200 });
    }
    throw new Error(`${name}: the processor fetched ${url}, which the test does not serve`);
  }) as typeof fetch;
}

interface ClientResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function send(fixture: FixtureRequest, extra: Record<string, string>): Promise<ClientResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(fixture.url);
    const req = httpRequest({ host: "127.0.0.1", port: 10000, method: fixture.method, path: `${url.pathname}${url.search}`, headers: { ...fixture.headers, host: url.host, ...extra } }, (res) => {
      void readAll(res).then((bytes) => {
        const out: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) out[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
        let body: string;
        try {
          body = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        } catch {
          body = `base64:${bytes.toString("base64")}`;
        }
        resolve({ status: res.statusCode ?? 0, headers: out, body });
      }, reject);
    });
    req.once("error", reject);
    if (fixture.body === null) req.end();
    else req.end(fixture.bodyEncoding === "base64" ? Buffer.from(fixture.body, "base64") : fixture.body);
  });
}

function envoyForm(record: Record<string, unknown>): Record<string, unknown> {
  if (record.schema !== "scope.request/1") return record;
  const observer = record.observer as Record<string, unknown>;
  return { ...record, source: "ext_proc", observer: { ...observer, package: "scope-journeys-envoy", version: VERSION, adapter: "envoy", name: "fixture-sensor" }, "scope.client.asn": null, "scope.client.as_org": null, "scope.client.country": null, "scope.client.colo": null, "tls.protocol.version": null, "network.protocol.version": null, "scope.client.ja4": null, "scope.client.tls_ext_sha1": null, "scope.client.tls_hello_len": null, "scope.platform_bot": null };
}

function maskAssertion(headers: Record<string, string>): Record<string, string> {
  const token = headers["x-scope-assertion"];
  if (!token) return headers;
  const [head, claims, signature] = token.split(".");
  if (!head || !claims || !signature) return headers;
  return { ...headers, "x-scope-assertion": `${head}.${Buffer.from(maskText(Buffer.from(claims, "base64url").toString("utf8")), "utf8").toString("base64url")}.${signature}` };
}

const withoutEnvoy = (headers: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(headers).filter(([k]) => !ENVOY_HEADERS.test(k.toLowerCase())));

/** The processor for one fixture: its own environment (the salt, the assertion key), the world answered in process; Envoy reconnects on the first request, warmed by a probe whose record is discarded. */
async function processorFor(name: string, policy: unknown, facts: FixtureFacts, directory: FixtureDirectory | undefined, shipped: unknown[][], forwarded: Captured[]): Promise<RunningServer> {
  const env: Record<string, string> = { JOURNEYS_INSTALL_ID: INSTALL, JOURNEYS_INSTALL_KEY: "sjk_test_dddddddddddddddddddddddddddddddd", JOURNEYS_SALT: facts.salt ?? "fixture-salt", JOURNEYS_NAME: "fixture-sensor", JOURNEYS_API_URL: API, JOURNEYS_POLICY_URL: `https://policy.fixture.example/${name}` };
  if (facts.assertion) env.JOURNEYS_ASSERTION_KEY = JSON.stringify(facts.assertion.private_jwk);
  let tick = 0;
  const base = Date.parse(facts.ts ?? "2026-10-10T12:00:00.000Z");
  const server = await serveExtProc({ listen: `0.0.0.0:${PROCESSOR_PORT}`, env, fetch: world(name, policy, facts, directory, shipped, forwarded), now: () => base + tick++, log: () => undefined, signals: false, drainMs: 2_000 });
  for (let i = 0; i < 20; i += 1) {
    const probe = await fetch(`${ENVOY}/.well-known/journeys-probe?journeys_probe=warm`, { headers: { host: "acme.example" }, signal: AbortSignal.timeout(5_000) });
    if (probe.status === 204 && probe.headers.get("x-journeys-probe") === "received") break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  for (let i = 0; i < 100 && shipped.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
  shipped.length = 0;
  forwarded.length = 0;
  return server;
}

for (const name of names) {
  test(`envoy, fixture ${name}`, async () => {
    resetPolicyCache();
    resetDelivery();
    resetCache();
    const dir = join(FIXTURES, name);
    const policyRef = JSON.parse(readFileSync(join(dir, "policy.json"), "utf8"));
    const policy: unknown = typeof policyRef.$ref === "string" ? JSON.parse(readFileSync(join(dir, policyRef.$ref), "utf8")) : policyRef;
    const request = JSON.parse(readFileSync(join(dir, "request.json"), "utf8")) as FixtureRequest;
    const upstream = JSON.parse(readFileSync(join(dir, "upstream.json"), "utf8")) as FixtureUpstream;
    const facts = JSON.parse(readFileSync(join(dir, "facts.json"), "utf8")) as FixtureFacts;
    const directory = existsSync(join(dir, "directory.json")) ? (JSON.parse(readFileSync(join(dir, "directory.json"), "utf8")) as FixtureDirectory) : undefined;
    const expected = JSON.parse(readFileSync(join(dir, ENVOY_EXPECTATION.has(name) ? "expected.envoy.json" : "expected.json"), "utf8")) as { response: ClientResponse; forwarded: Captured[]; records: Array<Record<string, unknown>> };
    const forwarded: Captured[] = [];
    const shipped: unknown[][] = [];
    const processor = await processorFor(name, policy, facts, directory, shipped, forwarded);
    current = { upstream, forwarded };
    try {
      const extra: Record<string, string> = { "x-forwarded-for": facts.address ?? "" };
      if (facts.platform_request_id) extra["x-request-id"] = facts.platform_request_id;
      const response = await send(request, extra);
      for (let i = 0; i < (expected.records.length ? 300 : 10) && shipped.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
      if (expected.records.length) assert.ok(shipped.length >= 1, `${name}: nothing was shipped after the response`);
      else assert.equal(shipped.length, 0, `${name}: a pass-through route shipped a record`);
      const records = shipped.flat() as Array<Record<string, unknown>>;
      for (const record of records) assert.deepEqual(validateRecord(record as never).errors, [], `${name}: a record does not validate against its schema`);
      const actual = {
        response: maskResponse({ status: response.status, headers: withoutEnvoy(response.headers), body: response.body }),
        forwarded: forwarded.map((f) => ({ ...f, headers: maskAssertion(Object.fromEntries(Object.entries(withoutEnvoy(f.headers)).map(([k, v]) => [k, maskText(v)]).sort())) })),
        records: records.map((r) => applyMask(r)),
      };
      const wanted = {
        response: maskResponse({ ...expected.response, headers: withoutEnvoy(expected.response.headers) }),
        forwarded: expected.forwarded.map((f) => ({ ...f, headers: maskAssertion(Object.fromEntries(Object.entries(withoutEnvoy(f.headers)).sort())) })),
        records: expected.records.map((r) => applyMask(ENVOY_EXPECTATION.has(name) ? r : envoyForm(r))),
      };
      assert.equal(canonical(actual.response), canonical(wanted.response), `${name}: the response through Envoy differs`);
      assert.equal(canonical(actual.forwarded), canonical(wanted.forwarded), `${name}: what reached the origin differs`);
      assert.equal(canonical(actual.records), canonical(wanted.records), `${name}: the shipped records differ beyond the stream's facts`);
    } finally {
      current = null;
      await processor.close();
    }
  });
}
