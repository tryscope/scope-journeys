// The settings loader every adapter shares: the document is fetched over https only, checked against
// the schema before it is compiled (a newer sensor's rule kinds and fields are tolerated), held per
// url, and a missing url always means the embedded default.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { loadPolicy, resetPolicyCache } from "../src/policy-loader.js";

const POLICY = JSON.parse(readFileSync(new URL("../../../fixtures/synthetic/policy.json", import.meta.url), "utf8")) as Record<string, unknown>;
const URL_A = "https://api.example/v1/installs/jin_a/policy";

function serving(...answers: Array<Record<string, unknown>>): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const next = answers.shift();
    if (!next) throw new Error("network down");
    const { epoch, environment, ...document } = next;
    return Response.json(document, { headers: { ...(typeof epoch === "string" ? { "x-journeys-salt-epoch": epoch } : {}), ...(typeof environment === "string" ? { "x-journeys-environment": environment } : {}) } });
  }) as typeof fetch;
  return { fetch: fetcher, calls };
}

test("a settings url that is not https is refused before any fetch; plain http to the loopback stays allowed for local runs", async () => {
  resetPolicyCache();
  const plain = serving(POLICY);
  const log: string[] = [];
  const refused = await loadPolicy({ url: "http://user:pass@api.example/v1/installs/jin_a/policy?token=abc", credential: "k", fetch: plain.fetch, now: 0, cache: null, log: (l) => log.push(l) });
  assert.deepEqual(plain.calls, [], "nothing is fetched from a plain-http address");
  assert.equal(refused.policy.version, 0, "the embedded default runs");
  assert.deepEqual(log, ["journeys: the policy url must be https (http only to the loopback) with no credentials in it; ignoring http://api.example"], "said with the scheme and host only, never the credentials or the query");
  const withCredentials = await loadPolicy({ url: "https://user:s3cret@api.example/v1/installs/jin_a/policy", credential: "k", fetch: plain.fetch, now: 0, cache: null, log: (l) => log.push(l) });
  assert.equal(withCredentials.policy.version, 0, "an address carrying credentials is refused too");
  assert.equal(log.at(-1), "journeys: the policy url must be https (http only to the loopback) with no credentials in it; ignoring https://api.example");
  assert.deepEqual(plain.calls, []);
  const local = serving(POLICY);
  const loopback = await loadPolicy({ url: "http://127.0.0.1:8787/v1/installs/jin_a/policy", credential: "k", fetch: local.fetch, now: 0, cache: null, log: () => undefined });
  assert.equal(loopback.policy.version, 3);
});

test("no settings url means the embedded default, even while another url's settings are held", async () => {
  resetPolicyCache();
  const held = await loadPolicy({ url: URL_A, credential: "k", fetch: serving(POLICY).fetch, now: 0, cache: null, log: () => undefined });
  assert.equal(held.policy.version, 3);
  const none = await loadPolicy({ url: null, credential: null, fetch: serving().fetch, now: 1_000, cache: null, log: () => undefined });
  assert.equal(none.policy.version, 0, "a sensor with no salt runs the forward-only default, not the fetched settings");
  assert.deepEqual(none.policy.rules, []);
});

test("without a credential nothing is fetched: the policy route answers only an install or a session, so the embedded default runs", async () => {
  resetPolicyCache();
  const answers = serving(POLICY);
  const keyless = await loadPolicy({ url: URL_A, credential: null, fetch: answers.fetch, now: 0, cache: null, log: () => undefined });
  assert.deepEqual(answers.calls, []);
  assert.equal(keyless.policy.version, 0);
  assert.equal((await loadPolicy({ url: URL_A, credential: "k", fetch: answers.fetch, now: 1_000, cache: null, log: () => undefined })).policy.version, 3, "the key, once set, fetches at once");
});

test("the settings fetch follows no redirect: a redirect keeps the settings held", async () => {
  resetPolicyCache();
  const inits: Array<RequestInit | undefined> = [];
  const redirecting = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    inits.push(init);
    return new Response(null, { status: 307, headers: { location: "https://other.example/policy" } });
  }) as typeof fetch;
  const log: string[] = [];
  const state = await loadPolicy({ url: URL_A, credential: "k", fetch: redirecting, now: 0, cache: null, log: (l) => log.push(l) });
  assert.equal(state.policy.version, 0);
  assert.deepEqual(inits.map((i) => i?.redirect), ["manual"]);
  assert.deepEqual(log, ["journeys: policy fetch answered 307; keeping the embedded default"]);
});

test("an empty credential is no credential", async () => {
  resetPolicyCache();
  const answers = serving(POLICY);
  assert.equal((await loadPolicy({ url: URL_A, credential: "", fetch: answers.fetch, now: 0, cache: null, log: () => undefined })).policy.version, 0);
  assert.deepEqual(answers.calls, []);
});

test("the salt epoch is a positive whole number or the last one seen", async () => {
  resetPolicyCache();
  const answers = serving({ ...POLICY, epoch: "4" }, { ...POLICY, epoch: "-1" }, { ...POLICY, epoch: "1.5" }, { ...POLICY, epoch: "7" });
  const epochAt = async (now: number) => (await loadPolicy({ url: URL_A, credential: "k", fetch: answers.fetch, now, cache: null, log: () => undefined })).saltEpoch;
  assert.equal(await epochAt(0), 4);
  assert.equal(await epochAt(61_000), 4, "a negative epoch is not one");
  assert.equal(await epochAt(122_000), 4, "a fraction is not one");
  assert.equal(await epochAt(183_000), 7);
});

test("the environment is production, preview or development, or the last one seen", async () => {
  resetPolicyCache();
  const answers = serving({ ...POLICY, environment: "preview" }, { ...POLICY, environment: "staging" }, { ...POLICY, environment: "Production" }, { ...POLICY, environment: "development" });
  const environmentAt = async (now: number) => (await loadPolicy({ url: URL_A, credential: "k", fetch: answers.fetch, now, cache: null, log: () => undefined })).environment;
  assert.equal(await environmentAt(0), "preview");
  assert.equal(await environmentAt(61_000), "preview", "an environment the sensor does not know is not one");
  assert.equal(await environmentAt(122_000), "preview", "the names are lower case");
  assert.equal(await environmentAt(183_000), "development");
});

test("a value of the wrong type where the sensor reads it keeps the last good settings; what a newer schema adds, a missing section and a field the sensor ignores are accepted", async () => {
  resetPolicyCache();
  const wrongType = { ...POLICY, version: 4, headers: { ...(POLICY.headers as object), setup: 7 } };
  const ignored = { ...POLICY, version: 5, origin: 7, report: null, about: null, retention_days: "90", headers: { ...(POLICY.headers as object), session: null }, rules: [...(POLICY.rules as unknown[]), { id: "next", kind: "redirect", route: ["/a"], faces: 5 }] };
  const newer = { ...POLICY, version: 6, surfaces: { ...(POLICY.surfaces as object), credentials: { path: "^/settings/keys$", fields: {}, since: "2027-01" } }, rules: [...(POLICY.rules as Array<Record<string, unknown>>).map((r) => ({ ...r, environments: ["production", "staging"] })), { id: "banner", kind: "banner", copy: "Try the new API" }], forward: { ...(POLICY.forward as object), retries: 2 } };
  const older: Record<string, unknown> = { ...POLICY, version: 7 };
  delete older.forward;
  const notADoor = { ...POLICY, version: 8, surfaces: { ...(POLICY.surfaces as object), credentials: 5 } };
  const answers = serving(POLICY, wrongType, ignored, newer, older, notADoor);
  const log: string[] = [];
  const load = (now: number) => loadPolicy({ url: URL_A, credential: "k", fetch: answers.fetch, now, cache: null, log: (l) => log.push(l) });
  assert.equal((await load(0)).policy.version, 3);
  assert.equal((await load(61_000)).policy.version, 3, "a wrong type keeps version 3");
  assert.match(log.at(-1) ?? "", /refused .*\/headers\/setup.*keeping the last good policy/);
  assert.equal((await load(122_000)).policy.version, 5, "a wrong type in a field the sensor ignores or a rule kind it does not know, or a null it fills, does not refuse the document");
  const accepted = await load(183_000);
  assert.equal(accepted.policy.version, 6, "an unknown rule kind, environment and field do not refuse the document");
  assert.equal(accepted.policy.rules.at(-1)?.kind, "unknown");
  assert.equal((await load(244_000)).policy.version, 7, "an older document without forward is accepted with the default");
  assert.equal((await load(305_000)).policy.version, 7, "a value that fits none of a field's shapes is a wrong type; a door with a newer field (version 6) is not");
  assert.match(log.at(-1) ?? "", /refused .*\/surfaces\/credentials/);
});

test("a pattern that does not compile is refused like a wrong type, and said so", async () => {
  resetPolicyCache();
  const log: string[] = [];
  const answers = serving(POLICY, { ...POLICY, version: 8, secrets: { ...(POLICY.secrets as object), shapes: ["("] } });
  assert.equal((await loadPolicy({ url: URL_A, credential: "k", fetch: answers.fetch, now: 0, cache: null, log: (l) => log.push(l) })).policy.version, 3);
  assert.equal((await loadPolicy({ url: URL_A, credential: "k", fetch: answers.fetch, now: 61_000, cache: null, log: (l) => log.push(l) })).policy.version, 3);
  assert.match(log.at(-1) ?? "", /^journeys: policy refused \(.*\); keeping the last good policy$/);
});

test("a stored copy is checked like a fetched one; one that is refused or not in the stored shape is skipped for a fetch", async () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["a refused document", { document: { ...POLICY, version: 9, headers: { setup: 7 } }, etag: '"9"', environment: null, saltEpoch: null }],
    ["an etag that is not a string", { document: { ...POLICY, version: 9 }, etag: 9, environment: null, saltEpoch: null }],
    ["an epoch that is not a whole number", { document: { ...POLICY, version: 9 }, etag: '"9"', environment: null, saltEpoch: "4" }],
    ["an environment the sensor does not know", { document: { ...POLICY, version: 9 }, etag: '"9"', environment: "staging", saltEpoch: null }],
  ];
  for (const [what, entry] of cases) {
    resetPolicyCache();
    const cache = { get: async () => JSON.stringify(entry), put: async () => undefined };
    const answers = serving(POLICY);
    const warm = await loadPolicy({ url: URL_A, credential: "k", fetch: answers.fetch, now: 0, cache, log: () => undefined });
    assert.equal(warm.policy.version, 3, what);
    assert.deepEqual(answers.calls, [URL_A], what);
  }
  resetPolicyCache();
  const good = { get: async () => JSON.stringify({ document: { ...POLICY, version: 9 }, etag: '"9"', environment: "production", saltEpoch: 2 }), put: async () => undefined };
  const answers = serving();
  const warm = await loadPolicy({ url: URL_A, credential: "k", fetch: answers.fetch, now: 0, cache: good, log: () => undefined });
  assert.deepEqual([warm.policy.version, warm.etag, warm.environment, warm.saltEpoch, answers.calls.length], [9, '"9"', "production", 2, 0], "a good stored copy starts warm without a fetch");
});

test("an answer the loader does not use has its body released, so the connection is not held", async () => {
  resetPolicyCache();
  const released: number[] = [];
  const answers = [401, 500, 302].map((status) => new Response(new ReadableStream({ pull: () => undefined, cancel: () => void released.push(status) }), { status }));
  const fetcher = (async () => answers.shift() ?? Promise.reject(new Error("network down"))) as typeof fetch;
  for (const now of [0, 61_000, 122_000]) assert.equal((await loadPolicy({ url: URL_A, credential: "k", fetch: fetcher, now, cache: null, log: () => undefined })).policy.version, 0);
  assert.deepEqual(released, [401, 500, 302]);
  resetPolicyCache();
  const lines: string[] = [];
  const stuck = (async () => new Response(new ReadableStream({ pull: () => undefined, cancel: () => Promise.reject(new Error("socket already closed")) }), { status: 503 })) as typeof fetch;
  await loadPolicy({ url: URL_A, credential: "k", fetch: stuck, now: 0, cache: null, log: (line) => void lines.push(line) });
  assert.deepEqual(lines, ["journeys: policy fetch answered 503; keeping the embedded default"], "a body that cannot be released does not hide the answer's status");
});

test("the embedded default carries the reason it runs, so its records can name it; held or fetched settings carry none", async () => {
  const quiet = { cache: null, log: () => undefined };
  const answering = (status: number): typeof fetch => (async () => new Response("down", { status })) as typeof fetch;
  resetPolicyCache();
  assert.equal((await loadPolicy({ url: null, credential: "k", fetch: serving().fetch, now: 0, ...quiet })).policy.fallback, "no settings address");
  assert.equal((await loadPolicy({ url: URL_A, credential: null, fetch: serving().fetch, now: 0, ...quiet })).policy.fallback, "no install key", "each reason is its own, never another configuration's held one");
  resetPolicyCache();
  assert.equal((await loadPolicy({ url: "http://api.example/v1/installs/jin_a/policy", credential: "k", fetch: serving().fetch, now: 0, ...quiet })).policy.fallback, "settings address refused");
  resetPolicyCache();
  assert.equal((await loadPolicy({ url: URL_A, credential: "k", fetch: serving().fetch, now: 0, ...quiet })).policy.fallback, "fetch failed (Error)");
  resetPolicyCache();
  assert.equal((await loadPolicy({ url: URL_A, credential: "k", fetch: answering(503), now: 0, ...quiet })).policy.fallback, "answered 503");
  assert.equal((await loadPolicy({ url: URL_A, credential: "k", fetch: serving({ schema: "scope.policy/2" }).fetch, now: 61_000, ...quiet })).policy.fallback, "settings refused", "a later failure names its own reason");
  resetPolicyCache();
  const fetched = await loadPolicy({ url: URL_A, credential: "k", fetch: serving(POLICY).fetch, now: 0, ...quiet });
  assert.equal(fetched.policy.fallback, undefined);
  const held = await loadPolicy({ url: URL_A, credential: "k", fetch: answering(503), now: 61_000, ...quiet });
  assert.equal(held.policy.version, 3, "a failure keeps the last good settings");
  assert.equal(held.policy.fallback, undefined, "and they are not the default");
});
