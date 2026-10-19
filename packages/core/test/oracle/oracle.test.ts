// The oracle: the lab's sensor.js, loaded from JOURNEYS_LAB_PATH, and the packaged
// core run the same fixtures against the same in-memory upstream with the same clock, entropy and
// salt; the responses, the forwarded requests and the lab-visible projections of the records are
// diffed under the volatile mask. The one test allowed a skip: the oracle is private.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

import { applyMask, canonical, maskResponse } from "../../../../scripts/canonical.mjs";
import { FIXTURE_SALT, FIXTURE_TS, buildRequest, makeIo, readText, runFixture, xorshift, type Fixture, type FixtureUpstream } from "../harness.js";
import type { ScopeDeclaration1 } from "../../src/generated/declaration.js";
import type { ScopeRequest1 } from "../../src/generated/request.js";
import { declarationProjection, labDeclaration, labProjection, recordProjection, routesFromSurfaces, type LabRecord } from "./projection.js";

const LAB = process.env.JOURNEYS_LAB_PATH;
const LAB_POLICY = process.env.JOURNEYS_LAB_POLICY;
const ROOT = new URL("../../../../", import.meta.url).pathname;
const FIXTURES = join(ROOT, "fixtures", "synthetic");
const ENV = { CONFIG_URL: "https://lab.invalid/policy.json", ORIGIN: "https://origin.invalid", SENSOR_NAME: "fixture-sensor", REPORT_KEY: "fixture-key", HASH_SALT: FIXTURE_SALT };
const REPORT = "https://lab.invalid/report";

interface LabHandle {
  handle(request: Request, env: Record<string, string>, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response>;
}

function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURES, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d\d-/.test(d.name))
    .map((d) => d.name)
    .sort()
    .map((name) => {
      const dir = join(FIXTURES, name);
      const policyRef = JSON.parse(readFileSync(join(dir, "policy.json"), "utf8"));
      const policy = typeof policyRef.$ref === "string" ? JSON.parse(readFileSync(join(dir, policyRef.$ref), "utf8")) : policyRef;
      return { name, request: JSON.parse(readFileSync(join(dir, "request.json"), "utf8")), upstream: JSON.parse(readFileSync(join(dir, "upstream.json"), "utf8")), policy, facts: JSON.parse(readFileSync(join(dir, "facts.json"), "utf8")) };
    });
}

/** The policy as the lab's sensor reads it: the routes form (derived from the map when needed), the report destination the oracle captures. */
function labPolicy(policy: Record<string, unknown>): Record<string, unknown> {
  // The lab's sensor forwards to the policy's origin when it names one; the oracle's mocked fetch
  // answers the in-memory upstream at ENV.ORIGIN only, so a real policy (JOURNEYS_LAB_POLICY) is
  // pointed there. The forwarded url is compared without its origin on both sides.
  const out: Record<string, unknown> = { ...policy, origin: ENV.ORIGIN, report: { url: REPORT, key_header: "x-edge-key" } };
  if (policy.surfaces && typeof policy.surfaces === "object") {
    const routes = policy.routes && typeof policy.routes === "object" ? (policy.routes as Record<string, unknown>) : {};
    out.routes = routesFromSurfaces(policy.surfaces as Record<string, unknown>, typeof routes.run_prefix === "string" ? routes.run_prefix : undefined);
    delete out.surfaces;
  }
  return out;
}

async function upstreamBody(upstream: FixtureUpstream): Promise<Response> {
  if (upstream.stream) {
    const frames = upstream.stream;
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const frame of frames) {
            controller.enqueue(encoder.encode(frame));
            await new Promise((resolve) => setTimeout(resolve, 1));
          }
          controller.close();
        },
      }),
      { status: upstream.status, headers: upstream.headers },
    );
  }
  const body = upstream.body === null || upstream.body === undefined ? null : upstream.bodyEncoding === "base64" ? Uint8Array.from(atob(upstream.body), (c) => c.charCodeAt(0)) : upstream.body;
  return new Response(body as BodyInit | null, { status: upstream.status, headers: upstream.headers });
}

/**
 * The clock both sides run a fixture at: one instant moved 61 seconds per fixture (not the fixture's
 * own instant, which the fixtures do not keep monotonic), so the lab's sensor refetches its policy
 * every time: its module-level cache holds a document for 60 seconds and the loader hands every
 * import of the file the same module instance.
 */
const oracleClock = (fixture: Fixture, index: number): number => {
  void fixture;
  return Date.parse(FIXTURE_TS) + index * 61_000;
};

interface LabRun {
  response: { status: number; headers: Record<string, string>; body: string };
  records: LabRecord[];
  forwarded: Array<{ method: string; url: string; headers: Record<string, string>; body: string | null }>;
}

async function runLab(fixture: Fixture, policy: Record<string, unknown>, index: number): Promise<LabRun> {
  const mod = (await import(`${pathToFileURL(LAB as string).href}?fixture=${index}`)) as LabHandle;
  const next = xorshift(1);
  const records: LabRecord[] = [];
  const forwarded: LabRun["forwarded"] = [];
  const pending: Promise<unknown>[] = [];
  const realFetch = globalThis.fetch;
  const realNow = Date.now;
  const realRandom = crypto.getRandomValues.bind(crypto);
  const realUuid = crypto.randomUUID.bind(crypto);
  const now = oracleClock(fixture, index);
  Date.now = () => now;
  (crypto as { getRandomValues: unknown }).getRandomValues = (array: Uint8Array) => {
    for (let i = 0; i < array.length; i += 1) array[i] = next() & 255;
    return array;
  };
  (crypto as { randomUUID: unknown }).randomUUID = () => {
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i += 1) bytes[i] = next() & 255;
    bytes[6] = 0x40 | ((bytes[6] ?? 0) & 0x0f);
    bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
    const h = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url === ENV.CONFIG_URL) {
      if (process.env.ORACLE_DEBUG) console.log(`oracle: ${fixture.name} lab fetched the policy (record_bodies=${String(policy.record_bodies)}, if-none-match=${String(new Headers(init?.headers).get("if-none-match"))})`);
      return Response.json(policy, { headers: { etag: `"oracle-${index}"` } });
    }
    if (url === REPORT) {
      records.push(JSON.parse(String(init?.body)) as LabRecord);
      return new Response(null, { status: 204 });
    }
    if (url.startsWith(ENV.ORIGIN)) {
      const headers: Record<string, string> = {};
      new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
      const body = init?.body === undefined ? null : typeof init.body === "string" ? init.body : new TextDecoder().decode(init.body as ArrayBuffer);
      forwarded.push({ method: init?.method ?? "GET", url: url.slice(ENV.ORIGIN.length), headers, body });
      return upstreamBody(fixture.upstream);
    }
    throw new Error(`oracle: the lab's sensor fetched an unexpected url ${url}`);
  }) as typeof fetch;
  try {
    const request = buildRequest(fixture.request);
    const f = fixture.facts;
    Object.defineProperty(request, "cf", { value: { asn: f.asn ?? undefined, asOrganization: f.as_org ?? undefined, country: f.country ?? undefined, colo: f.colo ?? undefined, tlsVersion: f.tls.protocol_version ?? undefined, httpProtocol: f.tls.network_protocol_version ?? undefined, tlsClientExtensionsSha1: f.tls.tls_ext_sha1 ?? undefined, tlsClientHelloLength: f.tls.tls_hello_len ?? undefined, botManagement: f.tls.ja4 ? { ja4: f.tls.ja4 } : undefined } });
    const response = await mod.handle(request, { ...ENV, HASH_SALT: fixture.facts.salt ?? FIXTURE_SALT }, { waitUntil: (p) => pending.push(p) });
    const body = await readText(response);
    await Promise.all(pending);
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => (headers[k] = v));
    return { response: { status: response.status, headers, body }, records, forwarded };
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
    (crypto as { getRandomValues: unknown }).getRandomValues = realRandom;
    (crypto as { randomUUID: unknown }).randomUUID = realUuid;
  }
}

const sortedHeaders = (h: Record<string, string>): Record<string, string> => Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]).filter(([k]) => k !== "content-length").sort(([a], [b]) => (String(a) < String(b) ? -1 : 1)));

test("oracle: the packaged core reproduces the lab's sensor.js on every fixture", { skip: !LAB ? "JOURNEYS_LAB_PATH unset (the oracle is private)" : false }, async () => {
  const only = process.env.ORACLE_ONLY ? new Set(process.env.ORACLE_ONLY.split(",")) : null;
  const fixtures = loadFixtures().filter((f) => !only || only.has(f.name.slice(0, 2)));
  const labOverride = LAB_POLICY ? (JSON.parse(readFileSync(LAB_POLICY, "utf8")) as Record<string, unknown>) : null;
  let differingRecords = 0;
  let differingResponses = 0;
  const problems: string[] = [];
  // A fixture for behaviour the oracle's sensor never had declares it in `oracle.json`
  // ({lab: "predates", reason}); it is named in the summary, never silently skipped.
  const predates: string[] = [];
  for (const [index, fixture] of fixtures.entries()) {
    const declaration = join(FIXTURES, fixture.name, "oracle.json");
    if (existsSync(declaration)) {
      const declared = JSON.parse(readFileSync(declaration, "utf8")) as { lab?: unknown; reason?: unknown };
      assert.equal(declared.lab, "predates", `${fixture.name}: oracle.json declares lab: ${String(declared.lab)}; the only declaration is "predates"`);
      assert.ok(typeof declared.reason === "string" && declared.reason.length > 20, `${fixture.name}: oracle.json needs a reason`);
      predates.push(fixture.name);
      continue;
    }
    const policyDoc = (labOverride ?? fixture.policy) as Record<string, unknown>;
    const lab = await runLab(fixture, labPolicy(policyDoc), index);
    const io = makeIo({ upstream: fixture.upstream, salt: fixture.facts.salt, forwardKey: ENV.REPORT_KEY, keyHeader: typeof (policyDoc.forward as Record<string, unknown> | undefined)?.key_header === "string" ? ((policyDoc.forward as Record<string, unknown>).key_header as string) : null, now: oracleClock(fixture, index) });
    const ours = await runFixture({ ...fixture, policy: policyDoc }, io);

    const labResponse = canonical(maskResponse({ ...lab.response, headers: sortedHeaders(lab.response.headers) }));
    const ourResponse = canonical(maskResponse({ ...ours.response, headers: sortedHeaders(ours.response.headers) }));
    if (labResponse !== ourResponse) {
      differingResponses += 1;
      let at = 0;
      while (at < labResponse.length && at < ourResponse.length && labResponse[at] === ourResponse[at]) at += 1;
      problems.push(`${fixture.name}: response differs at byte ${at}\n  lab: ${labResponse.slice(Math.max(0, at - 120), at + 160)}\n  new: ${ourResponse.slice(Math.max(0, at - 120), at + 160)}`);
    }
    const labForwarded = canonical(lab.forwarded.map((f) => ({ ...f, headers: sortedHeaders(f.headers) })));
    const ourForwarded = canonical(ours.forwarded.map((f) => ({ ...f, headers: sortedHeaders(f.headers) })));
    if (labForwarded !== ourForwarded) {
      differingResponses += 1;
      problems.push(`${fixture.name}: forwarded request\n  lab: ${labForwarded.slice(0, 400)}\n  new: ${ourForwarded.slice(0, 400)}`);
    }
    const labRequests = lab.records.filter((r) => r.kind === "mw_request").map((r) => canonical(applyMask(labProjection(r)))).sort();
    const ourRequests = ours.records.filter((r): r is ScopeRequest1 => r.schema === "scope.request/1").map((r) => canonical(applyMask(recordProjection(r)))).sort();
    const labDeclarations = lab.records.filter((r) => r.kind === "mw_intent").map((r) => canonical(applyMask(labDeclaration(r)))).sort();
    const ourDeclarations = ours.records.filter((r): r is ScopeDeclaration1 => r.schema === "scope.declaration/1").map((r) => canonical(applyMask(declarationProjection(r)))).sort();
    const a = [...labRequests, ...labDeclarations];
    const b = [...ourRequests, ...ourDeclarations];
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i += 1) {
      if (a[i] !== b[i]) {
        differingRecords += 1;
        problems.push(`${fixture.name}: record ${i}\n  lab: ${a[i] ?? "(none)"}\n  new: ${b[i] ?? "(none)"}`);
      }
    }
  }
  console.log(`${fixtures.length - predates.length} fixtures, ${differingRecords} differing records, ${differingResponses} differing responses${predates.length ? `, ${predates.length} the oracle's sensor predates (${predates.join(", ")})` : ""}`);
  assert.deepEqual(problems, [], problems.join("\n\n"));
});
