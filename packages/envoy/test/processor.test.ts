// The Envoy processor without Docker: every synthetic fixture through the processor over real gRPC,
// driven by a stand-in for Envoy that speaks the ext_proc stream as Envoy does (request headers,
// the body when BUFFERED was asked, the response headers, the body in the mode asked, each mutation
// applied to what it holds). What the origin would receive and what the client would receive are
// compared with expected.json under the identity mask, with the form's stated allowances: the facts
// the stream cannot give, and a streamed body forwarded unamended (expected.envoy.json for the
// three server-sent-event fixtures the gate would have amended). The compose test under test/envoy
// runs the same fixtures through the real Envoy.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import * as grpc from "@grpc/grpc-js";
import { DEFAULT_API_URL, resetPolicyCache } from "scope-journeys";

import { applyMask, canonical, maskResponse, maskText } from "../../../scripts/canonical.mjs";
import type { FixtureDirectory, FixtureFacts, FixtureRequest, FixtureUpstream } from "../../core/test/harness.js";
import { validateRecord } from "../../core/src/validate.js";
import { VERSION } from "../../core/src/version.js";
import { BODY_MODE, ExternalProcessor, deliver, droppedSoFar, resetCache, resetDelivery, serveExtProc, type HeaderMutation, type HeaderValue, type ProcessingRequest, type ProcessingResponse } from "../src/index.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const FIXTURES = join(ROOT, "fixtures", "synthetic");
const INSTALL = "jin_fixture0000000000000000";
const API = "https://api.fixture.example";
// The three fixtures whose stream the gate amends on the other forms: here the stream passes unamended and the decision says so.
const ENVOY_EXPECTATION = new Set(["10-sse-tools-list", "11-sse-tool-call", "12-sse-declaration-appended"]);

const names = readdirSync(FIXTURES, { withFileTypes: true }).filter((d) => d.isDirectory() && /^\d\d-/.test(d.name)).map((d) => d.name).sort();

interface Captured {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
}

/** The policy, the directory and the ingest, answered in process. */
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

const headerValues = (headers: Record<string, string>): HeaderValue[] => Object.entries(headers).map(([key, value]) => ({ key, raw_value: Buffer.from(value, "latin1") }));

/** A mutation applied as Envoy applies it: set (overwrite or add) then remove; the pseudo headers untouched. */
function apply(headers: Record<string, string>, mutation: HeaderMutation | undefined): Record<string, string> {
  const out = { ...headers };
  for (const set of mutation?.set_headers ?? []) out[set.header.key.toLowerCase()] = set.header.raw_value ? Buffer.from(set.header.raw_value).toString("latin1") : (set.header.value ?? "");
  for (const name of mutation?.remove_headers ?? []) delete out[name.toLowerCase()];
  return out;
}

interface Outcome {
  response: { status: number; headers: Record<string, string>; body: string };
  forwarded: Captured[];
}

/** One fixture as Envoy would run it against the processor: the stream of messages, the mutations applied. */
async function drive(client: grpc.Client, fixture: { request: FixtureRequest; upstream: FixtureUpstream }, forwarded: Captured[]): Promise<Outcome> {
  const call = (client as unknown as { Process(): grpc.ClientDuplexStream<ProcessingRequest, ProcessingResponse> }).Process();
  const answers: ProcessingResponse[] = [];
  const waiters: Array<(r: ProcessingResponse) => void> = [];
  call.on("data", (r: ProcessingResponse) => {
    const w = waiters.shift();
    if (w) w(r);
    else answers.push(r);
  });
  const next = (): Promise<ProcessingResponse> => (answers.length ? Promise.resolve(answers.shift() as ProcessingResponse) : new Promise((resolve) => waiters.push(resolve)));
  const url = new URL(fixture.request.url);
  const requestHeaders: Record<string, string> = Object.fromEntries(Object.entries(fixture.request.headers).map(([k, v]) => [k.toLowerCase(), v]));
  const body = fixture.request.body === null ? null : fixture.request.bodyEncoding === "base64" ? Buffer.from(fixture.request.body, "base64") : Buffer.from(fixture.request.body, "utf8");
  const pseudo = { ":method": fixture.request.method, ":scheme": url.protocol.slice(0, -1), ":authority": url.host, ":path": `${url.pathname}${url.search}` };
  call.write({ request_headers: { headers: { headers: [...headerValues(pseudo), ...headerValues(requestHeaders)] }, end_of_stream: body === null } });
  let answer = await next();
  let toOrigin = requestHeaders;
  let originBody: Buffer | null = body;
  if (answer.immediate_response) return immediate(call, answer, forwarded);
  toOrigin = apply(toOrigin, answer.request_headers?.response.header_mutation);
  if (answer.mode_override?.request_body_mode === BODY_MODE.BUFFERED && body !== null) {
    call.write({ request_body: { body, end_of_stream: true } });
    answer = await next();
    if (answer.immediate_response) return immediate(call, answer, forwarded);
    toOrigin = apply(toOrigin, answer.request_body?.response.header_mutation);
    if (answer.request_body?.response.body_mutation?.body) originBody = Buffer.from(answer.request_body.response.body_mutation.body);
  }
  forwarded.push({ method: fixture.request.method, url: `${url.pathname}${url.search}`, headers: toOrigin, body: originBody === null ? null : originBody.toString("utf8") });

  const upstream = fixture.upstream;
  const upstreamHeaders: Record<string, string> = Object.fromEntries(Object.entries(upstream.headers).map(([k, v]) => [k.toLowerCase(), v]));
  const chunks: Buffer[] = upstream.stream ? upstream.stream.map((f) => Buffer.from(f, "utf8")) : upstream.body === null || upstream.body === undefined ? [] : [upstream.bodyEncoding === "base64" ? Buffer.from(upstream.body, "base64") : Buffer.from(upstream.body, "utf8")];
  const total = Buffer.concat(chunks);
  call.write({ response_headers: { headers: { headers: [...headerValues({ ":status": String(upstream.status) }), ...headerValues(upstreamHeaders)] }, end_of_stream: total.length === 0 } });
  answer = await next();
  let toClient = apply(upstreamHeaders, answer.response_headers?.response.header_mutation);
  let clientBody = total;
  const mode = answer.mode_override?.response_body_mode ?? BODY_MODE.NONE;
  if (total.length && mode === BODY_MODE.BUFFERED) {
    call.write({ response_body: { body: total, end_of_stream: true } });
    answer = await next();
    toClient = apply(toClient, answer.response_body?.response.header_mutation);
    if (answer.response_body?.response.body_mutation?.body) clientBody = Buffer.from(answer.response_body.response.body_mutation.body);
  } else if (total.length && mode === BODY_MODE.STREAMED) {
    for (let i = 0; i < chunks.length; i += 1) {
      call.write({ response_body: { body: chunks[i], end_of_stream: i === chunks.length - 1 } });
      answer = await next();
      assert.equal(answer.response_body?.response.body_mutation, undefined, "a streamed chunk is never rewritten");
    }
  }
  call.end();
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(clientBody);
  } catch {
    text = `base64:${clientBody.toString("base64")}`;
  }
  return { response: { status: upstream.status, headers: toClient, body: text }, forwarded };
}

function immediate(call: grpc.ClientDuplexStream<ProcessingRequest, ProcessingResponse>, answer: ProcessingResponse, forwarded: Captured[]): Outcome {
  call.end();
  const immediateResponse = answer.immediate_response as NonNullable<ProcessingResponse["immediate_response"]>;
  const headers = apply({}, immediateResponse.headers);
  const body = immediateResponse.body ? Buffer.from(immediateResponse.body).toString("utf8") : "";
  return { response: { status: immediateResponse.status.code, headers, body }, forwarded };
}

/** What the ext_proc form records in place of the fixture's platform facts. */
function envoyForm(record: Record<string, unknown>): Record<string, unknown> {
  if (record.schema !== "scope.request/1") return record;
  const observer = record.observer as Record<string, unknown>;
  return { ...record, source: "ext_proc", observer: { ...observer, package: "scope-journeys-envoy", version: VERSION, adapter: "envoy", name: "fixture-sensor" }, "scope.client.asn": null, "scope.client.as_org": null, "scope.client.country": null, "scope.client.colo": null, "tls.protocol.version": null, "network.protocol.version": null, "scope.client.ja4": null, "scope.client.tls_ext_sha1": null, "scope.client.tls_hello_len": null, "scope.platform_bot": null };
}

/** The assertion's claims carry the record's id, masked inside the token as the Node test masks it. */
function maskAssertion(headers: Record<string, string>): Record<string, string> {
  const token = headers["x-scope-assertion"];
  if (!token) return headers;
  const [head, claims, signature] = token.split(".");
  if (!head || !claims || !signature) return headers;
  return { ...headers, "x-scope-assertion": `${head}.${Buffer.from(maskText(Buffer.from(claims, "base64url").toString("utf8")), "utf8").toString("base64url")}.${signature}` };
}

const TEST_HEADERS = new Set(["x-forwarded-for", "x-request-id"]);
const without = (headers: Record<string, string>, names: Set<string>): Record<string, string> => Object.fromEntries(Object.entries(headers).filter(([k]) => !names.has(k.toLowerCase())));

for (const name of names) {
  test(`ext_proc form, fixture ${name}`, async () => {
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
    const expectedPath = join(dir, ENVOY_EXPECTATION.has(name) ? "expected.envoy.json" : "expected.json");

    const forwarded: Captured[] = [];
    const shipped: unknown[][] = [];
    const env: Record<string, string> = { JOURNEYS_INSTALL_ID: INSTALL, JOURNEYS_INSTALL_KEY: "sjk_test_dddddddddddddddddddddddddddddddd", JOURNEYS_SALT: facts.salt ?? "fixture-salt", JOURNEYS_NAME: "fixture-sensor", JOURNEYS_API_URL: API, JOURNEYS_POLICY_URL: `https://policy.fixture.example/${name}` };
    if (facts.assertion) env.JOURNEYS_ASSERTION_KEY = JSON.stringify(facts.assertion.private_jwk);
    let tick = 0;
    const base = Date.parse(facts.ts ?? "2026-10-10T12:00:00.000Z");
    const server = await serveExtProc({ listen: "127.0.0.1:0", env, fetch: world(name, policy, facts, directory, shipped, forwarded), now: () => base + tick++, log: () => undefined, signals: false, drainMs: 2_000 });
    const client = new ExternalProcessor(`127.0.0.1:${server.port}`, grpc.credentials.createInsecure());
    try {
      // The stream carries the fixture's address and request id the way a listener sets them.
      const withEnvoy = { ...request, headers: { ...request.headers, "x-forwarded-for": facts.address ?? "", ...(facts.platform_request_id ? { "x-request-id": facts.platform_request_id } : {}) } };
      const outcome = await drive(client, { request: withEnvoy, upstream }, forwarded);
      const expectsRecords = !/passthrough/.test(name) && name !== "20-passthrough-binary" && name !== "21-tarball-download";
      for (let i = 0; i < (expectsRecords ? 300 : 10) && shipped.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
      const records = shipped.flat() as Array<Record<string, unknown>>;
      for (const record of records) assert.deepEqual(validateRecord(record as never).errors, [], `${name}: a record does not validate against its schema`);
      const actual = {
        response: maskResponse({ status: outcome.response.status, headers: without(outcome.response.headers, new Set(["content-length"])), body: outcome.response.body }),
        forwarded: forwarded.map((f) => ({ ...f, headers: maskAssertion(Object.fromEntries(Object.entries(without(f.headers, TEST_HEADERS)).filter(([k]) => k !== "content-length").map(([k, v]) => [k, maskText(v)]).sort())) })),
        records: records.map((r) => applyMask(r)),
      };
      if (!existsSync(expectedPath)) {
        writeFileSync(expectedPath, `${JSON.stringify({ response: actual.response, forwarded: actual.forwarded, records: actual.records }, null, 2)}\n`);
        assert.fail(`${name}: ${expectedPath.split("/").pop()} was absent and has been written; review it (the stream forwarded unamended, the decision skipped with streamed_body) and commit it`);
      }
      const expected = JSON.parse(readFileSync(expectedPath, "utf8")) as { response: { status: number; headers: Record<string, string>; body: string }; forwarded: Captured[]; records: Array<Record<string, unknown>> };
      const wanted = {
        response: maskResponse({ ...expected.response, headers: without(expected.response.headers, new Set(["content-length"])) }),
        forwarded: expected.forwarded.map((f) => ({ ...f, headers: maskAssertion(Object.fromEntries(Object.entries(without(f.headers, TEST_HEADERS)).sort())) })),
        records: expected.records.map((r) => applyMask(ENVOY_EXPECTATION.has(name) ? r : envoyForm(r))),
      };
      assert.equal(canonical(actual.response), canonical(wanted.response), `${name}: the client's response differs`);
      assert.equal(canonical(actual.forwarded), canonical(wanted.forwarded), `${name}: what the origin receives differs`);
      assert.equal(canonical(actual.records), canonical(wanted.records), `${name}: the shipped records differ beyond the stream's facts`);
    } finally {
      client.close();
      await server.close();
    }
  });
}

test("with no JOURNEYS_API_URL the processor fetches its policy from and ships its records to Scope's production API, never puts the install key on the hop, and ships nothing without it", async () => {
  const dir = join(FIXTURES, "01-html-page");
  const request = JSON.parse(readFileSync(join(dir, "request.json"), "utf8")) as FixtureRequest;
  const upstream = JSON.parse(readFileSync(join(dir, "upstream.json"), "utf8")) as FixtureUpstream;
  const policy: unknown = JSON.parse(readFileSync(join(FIXTURES, "policy.json"), "utf8"));
  const urls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    urls.push(url);
    return url.endsWith("/policy") ? Response.json(policy, { headers: { etag: '"3"' } }) : new Response(null, { status: 202 });
  }) as typeof fetch;
  for (const key of ["sjk_test_dddddddddddddddddddddddddddddddd", null]) {
    resetPolicyCache();
    resetDelivery();
    resetCache();
    urls.length = 0;
    const forwarded: Captured[] = [];
    const env: Record<string, string> = { JOURNEYS_INSTALL_ID: INSTALL, JOURNEYS_SALT: "fixture-salt", ...(key ? { JOURNEYS_INSTALL_KEY: key } : {}) };
    const server = await serveExtProc({ listen: "127.0.0.1:0", env, fetch: fetcher, log: () => undefined, signals: false, drainMs: 2_000 });
    const client = new ExternalProcessor(`127.0.0.1:${server.port}`, grpc.credentials.createInsecure());
    try {
      await drive(client, { request, upstream }, forwarded);
      for (let i = 0; i < 30; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
      assert.deepEqual(urls, key ? [`${DEFAULT_API_URL}/v1/installs/${INSTALL}/policy`, `${DEFAULT_API_URL}/v1/requests`] : [], key ? "the policy and the record" : "nothing goes to Scope without the key");
      assert.equal(forwarded[0]?.headers["x-acme-key"], undefined, "the install key never goes to the origin, whatever the policy names");
    } finally {
      client.close();
      await server.close();
    }
  }
});

test("without JOURNEYS_SALT nothing is fetched or recorded: every request continues untouched, the probe answers no-salt", async () => {
  const dir = join(FIXTURES, "01-html-page");
  const request = JSON.parse(readFileSync(join(dir, "request.json"), "utf8")) as FixtureRequest;
  const upstream = JSON.parse(readFileSync(join(dir, "upstream.json"), "utf8")) as FixtureUpstream;
  const urls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    urls.push(String(input instanceof Request ? input.url : input));
    return new Response(null, { status: 202 });
  }) as typeof fetch;
  resetPolicyCache();
  resetDelivery();
  resetCache();
  const warnings: string[] = [];
  const env: Record<string, string> = { JOURNEYS_INSTALL_ID: INSTALL, JOURNEYS_INSTALL_KEY: "sjk_test_dddddddddddddddddddddddddddddddd", JOURNEYS_API_URL: API };
  const server = await serveExtProc({ listen: "127.0.0.1:0", env, fetch: fetcher, log: (_level, line) => warnings.push(line), signals: false, drainMs: 2_000 });
  const client = new ExternalProcessor(`127.0.0.1:${server.port}`, grpc.credentials.createInsecure());
  try {
    const forwarded: Captured[] = [];
    const page = await drive(client, { request, upstream }, forwarded);
    assert.equal(page.response.body, upstream.body, "the origin's page as it answered");
    assert.deepEqual(forwarded[0]?.headers, Object.fromEntries(Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v])), "the request reaches the origin with no mutation");
    const probe = await drive(client, { request: { method: "GET", url: "https://docs.acme.example/.well-known/journeys-probe?journeys_probe=c21va2U", headers: {}, body: null }, upstream }, []);
    assert.equal(probe.response.status, 204);
    assert.equal(probe.response.headers["x-journeys-probe"], "no-salt");
    // Observability mode streams every body unasked: each message continues and nothing is read.
    const call = (client as unknown as { Process(): grpc.ClientDuplexStream<ProcessingRequest, ProcessingResponse> }).Process();
    const answers: ProcessingResponse[] = [];
    call.on("data", (r: ProcessingResponse) => answers.push(r));
    const pseudo = { ":method": "POST", ":scheme": "https", ":authority": "api.acme.example", ":path": "/api/v1/hooks?api_key=sk_live_ABC" };
    call.write({ request_headers: { headers: { headers: headerValues({ ...pseudo, "content-type": "application/json" }) }, end_of_stream: false } });
    call.write({ request_body: { body: Buffer.from('{"name":"orders"}'), end_of_stream: true } });
    call.write({ response_headers: { headers: { headers: headerValues({ ":status": "200", "content-type": "application/json" }) }, end_of_stream: false } });
    call.write({ response_body: { body: Buffer.from('{"ok":true}'), end_of_stream: true } });
    for (let i = 0; i < 100 && answers.length < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    call.end();
    assert.deepEqual(answers.map((a) => [a.request_headers, a.request_body, a.response_headers, a.response_body].findIndex(Boolean)), [0, 1, 2, 3], "one answer per message, in order");
    for (const a of answers) {
      const common = (a.request_headers ?? a.request_body ?? a.response_headers ?? a.response_body)?.response;
      assert.deepEqual([common?.status ?? 0, common?.header_mutation, common?.body_mutation, a.mode_override, a.immediate_response], [0, undefined, undefined, undefined, undefined], "continued unchanged");
    }
    for (let i = 0; i < 30; i += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(urls, [], "no settings fetch and no shipment");
    assert.equal(warnings.filter((l) => /JOURNEYS_SALT is not set/.test(l)).length, 1, warnings.join("\n"));
  } finally {
    client.close();
    await server.close();
  }
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
  assert.deepEqual(redirects, ["manual"]);
  assert.deepEqual(log, ["journeys: shipment refused with 307; dropping the batch"]);
  assert.equal(droppedSoFar(), 1);
  resetDelivery();
});
