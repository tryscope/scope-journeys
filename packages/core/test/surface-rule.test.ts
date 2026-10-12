// The surface rule, pinned twice. Under the embedded default policy (version 0, no surface map,
// no rule) every response but the probe's is byte-identical to the origin's for every reader,
// headers included but for the five the gateway rebuilds, and the hop carries the client's
// headers plus Via and minus accept-encoding. Under a policy whose every rule is live, and under
// its dry-run twin, a path the surface map does not name is passed through as the origin
// answered it, for every reader and every kind of answer, with no page facts, no reference and
// no decision recorded; the same answers on a mapped documentation path are rewritten, which is
// what makes the unmapped rows a pin and not a vacuity.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { makeIo, runFixture, type Fixture, type FixtureFacts, type FixtureRequest, type FixtureUpstream } from "./harness.js";
import { defaultPolicy } from "../src/policy.js";
import type { ScopeRequest1 } from "../src/generated/request.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const SYNTHETIC = join(ROOT, "fixtures", "synthetic");
const facts: FixtureFacts = JSON.parse(readFileSync(join(SYNTHETIC, "01-html-page", "facts.json"), "utf8"));
const live = JSON.parse(readFileSync(join(SYNTHETIC, "policy.json"), "utf8"));
const dryRun = JSON.parse(readFileSync(join(SYNTHETIC, "policy.dryrun.json"), "utf8"));

const READERS: Record<string, Record<string, string>> = {
  browser: { accept: "text/html", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", "sec-ch-ua": '"Chromium";v="130"', "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "upgrade-insecure-requests": "1" },
  "claude-code": { accept: "text/markdown, text/html;q=0.9", "user-agent": "Claude-User (claude-code/2.1.0; +https://www.anthropic.com/claude-code)" },
  cursor: { accept: "text/markdown, text/plain;q=0.9", "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36" },
  unknown: { accept: "*/*", "user-agent": "npm/10.9.2 node/v24.13.1 darwin arm64" },
};

const ANSWERS: Record<string, FixtureUpstream> = {
  "html page": { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-origin-own": "kept", "content-length": "9999" }, body: '<!doctype html><html><head><meta charset="utf-8"><title>Approve a device | Acme Hooks</title></head><body>\n<h1>Approve a device</h1>\n<p>Install with <code>npm install acme-cli</code>, then open <a href="https://acme.example/docs/quickstart">the quickstart</a>. MCP: https://acme.example/mcp</p>\n</body></html>' },
  "markdown page": { status: 200, headers: { "content-type": "text/markdown; charset=utf-8" }, body: "# Getting started\n\nInstall with `npm install acme-cli`, then read [the quickstart](https://acme.example/docs/quickstart).\n\nMCP: https://acme.example/mcp\n" },
  "text page": { status: 200, headers: { "content-type": "text/plain; charset=utf-8" }, body: "# Acme\n\n- https://acme.example/docs/quickstart\n" },
  "html 404": { status: 404, headers: { "content-type": "text/html; charset=utf-8" }, body: "<!doctype html><html><body><h1>Not found</h1></body></html>" },
  "json 404": { status: 404, headers: { "content-type": "application/json" }, body: '{"error":{"code":"not_found","message":"No such route."}}' },
  "json 401": { status: 401, headers: { "content-type": "application/json", "www-authenticate": "Bearer" }, body: '{"error":{"code":"unauthorized","message":"Provide an API key."}}' },
  "json 200": { status: 200, headers: { "content-type": "application/json", "mcp-session-id": "sess-origin-1" }, body: '{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"list_apps"}]}}' },
};

const REBUILT_DROPS = ["content-length", "content-encoding", "transfer-encoding", "connection", "keep-alive"];
const HOP_DROPS = ["accept-encoding", "host", "connection", "keep-alive", "transfer-encoding", "te", "content-length"];

const originHeaders = (upstream: FixtureUpstream): Record<string, string> => {
  const out: Record<string, string> = {};
  new Response(upstream.body ?? null, { status: upstream.status, headers: upstream.headers }).headers.forEach((v, k) => {
    if (!REBUILT_DROPS.includes(k)) out[k] = v;
  });
  return out;
};

const clientRequest = (path: string, reader: string, method = "GET", body: string | null = null): FixtureRequest => ({
  method,
  url: `https://acme.example${path}`,
  headers: { ...READERS[reader], "cf-connecting-ip": "203.0.113.7", "accept-encoding": "gzip, br", ...(body === null ? {} : { "content-type": "application/json" }) },
  body,
});

async function through(policy: unknown, request: FixtureRequest, upstream: FixtureUpstream, label: string) {
  const fixture: Fixture = { name: label, request, upstream, policy, facts };
  const result = await runFixture(fixture, makeIo({ upstream }));
  const headers = Object.fromEntries(Object.entries(result.response.headers).filter(([k]) => !REBUILT_DROPS.includes(k)));
  assert.equal(result.response.status, upstream.status, `${label}: status`);
  assert.equal(result.response.body, upstream.body, `${label}: body`);
  assert.deepEqual(headers, originHeaders(upstream), `${label}: response headers`);
  assert.equal(result.forwarded.length, 1, `${label}: one hop to the origin`);
  const hop = result.forwarded[0];
  assert.ok(hop);
  assert.equal(hop.method, request.method, `${label}: method`);
  assert.equal(hop.url, request.url.slice("https://acme.example".length), `${label}: url`);
  assert.equal(hop.body, request.body, `${label}: hop body`);
  const expectedHop: Record<string, string> = { via: "1.1 fixture-sensor" };
  for (const [k, v] of Object.entries(request.headers)) if (!HOP_DROPS.includes(k)) expectedHop[k] = v;
  const forward = (policy as { forward?: { headers?: Record<string, string> } }).forward?.headers ?? {};
  for (const [k, v] of Object.entries(forward)) expectedHop[k] = v.replaceAll("{host}", "acme.example");
  assert.deepEqual(Object.fromEntries(Object.entries(hop.headers).filter(([k]) => k !== "content-length")), expectedHop, `${label}: hop headers`);
  const records = result.records.filter((r): r is ScopeRequest1 => r.schema === "scope.request/1");
  assert.equal(records.length, 1, `${label}: one record`);
  assert.equal(result.records.length, 1, `${label}: no declaration`);
  const record = records[0];
  assert.ok(record);
  assert.equal(record["scope.page"], null, `${label}: no page facts`);
  assert.equal(record["scope.reference_minted"], null, `${label}: no reference`);
  assert.deepEqual(record["scope.decision"], [], `${label}: no decision`);
  return record;
}

test("the default policy: every response is byte-identical to the origin's for every reader, headers included but for the ones the gateway rebuilds; the hop is the client's headers plus Via, minus accept-encoding", async () => {
  const requests: Array<[string, string, string | null, string]> = [
    ["/docs/quickstart", "GET", null, "html page"],
    ["/docs/quickstart.md", "GET", null, "markdown page"],
    ["/llms.txt", "GET", null, "text page"],
    ["/docs/webhooks/retries", "GET", null, "html 404"],
    ["/api/v1/hooks", "GET", null, "json 401"],
    ["/api/v1/nope", "GET", null, "json 404"],
    ["/mcp?ref=5Z4KJ7N9", "POST", '{"jsonrpc":"2.0","id":2,"method":"tools/list"}', "json 200"],
    ["/api/docs/find?task=catch%20webhooks", "GET", null, "json 200"],
    ["/device?code=ABCD-EFGH", "GET", null, "html page"],
    ["/dl/acme-cli.tgz?ref=5Z4KJ7N9", "GET", null, "text page"],
  ];
  const seen = new Set<string>();
  for (const reader of Object.keys(READERS)) {
    for (const [path, method, body, answer] of requests) {
      const record = await through(defaultPolicy, clientRequest(path, reader, method, body), ANSWERS[answer] as FixtureUpstream, `default policy, ${reader}, ${method} ${path} -> ${answer}`);
      assert.equal(record["scope.reader"], reader, `${reader} on ${path}: the reader family`);
      assert.equal(record.observer.policy_version, 0);
      seen.add(record["scope.reader"]);
    }
  }
  assert.deepEqual([...seen].sort(), ["browser", "claude-code", "cursor", "unknown"]);
});

test("a path the surface map does not name is never changed by any rule, live or dry run, for any reader and any answer; the same answers on a mapped documentation path are", async () => {
  const unmapped = ["/device?code=ABCD-EFGH", "/guides/getting-started", "/account/settings.md", "/changelog", "/api-reference"];
  for (const [mode, policy] of [["live", live], ["dry run", dryRun]] as const) {
    for (const reader of Object.keys(READERS)) {
      for (const path of unmapped) {
        for (const [answer, upstream] of Object.entries(ANSWERS)) {
          const record = await through(policy, clientRequest(path, reader), upstream, `${mode}, ${reader}, GET ${path} -> ${answer}`);
          assert.equal(record["scope.route"], "other", `${path}: other`);
          assert.equal(record["scope.reader"], reader);
        }
      }
    }
  }
  const page = await runFixture({ name: "control page", request: clientRequest("/docs/quickstart", "claude-code"), upstream: ANSWERS["html page"] as FixtureUpstream, policy: live, facts }, makeIo({ upstream: ANSWERS["html page"] as FixtureUpstream }));
  assert.notEqual(page.response.body, ANSWERS["html page"]?.body, "the control: the same page on a mapped documentation path is rewritten");
  const pageRecord = page.records[0] as ScopeRequest1;
  assert.ok((pageRecord["scope.page"]?.injected?.length ?? 0) > 0, "the control: the inject rules applied");
  const missing = await runFixture({ name: "control 404", request: clientRequest("/docs/webhooks/retries", "browser"), upstream: ANSWERS["html 404"] as FixtureUpstream, policy: live, facts }, makeIo({ upstream: ANSWERS["html 404"] as FixtureUpstream }));
  assert.equal(missing.response.status, 404);
  assert.notEqual(missing.response.body, ANSWERS["html 404"]?.body, "the control: the helpful 404 on a mapped documentation path");
  const dry = await runFixture({ name: "control dry run", request: clientRequest("/docs/quickstart", "claude-code"), upstream: ANSWERS["html page"] as FixtureUpstream, policy: dryRun, facts }, makeIo({ upstream: ANSWERS["html page"] as FixtureUpstream }));
  assert.equal(dry.response.body, ANSWERS["html page"]?.body, "the control: dry run changes nothing on the wire");
  assert.ok(((dry.records[0] as ScopeRequest1)["scope.decision"] ?? []).some((d) => d.outcome === "would_apply"), "the control: dry run records what it would have done on a mapped path");
});
