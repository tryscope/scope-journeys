// The fixture comparison extended to the Node form: every synthetic fixture through
// scope-journeys-node on real sockets. A toy origin answers from upstream.json on one ephemeral
// port, the standalone-proxy handler listens on another, the client sends request.json, and the
// response, what reached the origin and the shipped records are compared with expected.json under
// the identity mask. What the comparison allows beyond the mask is stated here, not hidden: the
// hop's own framing headers, and the facts a socket cannot give (the AS number, the country, the
// colo, JA4, the TLS fingerprint: null on this form) plus the ones it gives instead (the HTTP
// version, the form and the adapter on the record).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createServer, request as httpRequest, type IncomingMessage, type Server } from "node:http";
import { join } from "node:path";
import { test } from "node:test";

import { resetPolicyCache, trustPolicyKeyForTests } from "scope-journeys";

import { applyMask, canonical, maskResponse, maskText } from "../../scripts/canonical.mjs";
import type { FixtureDirectory, FixtureFacts, FixtureRequest, FixtureUpstream } from "../../packages/core/test/harness.js";
import { validateRecord } from "../../packages/core/src/validate.js";
import { VERSION } from "../../packages/core/src/version.js";
import { createNodeHandler, resetCache, resetDelivery } from "../../packages/node/src/index.js";
import { signedPolicy, TEST_POLICY_KID, testPolicyKeys } from "../../packages/core/test/signed.js";
import { stored } from "../../packages/core/test/ingest.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const FIXTURES = join(ROOT, "fixtures", "synthetic");
const INSTALL = "jin_fixture0000000000000000";
trustPolicyKeyForTests(TEST_POLICY_KID, (await testPolicyKeys()).publicKey);
const API = "https://api.fixture.example";

// The hop's own framing, on the way to the origin and on the way back to the client: Node's, never the sensor's.
const HOP_HEADERS = new Set(["host", "connection", "keep-alive", "transfer-encoding", "content-length"]);
// The two headers this test adds on the client side so the socket facts carry the fixture's address and request id.
const TEST_HEADERS = new Set(["x-forwarded-for", "x-request-id"]);

const names = readdirSync(FIXTURES, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d\d-/.test(d.name)).map((d) => d.name).sort();

interface Captured {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

const listen = (server: Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });

const readAll = (message: IncomingMessage): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    message.on("data", (chunk: Buffer) => chunks.push(chunk));
    message.once("end", () => resolve(Buffer.concat(chunks)));
    message.once("error", reject);
  });

/** The toy origin: upstream.json on every request, frames one by one with a 1 ms gap for a stream, Node's own framing (the fixture's content-length describes the fixture's bytes, not this hop's). */
function toyOrigin(upstream: FixtureUpstream, forwarded: Captured[]): Server {
  return createServer((req, res) => {
    void readAll(req).then(async (raw) => {
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(", ") : (v ?? "");
      forwarded.push({ method: req.method ?? "", url: req.url ?? "", headers, body: req.method === "GET" || req.method === "HEAD" ? null : raw.toString("utf8") });
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
}

/** The policy, the directory and the ingest, answered in process: the sensor's fetch never leaves the test. A signer's directory is the one request for another host, recorded as the harness records it. */
function world(name: string, policy: unknown, facts: FixtureFacts, directory: FixtureDirectory | undefined, shipped: unknown[][], forwarded: Captured[]): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url === `https://policy.fixture.example/${name}`) return signedPolicy(policy, { install: INSTALL, issuedAt: Math.floor(Date.parse(facts.ts ?? "2026-10-10T12:00:00.000Z") / 1000), saltEpoch: String(facts.salt_epoch ?? 1), environment: facts.environment ?? "production", etag: `"${name}"` });
    if (url === `${API}/v1/requests`) {
      const bytes = new Uint8Array(await new Response(init?.body as BodyInit).arrayBuffer());
      const text = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
      shipped.push(JSON.parse(text) as unknown[]);
      return stored(0);
    }
    if (directory && url === directory.url) {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      forwarded.push({ method: init?.method ?? "GET", url, headers, body: null });
      if (directory.unreachable) throw new TypeError("fetch failed");
      return Response.json(directory.body ?? null, { status: directory.status ?? 200 });
    }
    throw new Error(`${name}: the sensor fetched ${url}, which the test does not serve`);
  }) as typeof fetch;
}

interface ClientResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function send(port: number, fixture: FixtureRequest, facts: FixtureFacts): Promise<ClientResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(fixture.url);
    const headers: Record<string, string> = { ...fixture.headers, host: url.host, "x-forwarded-for": facts.address ?? "" };
    if (facts.platform_request_id) headers["x-request-id"] = facts.platform_request_id;
    const req = httpRequest({ host: "127.0.0.1", port, method: fixture.method, path: `${url.pathname}${url.search}`, headers }, (res) => {
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

/** What the Node form records in place of the fixture's platform facts: the socket's own, and the form's identity. */
function nodeForm(record: Record<string, unknown>): Record<string, unknown> {
  if (record.schema !== "scope.request/1") return record;
  const observer = record.observer as Record<string, unknown>;
  return {
    ...record,
    source: "node",
    observer: { ...observer, package: "scope-journeys-node", version: VERSION, adapter: "node", name: "fixture-sensor" },
    "scope.client.asn": null,
    "scope.client.as_org": null,
    "scope.client.country": null,
    "scope.client.colo": null,
    "tls.protocol.version": null,
    "network.protocol.version": "HTTP/1.1",
    "scope.client.ja4": null,
    "scope.client.tls_ext_sha1": null,
    "scope.client.tls_hello_len": null,
    "scope.platform_bot": null,
  };
}

const withoutHop = (headers: Record<string, string>, extra: Set<string> = new Set()): Record<string, string> => Object.fromEntries(Object.entries(headers).filter(([k]) => !HOP_HEADERS.has(k.toLowerCase()) && !extra.has(k.toLowerCase())));

/** The assertion's claims carry the record's id (`jti`, `record`), masked on the record itself; masked inside the token here, the signature segment as the identity mask leaves it. */
function maskAssertion(headers: Record<string, string>): Record<string, string> {
  const token = headers["x-scope-assertion"];
  if (!token) return headers;
  const [head, claims, signature] = token.split(".");
  if (!head || !claims || !signature) return headers;
  const masked = Buffer.from(maskText(Buffer.from(claims, "base64url").toString("utf8")), "utf8").toString("base64url");
  return { ...headers, "x-scope-assertion": `${head}.${masked}.${signature}` };
}

for (const name of names) {
  test(`node form, fixture ${name}`, async () => {
    // A fresh process state per fixture, as the harness gives each run: every run fetches its directory once.
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
    const expected = JSON.parse(readFileSync(join(dir, "expected.json"), "utf8")) as { response: ClientResponse; forwarded: Captured[]; records: Array<Record<string, unknown>> };

    const forwarded: Captured[] = [];
    const shipped: unknown[][] = [];
    const origin = toyOrigin(upstream, forwarded);
    const originPort = await listen(origin);
    const env: Record<string, string> = { JOURNEYS_INSTALL_ID: INSTALL, JOURNEYS_INSTALL_KEY: "sjk_test_dddddddddddddddddddddddddddddddd", JOURNEYS_SALT: facts.salt ?? "fixture-salt", JOURNEYS_NAME: "fixture-sensor", JOURNEYS_API_URL: API, JOURNEYS_POLICY_URL: `https://policy.fixture.example/${name}`, JOURNEYS_TRUST_PROXY: "1" };
    if (facts.assertion) env.JOURNEYS_ASSERTION_KEY = JSON.stringify(facts.assertion.private_jwk);
    // The fixture's clock, as the harness runs it: a signature or an assertion is judged against the fixture's time, not the test's.
    let tick = 0;
    const base = Date.parse(facts.ts ?? "2026-10-10T12:00:00.000Z");
    const handler = createNodeHandler({ form: "proxy", origin: `http://127.0.0.1:${originPort}`, env, fetch: world(name, policy, facts, directory, shipped, forwarded), now: () => base + tick++, log: () => undefined });
    const sensor = createServer((req, res) => void handler(req, res));
    const sensorPort = await listen(sensor);
    try {
      const response = await send(sensorPort, request, facts);
      // A pass-through route records nothing and ships nothing; everything else ships once the response is out.
      for (let i = 0; i < (expected.records.length ? 300 : 10) && shipped.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
      if (expected.records.length) assert.ok(shipped.length >= 1, `${name}: nothing was shipped after the response`);
      else assert.equal(shipped.length, 0, `${name}: a pass-through route shipped a record`);
      const records = shipped.flat() as Array<Record<string, unknown>>;
      for (const record of records) assert.deepEqual(validateRecord(record as never).errors, [], `${name}: a record does not validate against its schema`);

      const actual = {
        response: maskResponse({ status: response.status, headers: withoutHop(response.headers), body: response.body }),
        forwarded: forwarded.map((f) => ({ ...f, headers: maskAssertion(Object.fromEntries(Object.entries(withoutHop(f.headers, TEST_HEADERS)).map(([k, v]) => [k, maskText(v)]).sort())) })),
        records: records.map((r) => applyMask(r)),
      };
      const wanted = {
        response: maskResponse(expected.response),
        forwarded: expected.forwarded.map((f) => ({ ...f, headers: maskAssertion(Object.fromEntries(Object.entries(withoutHop(f.headers, TEST_HEADERS)).sort())) })),
        records: expected.records.map((r) => applyMask(nodeForm(r))),
      };
      assert.equal(canonical(actual.response), canonical(wanted.response), `${name}: the response differs from expected.json`);
      assert.equal(canonical(actual.forwarded), canonical(wanted.forwarded), `${name}: what reached the origin differs from expected.json`);
      assert.equal(canonical(actual.records), canonical(wanted.records), `${name}: the shipped records differ from expected.json beyond the socket's facts`);
    } finally {
      sensor.closeAllConnections();
      origin.closeAllConnections();
      await Promise.all([new Promise((resolve) => sensor.close(resolve)), new Promise((resolve) => origin.close(resolve))]);
    }
  });
}
