// `journeys doctor` against a mocked sensor host and a mocked API: the probe URL and its
// nonce round trip, the facts table, the ordering of the fixes (the docs host first), the exit codes.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { doctor, fixFor, renderDoctorReport, type DoctorDeps } from "../src/cli/doctor.js";
import { PROBE_HEADER, PROBE_PATH } from "../src/observe.js";
import { VERSION } from "../src/version.js";

const INSTALL_ID = "jin_test0000000000000000000000";

interface World {
  fronted: Record<string, boolean>;
  /** Hosts whose sensor has no salt: it answers the probe `no-salt` and records nothing. */
  unsalted?: Record<string, boolean>;
  arrives: Record<string, number>;
  facts: Record<string, Record<string, boolean>>;
  apiMissing: Array<{ fact: string; fix: string }>;
  apiDown?: boolean;
  install: { form: string; hosts: string[]; package?: { name: string; version: string; adapter: string } | null; state?: string };
  probes: string[];
  polls: number;
}

function deps(world: World): DoctorDeps {
  let t = Date.parse("2026-10-10T12:00:00.000Z");
  let drawn = 0;
  return {
    fetch: async (input) => {
      const url = new URL(String(input));
      if (url.pathname === PROBE_PATH) {
        world.probes.push(`${url.host}${url.search}`);
        if (world.fronted[url.host]) return new Response(null, { status: 204, headers: { [PROBE_HEADER]: world.unsalted?.[url.host] ? "no-salt" : "received" } });
        return new Response("<h1>Not found</h1>", { status: 404 });
      }
      if (world.apiDown) throw new TypeError("fetch failed");
      if (url.pathname === `/v1/installs/${INSTALL_ID}`) return Response.json({ install: { install_id: INSTALL_ID, package: { name: "scope-journeys", version: VERSION, adapter: "next" }, state: "unclaimed", salt_epoch: 1, policy_version: 3, ...world.install } });
      const probe = /\/probes\/([^/]+)$/.exec(url.pathname);
      if (probe) {
        world.polls += 1;
        const nonce = decodeURIComponent(probe[1] ?? "");
        const sent = world.probes.find((p) => p.endsWith(nonce));
        const host = sent?.split("?")[0] ?? "";
        const after = world.arrives[host] ?? Infinity;
        if (world.polls >= after) return Response.json({ found: true, request_id: "00000000-0000-7000-8000-000000000000", ts: new Date(t + 300).toISOString(), facts: world.facts[host] ?? {}, missing: world.apiMissing });
        return Response.json({ found: false, request_id: null, ts: null, facts: {}, missing: [{ fact: "request", fix: "no request carrying this nonce reached the ingest; check the host the probe was sent to is one the install fronts" }] });
      }
      return new Response("nope", { status: 404 });
    },
    env: { JOURNEYS_API_URL: "https://api.mock", JOURNEYS_INSTALL_KEY: "sjk_test_dddddddddddddddddddddddddddddddd" },
    now: () => (t += 1),
    sleep: async () => undefined,
    random: (bytes) => Uint8Array.from({ length: bytes }, (_, i) => (i + 7 + drawn++) & 255),
  };
}

// The probe read's facts are booleans (journey_probe_find): present or not.
const good = { address_hash: true, "client.asn": true, "client.ja4": false, user_agent: true, route: true, "observer.policy_version": true };

test("every host fronted and reporting: exit 0, the facts per host, JA4 absent is optional, the claim is the next step", async () => {
  const world: World = { fronted: { "docs.acme.example": true, "api.acme.example": true }, arrives: { "docs.acme.example": 2, "api.acme.example": 1 }, facts: { "docs.acme.example": good, "api.acme.example": good }, apiMissing: [], install: { form: "cloudflare", hosts: ["docs.acme.example", "api.acme.example"], package: { name: "scope-journeys-cloudflare", version: VERSION, adapter: "cloudflare" } }, probes: [], polls: 0 };
  const report = await doctor({ cwd: mkdtempSync(join(tmpdir(), "journeys-doctor-")), url: null, install: INSTALL_ID, token: null, apiUrl: null, timeoutSeconds: 60 }, deps(world));
  assert.equal(report.exit_code, 0, JSON.stringify(report));
  assert.equal(report.hosts.length, 2);
  assert.ok(world.probes[0]?.startsWith(`docs.acme.example?journeys_probe=`));
  assert.match(world.probes[0] ?? "", /journeys_probe=[A-Za-z0-9_-]{16}$/);
  assert.notEqual(world.probes[0]?.split("=")[1], world.probes[1]?.split("=")[1], "one nonce per host");
  assert.deepEqual(report.hosts.map((h) => [h.fronted, h.found]), [[true, true], [true, true]]);
  assert.deepEqual(report.hosts[0]?.missing, [{ fact: "client.ja4", fix: "Bot Management is not enabled on this zone; JA4 is optional" }]);
  assert.equal(typeof report.hosts[0]?.round_trip_ms, "number");
  assert.deepEqual(report.sensor, { package: "scope-journeys-cloudflare", version: VERSION, adapter: "cloudflare", policy_version: 3, salt_epoch: 1, state: "unclaimed" });
  assert.deepEqual(report.missing, []);
  assert.match(report.next_step, /open the claim URL/);
  const lines = renderDoctorReport(report);
  assert.equal(lines[0], `install     ${INSTALL_ID} (cloudflare)`);
  assert.match(lines[1] ?? "", /^sensor {6}scope-journeys-cloudflare@.* \(cloudflare\), policy 3, salt epoch 1, unclaimed$/);
  assert.ok(lines.some((l) => /^ {2}client\.ja4 +absent$/.test(l)), lines.join("\n"));
  assert.ok(lines.some((l) => /^ {2}observer\.policy_version +present$/.test(l)), lines.join("\n"));
});

test("the docs host not fronted comes first, before the ingest's policy_version fix, and the exit is 1", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "journeys-doctor-"));
  mkdirSync(join(cwd, ".journeys"));
  writeFileSync(join(cwd, ".journeys", "init.lock"), JSON.stringify({ idempotency_key: "k", created_at: "", form: "next", install_id: INSTALL_ID, docs_host: "docs.acme.example", proxy_file: "proxy.ts", proxy_created: true, proxy_previous: null, instrumentation_created: true, instrumentation_added_export: false, dependency: null }));
  writeFileSync(join(cwd, ".env.local"), `JOURNEYS_INSTALL_ID=${INSTALL_ID}\nJOURNEYS_INSTALL_KEY=sjk_test_dddddddddddddddddddddddddddddddd\n`);
  const apiMissing = [
    { fact: "client.asn", fix: "the platform does not pass x-vercel-ip-as-number on this plan; the address hash still joins" },
    { fact: "observer.policy_version", fix: "the sensor is on the embedded default; check JOURNEYS_API_URL and the key" },
  ];
  const world: World = { fronted: { "acme.example": true, "docs.acme.example": false }, arrives: { "acme.example": 1 }, facts: { "acme.example": { ...good, "observer.policy_version": false, "client.asn": false } }, apiMissing, install: { form: "next", hosts: ["acme.example", "docs.acme.example"] }, probes: [], polls: 0 };
  const report = await doctor({ cwd, url: null, install: null, token: null, apiUrl: null, timeoutSeconds: 60 }, deps(world));
  assert.equal(report.install_id, INSTALL_ID, "the id is read from .env.local");
  assert.equal(report.exit_code, 1);
  assert.deepEqual(report.hosts.map((h) => h.host), ["docs.acme.example", "acme.example"], "the host carrying the docs-host fix leads");
  const docs = report.hosts[0];
  assert.deepEqual(docs?.missing.map((m) => m.fact), ["docs_host", "fronted"]);
  assert.equal(docs?.missing[0]?.fix, fixFor("docs_host", "next", "docs.acme.example"));
  assert.match(docs?.missing[0]?.fix ?? "", /^no documentation host is fronted: add docs\.acme\.example to the install \(journeys init --docs-host docs\.acme\.example\)/);
  assert.equal(docs?.missing[1]?.fix, "the proxy file does not run for docs.acme.example; check config.matcher and JOURNEYS_HOST");
  const product = report.hosts[1];
  assert.deepEqual(product?.missing.map((m) => m.fact), ["client.ja4", "client.asn", "observer.policy_version"]);
  assert.equal(product?.missing[0]?.fix, "the project is not on a plan that sends x-vercel-ja4-digest; optional");
  assert.equal(product?.missing[1]?.fix, apiMissing[0]?.fix, "the ingest's wording is printed as it came");
  assert.equal(product?.missing[2]?.fix, apiMissing[1]?.fix);
  assert.match(report.next_step, /^docs\.acme\.example: no documentation host is fronted/);
  assert.equal(renderDoctorReport(report).at(-1), `next        ${report.next_step}`);
});

test("--url probes one host; a probe that never arrives names the request fix; the API down exits 5", async () => {
  const world: World = { fronted: { "acme.example": true }, arrives: {}, facts: {}, apiMissing: [], install: { form: "next", hosts: ["acme.example"] }, probes: [], polls: 0 };
  const report = await doctor({ cwd: mkdtempSync(join(tmpdir(), "journeys-doctor-")), url: "https://acme.example/docs", install: INSTALL_ID, token: "tok", apiUrl: null, timeoutSeconds: 4 }, deps(world));
  assert.equal(report.exit_code, 1);
  assert.deepEqual(report.hosts.map((h) => h.host), ["acme.example"]);
  assert.deepEqual(report.hosts[0]?.missing.map((m) => m.fact), ["request"]);
  assert.match(report.hosts[0]?.missing[0]?.fix ?? "", /^no request carrying the probe's nonce reached the ingest within 4 s/);
  assert.ok(world.polls >= 2, "polled every two seconds until the timeout");
  assert.match(report.next_step, /^acme\.example: no request carrying the probe's nonce/);
  const down = await doctor({ cwd: mkdtempSync(join(tmpdir(), "journeys-doctor-")), url: null, install: INSTALL_ID, token: null, apiUrl: null, timeoutSeconds: 4 }, deps({ ...world, apiDown: true, probes: [], polls: 0 }));
  assert.equal(down.exit_code, 5);
  assert.match(down.next_step, /^the install could not be read \(https:\/\/api\.mock is unreachable \(fetch failed\)\): check the credential/);
  assert.equal(down.sensor, null);
});

test("a sensor without a salt answers the probe no-salt: fronted, never polled for, the salt fix named, exit 1", async () => {
  const world: World = { fronted: { "acme.example": true }, unsalted: { "acme.example": true }, arrives: { "acme.example": 1 }, facts: { "acme.example": good }, apiMissing: [], install: { form: "next", hosts: ["acme.example"] }, probes: [], polls: 0 };
  const report = await doctor({ cwd: mkdtempSync(join(tmpdir(), "journeys-doctor-")), url: null, install: INSTALL_ID, token: null, apiUrl: null, timeoutSeconds: 60 }, deps(world));
  assert.equal(report.exit_code, 1);
  assert.deepEqual(report.hosts.map((h) => [h.fronted, h.found]), [[true, false]]);
  assert.deepEqual(report.hosts[0]?.missing, [{ fact: "salt", fix: fixFor("salt", "next", "acme.example") }]);
  assert.match(fixFor("salt", "next", "acme.example"), /JOURNEYS_SALT/);
  assert.equal(world.polls, 0, "a sensor that records nothing is not waited for");
  assert.equal(report.next_step, `acme.example: ${fixFor("salt", "next", "acme.example")}`);
});

test("a docs host without a salt is named for its salt, not as unfronted, and is not shown as a probe not found", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "journeys-doctor-"));
  mkdirSync(join(cwd, ".journeys"));
  writeFileSync(join(cwd, ".journeys", "init.lock"), JSON.stringify({ idempotency_key: "k", created_at: "", form: "next", install_id: INSTALL_ID, docs_host: "docs.acme.example", proxy_file: "proxy.ts", proxy_created: true, proxy_previous: null, instrumentation_created: true, instrumentation_added_export: false, dependency: null }));
  const world: World = { fronted: { "docs.acme.example": true }, unsalted: { "docs.acme.example": true }, arrives: {}, facts: {}, apiMissing: [], install: { form: "next", hosts: ["docs.acme.example"] }, probes: [], polls: 0 };
  const report = await doctor({ cwd, url: null, install: INSTALL_ID, token: null, apiUrl: null, timeoutSeconds: 60 }, deps(world));
  assert.deepEqual(report.hosts[0]?.missing.map((m) => m.fact), ["salt"]);
  assert.ok(renderDoctorReport(report).includes("host        docs.acme.example: fronted, records nothing (no salt)"), renderDoctorReport(report).join("\n"));
});

test("an older sensor than the CLI is an install-level fix that does not fail the doctor", async () => {
  const world: World = { fronted: { "acme.example": true }, arrives: { "acme.example": 1 }, facts: { "acme.example": { ...good, "client.ja4": true } }, apiMissing: [], install: { form: "next", hosts: ["acme.example"], package: { name: "scope-journeys-next", version: "0.0.1", adapter: "next" }, state: "live" }, probes: [], polls: 0 };
  const report = await doctor({ cwd: mkdtempSync(join(tmpdir(), "journeys-doctor-")), url: null, install: INSTALL_ID, token: null, apiUrl: null, timeoutSeconds: 60 }, deps(world));
  assert.equal(report.exit_code, 0);
  assert.deepEqual(report.hosts[0]?.missing, []);
  assert.deepEqual(report.missing, [{ fact: "observer.version", fix: "a newer sensor exists; npm update and redeploy" }]);
  assert.equal(report.next_step, "a newer sensor exists; npm update and redeploy");
  assert.ok(renderDoctorReport(report).includes("fix         a newer sensor exists; npm update and redeploy"));
});

test("no install id anywhere exits 5 and says where to get one", async () => {
  const report = await doctor({ cwd: mkdtempSync(join(tmpdir(), "journeys-doctor-")), url: null, install: null, token: null, apiUrl: null, timeoutSeconds: 1 }, { ...deps({ fronted: {}, arrives: {}, facts: {}, apiMissing: [], install: { form: "next", hosts: [] }, probes: [], polls: 0 }), env: {} });
  assert.equal(report.exit_code, 5);
  assert.match(report.next_step, /--install jin_/);
});
