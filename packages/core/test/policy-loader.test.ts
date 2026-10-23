// The settings loader every adapter shares: the document is fetched over https only, used only when
// Scope's signature over it holds, checked against the schema before it is compiled (a newer sensor's
// rule kinds and fields are tolerated), held per install and url, and a missing url always means the embedded default.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { loadPolicy, resetPolicyCache, trustPolicyKeyForTests } from "../src/policy-loader.js";
import { policySignature, signedNotModified, signedPolicy, TEST_POLICY_KID, testPolicyKeys } from "./signed.js";

const POLICY = JSON.parse(readFileSync(new URL("../../../fixtures/synthetic/policy.json", import.meta.url), "utf8")) as Record<string, unknown>;
const INSTALL = "jin_a";
const URL_A = `https://api.example/v1/installs/${INSTALL}/policy`;
trustPolicyKeyForTests(TEST_POLICY_KID, (await testPolicyKeys()).publicKey);

/** Answers signed for INSTALL at 1 (unix seconds, within the hour of a clock at 0); `epoch` and `environment` set the signed headers. */
function serving(...answers: Array<Record<string, unknown>>): { fetch: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    const next = answers.shift();
    if (!next) throw new Error("network down");
    const { epoch, environment, ...document } = next;
    return signedPolicy(document, { install: INSTALL, issuedAt: 1, ...(typeof epoch === "string" ? { saltEpoch: epoch } : {}), ...(typeof environment === "string" ? { environment } : {}) });
  }) as typeof fetch;
  return { fetch: fetcher, calls };
}

test("a settings url that is not https is refused before any fetch; plain http to the loopback stays allowed for local runs", async () => {
  resetPolicyCache();
  const plain = serving(POLICY);
  const log: string[] = [];
  const refused = await loadPolicy({ installId: INSTALL, url: "http://user:pass@api.example/v1/installs/jin_a/policy?token=abc", credential: "k", fetch: plain.fetch, now: 0, cache: null, log: (l) => log.push(l) });
  assert.deepEqual(plain.calls, [], "nothing is fetched from a plain-http address");
  assert.equal(refused.policy.version, 0, "the embedded default runs");
  assert.deepEqual(log, ["journeys: the policy url must be https (http only to the loopback) with no credentials in it; ignoring http://api.example"], "said with the scheme and host only, never the credentials or the query");
  const withCredentials = await loadPolicy({ installId: INSTALL, url: "https://user:s3cret@api.example/v1/installs/jin_a/policy", credential: "k", fetch: plain.fetch, now: 0, cache: null, log: (l) => log.push(l) });
  assert.equal(withCredentials.policy.version, 0, "an address carrying credentials is refused too");
  assert.equal(log.at(-1), "journeys: the policy url must be https (http only to the loopback) with no credentials in it; ignoring https://api.example");
  assert.deepEqual(plain.calls, []);
  const local = serving(POLICY);
  const loopback = await loadPolicy({ installId: INSTALL, url: "http://127.0.0.1:8787/v1/installs/jin_a/policy", credential: "k", fetch: local.fetch, now: 0, cache: null, log: () => undefined });
  assert.equal(loopback.policy.version, 3);
});

test("no settings url means the embedded default, even while another url's settings are held", async () => {
  resetPolicyCache();
  const held = await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: serving(POLICY).fetch, now: 0, cache: null, log: () => undefined });
  assert.equal(held.policy.version, 3);
  const none = await loadPolicy({ installId: INSTALL, url: null, credential: null, fetch: serving().fetch, now: 1_000, cache: null, log: () => undefined });
  assert.equal(none.policy.version, 0, "a sensor with no salt runs the forward-only default, not the fetched settings");
  assert.deepEqual(none.policy.rules, []);
});

test("without a credential nothing is fetched: the policy route answers only an install or a session, so the embedded default runs", async () => {
  resetPolicyCache();
  const answers = serving(POLICY);
  const keyless = await loadPolicy({ installId: INSTALL, url: URL_A, credential: null, fetch: answers.fetch, now: 0, cache: null, log: () => undefined });
  assert.deepEqual(answers.calls, []);
  assert.equal(keyless.policy.version, 0);
  assert.equal((await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: answers.fetch, now: 1_000, cache: null, log: () => undefined })).policy.version, 3, "the key, once set, fetches at once");
});

test("the settings fetch follows no redirect: a redirect keeps the settings held", async () => {
  resetPolicyCache();
  const inits: Array<RequestInit | undefined> = [];
  const redirecting = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    inits.push(init);
    return new Response(null, { status: 307, headers: { location: "https://other.example/policy" } });
  }) as typeof fetch;
  const log: string[] = [];
  const state = await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: redirecting, now: 0, cache: null, log: (l) => log.push(l) });
  assert.equal(state.policy.version, 0);
  assert.deepEqual(inits.map((i) => i?.redirect), ["manual"]);
  assert.deepEqual(log, ["journeys: policy fetch answered 307; keeping the embedded default"]);
});

test("an empty credential is no credential", async () => {
  resetPolicyCache();
  const answers = serving(POLICY);
  assert.equal((await loadPolicy({ installId: INSTALL, url: URL_A, credential: "", fetch: answers.fetch, now: 0, cache: null, log: () => undefined })).policy.version, 0);
  assert.deepEqual(answers.calls, []);
});

test("a signed answer whose salt epoch is not a positive whole number is refused, so the last good policy and its epoch run on", async () => {
  resetPolicyCache();
  const answers = serving({ ...POLICY, epoch: "4" }, { ...POLICY, version: 5, epoch: "-1" }, { ...POLICY, version: 6, epoch: "1.5" }, { ...POLICY, version: 7, epoch: "7" });
  const log: string[] = [];
  const at = async (now: number) => {
    const state = await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: answers.fetch, now, cache: null, log: (l) => log.push(l) });
    return [state.policy.version, state.saltEpoch];
  };
  assert.deepEqual(await at(0), [3, 4]);
  assert.deepEqual(await at(61_000), [3, 4], "a negative epoch is not one");
  assert.match(log.at(-1) ?? "", /salt epoch "-1" is not a positive whole number\); keeping the last good policy$/);
  assert.deepEqual(await at(122_000), [3, 4], "a fraction is not one");
  assert.deepEqual(await at(183_000), [7, 7]);
});

test("a signed answer whose environment is not production, preview or development is refused, so the last good policy and its environment run on", async () => {
  resetPolicyCache();
  const answers = serving({ ...POLICY, environment: "preview" }, { ...POLICY, version: 5, environment: "staging" }, { ...POLICY, version: 6, environment: "Production" }, { ...POLICY, version: 7, environment: "development" });
  const at = async (now: number) => {
    const state = await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: answers.fetch, now, cache: null, log: () => undefined });
    return [state.policy.version, state.environment];
  };
  assert.deepEqual(await at(0), [3, "preview"]);
  assert.deepEqual(await at(61_000), [3, "preview"], "an environment the sensor does not know is not one");
  assert.deepEqual(await at(122_000), [3, "preview"], "the names are lower case");
  assert.deepEqual(await at(183_000), [7, "development"]);
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
  const load = (now: number) => loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: answers.fetch, now, cache: null, log: (l) => log.push(l) });
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
  assert.equal((await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: answers.fetch, now: 0, cache: null, log: (l) => log.push(l) })).policy.version, 3);
  assert.equal((await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: answers.fetch, now: 61_000, cache: null, log: (l) => log.push(l) })).policy.version, 3);
  assert.match(log.at(-1) ?? "", /^journeys: policy refused \(.*\); keeping the last good policy$/);
});

test("a stored copy is checked again like a fetched one, but for the clock; one that is changed, unsigned or in an older shape is skipped for a fetch", async () => {
  const body = JSON.stringify({ ...POLICY, version: 9 });
  const signature = await policySignature(INSTALL, "production", "2", 1, body);
  const good = { body, signature, environment: "production", saltEpoch: "2", etag: '"9"' };
  const cases: Array<[string, Record<string, unknown>]> = [
    ["a changed body", { ...good, body: body.replace('"version":9', '"version":10') }],
    ["a changed epoch", { ...good, saltEpoch: "3" }],
    ["no signature", { ...good, signature: null }],
    ["the shape stored before signatures were checked", { document: { ...POLICY, version: 9 }, etag: '"9"', environment: "production", saltEpoch: 2 }],
  ];
  for (const [what, entry] of cases) {
    resetPolicyCache();
    const cache = { get: async () => JSON.stringify(entry), put: async () => undefined };
    const answers = serving(POLICY);
    const warm = await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: answers.fetch, now: 0, cache, log: () => undefined });
    assert.equal(warm.policy.version, 3, what);
    assert.deepEqual(answers.calls, [URL_A], what);
  }
  resetPolicyCache();
  const answers = serving();
  // Days after it was signed: the hour applies to a fresh answer, not to the copy a new instance starts from.
  const warm = await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: answers.fetch, now: 5 * 86_400_000, cache: { get: async () => JSON.stringify(good), put: async () => undefined }, log: () => undefined });
  assert.deepEqual([warm.policy.version, warm.signed?.etag, warm.environment, warm.saltEpoch, answers.calls.length], [9, '"9"', "production", 2, 0], "a good stored copy starts warm without a fetch");
});

test("an answer the loader does not use has its body released, so the connection is not held", async () => {
  resetPolicyCache();
  const released: number[] = [];
  const answers = [401, 500, 302].map((status) => new Response(new ReadableStream({ pull: () => undefined, cancel: () => void released.push(status) }), { status }));
  const fetcher = (async () => answers.shift() ?? Promise.reject(new Error("network down"))) as typeof fetch;
  for (const now of [0, 61_000, 122_000]) assert.equal((await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: fetcher, now, cache: null, log: () => undefined })).policy.version, 0);
  assert.deepEqual(released, [401, 500, 302]);
  resetPolicyCache();
  const lines: string[] = [];
  const stuck = (async () => new Response(new ReadableStream({ pull: () => undefined, cancel: () => Promise.reject(new Error("socket already closed")) }), { status: 503 })) as typeof fetch;
  await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: stuck, now: 0, cache: null, log: (line) => void lines.push(line) });
  assert.deepEqual(lines, ["journeys: policy fetch answered 503; keeping the embedded default"], "a body that cannot be released does not hide the answer's status");
});

test("the embedded default carries the reason it runs, so its records can name it; held or fetched settings carry none", async () => {
  const quiet = { cache: null, log: () => undefined };
  const answering = (status: number): typeof fetch => (async () => new Response("down", { status })) as typeof fetch;
  resetPolicyCache();
  assert.equal((await loadPolicy({ installId: INSTALL, url: null, credential: "k", fetch: serving().fetch, now: 0, ...quiet })).policy.fallback, "no settings address");
  assert.equal((await loadPolicy({ installId: INSTALL, url: URL_A, credential: null, fetch: serving().fetch, now: 0, ...quiet })).policy.fallback, "no install key", "each reason is its own, never another configuration's held one");
  resetPolicyCache();
  assert.equal((await loadPolicy({ installId: INSTALL, url: "http://api.example/v1/installs/jin_a/policy", credential: "k", fetch: serving().fetch, now: 0, ...quiet })).policy.fallback, "settings address refused");
  assert.equal((await loadPolicy({ installId: null, url: URL_A, credential: "k", fetch: serving().fetch, now: 0, ...quiet })).policy.fallback, "no install id");
  resetPolicyCache();
  assert.equal((await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: serving().fetch, now: 0, ...quiet })).policy.fallback, "fetch failed (Error)");
  resetPolicyCache();
  assert.equal((await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: answering(503), now: 0, ...quiet })).policy.fallback, "answered 503");
  assert.equal((await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: serving({ schema: "scope.policy/2" }).fetch, now: 61_000, ...quiet })).policy.fallback, "settings refused", "a later failure names its own reason");
  resetPolicyCache();
  const fetched = await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: serving(POLICY).fetch, now: 0, ...quiet });
  assert.equal(fetched.policy.fallback, undefined);
  const held = await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: answering(503), now: 61_000, ...quiet });
  assert.equal(held.policy.version, 3, "a failure keeps the last good settings");
  assert.equal(held.policy.fallback, undefined, "and they are not the default");
});

test("a load that fails while a concurrent one took a signed policy keeps that policy and says so", async () => {
  resetPolicyCache();
  let release: () => void = () => undefined;
  let started: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const fetching = new Promise<void>((resolve) => (started = resolve));
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    if (calls === 1) {
      started();
      await gate;
      throw new TypeError("fetch failed");
    }
    return signedPolicy(POLICY, { install: INSTALL, issuedAt: 1 });
  }) as typeof fetch;
  const log: string[] = [];
  const load = () => loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: fetcher, now: 0, cache: null, log: (l) => log.push(l) });
  const failing = load();
  await fetching;
  assert.equal((await load()).policy.version, 3);
  release();
  const kept = await failing;
  assert.deepEqual([kept.policy.version, kept.policy.fallback], [3, undefined]);
  assert.deepEqual(log, ["journeys: policy fetch failed (fetch failed); keeping the last good policy"]);
});

test("an answer the sensor cannot check keeps the last good policy: unsigned, another install's, a changed body or header, an unknown key, a signature out of form", async () => {
  const v4 = JSON.stringify({ ...POLICY, version: 4 });
  const signed = (install: string, environment = "production", epoch = "1", body = v4, kid?: string) => policySignature(install, environment, epoch, 1, body, kid);
  const headers = (signature: string | null, environment = "production", epoch = "1"): Record<string, string> => ({ "x-journeys-environment": environment, "x-journeys-salt-epoch": epoch, ...(signature === null ? {} : { "x-journeys-signature": signature }) });
  const good = await signed(INSTALL);
  const cases: Array<[string, Response, RegExp]> = [
    ["no signature", new Response(v4, { headers: headers(null) }), /the answer is not signed/],
    ["another install's answer", new Response(v4, { headers: headers(await signed("jin_b")) }), /the signature does not hold/],
    ["a body changed after signing", new Response(v4.replace('"version":4', '"version":5'), { headers: headers(good) }), /the signature does not hold/],
    ["an environment changed after signing", new Response(v4, { headers: headers(good, "preview") }), /the signature does not hold/],
    ["an epoch changed after signing", new Response(v4, { headers: headers(good, "production", "2") }), /the signature does not hold/],
    ["no environment header", new Response(v4, { headers: { "x-journeys-salt-epoch": "1", "x-journeys-signature": good } }), /lacks the environment or salt epoch/],
    ["no epoch header", new Response(v4, { headers: { "x-journeys-environment": "production", "x-journeys-signature": good } }), /lacks the environment or salt epoch/],
    ["a key the sensor does not know", new Response(v4, { headers: headers(await signed(INSTALL, "production", "1", v4, "policy:9")) }), /unknown key "policy:9"/],
    ["a pinned key's name on a signature it did not make", new Response(v4, { headers: headers(await signed(INSTALL, "production", "1", v4, "policy:1")) }), /the signature does not hold/],
    ["a signature that is not strict base64url", new Response(v4, { headers: headers(`${good.slice(0, -1)}B`) }), /not in its signed form/],
  ];
  for (const [what, answer, reason] of cases) {
    resetPolicyCache();
    const answers = [await signedPolicy(POLICY, { install: INSTALL, issuedAt: 1 }), answer];
    const log: string[] = [];
    const load = (now: number) => loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: (async () => answers.shift()) as typeof fetch, now, cache: null, log: (l) => log.push(l) });
    assert.equal((await load(0)).policy.version, 3, what);
    assert.equal((await load(61_000)).policy.version, 3, what);
    assert.match(log.at(-1) ?? "", reason, what);
    assert.match(log.at(-1) ?? "", /keeping the last good policy$/, what);
  }
});

test("an answer stamped more than an hour from the sensor's clock, either way, or older than the policy held is refused", async () => {
  resetPolicyCache();
  const base = 1_760_000_000;
  const answers = [base, base - 3_700, base + 3_700 + 61, base - 10, base + 61].map((issuedAt, i) => signedPolicy({ ...POLICY, version: 3 + i }, { install: INSTALL, issuedAt }));
  const log: string[] = [];
  const load = (now: number) => loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: (async () => answers.shift()) as typeof fetch, now, cache: null, log: (l) => log.push(l) });
  assert.equal((await load(base * 1000)).policy.version, 3);
  assert.equal((await load((base + 61) * 1000)).policy.version, 3);
  assert.match(log.at(-1) ?? "", /stamped more than an hour before this sensor's clock/);
  assert.equal((await load((base + 122) * 1000)).policy.version, 3);
  assert.match(log.at(-1) ?? "", /stamped more than an hour after this sensor's clock/, "a server clock far ahead would otherwise lock out every later answer");
  assert.equal((await load((base + 183) * 1000)).policy.version, 3);
  assert.match(log.at(-1) ?? "", /older than the policy held/, "a replay of an earlier answer");
  assert.equal((await load((base + 244) * 1000)).policy.version, 7);
});

test("a 304 is checked against the body held, its environment and epoch apply only once it holds, and one that does not hold is fetched again in full", async () => {
  resetPolicyCache();
  const held = JSON.stringify(POLICY);
  const conditional: Array<string | null> = [];
  const answers = [
    await signedPolicy(POLICY, { install: INSTALL, issuedAt: 1, etag: '"3"' }),
    await signedNotModified(held, { install: INSTALL, issuedAt: 2, environment: "preview", saltEpoch: "2", etag: '"3"' }),
    await signedNotModified(JSON.stringify({ ...POLICY, version: 8 }), { install: INSTALL, issuedAt: 3, environment: "development", saltEpoch: "5", etag: '"3"' }),
    await signedPolicy({ ...POLICY, version: 4 }, { install: INSTALL, issuedAt: 4, etag: '"4"' }),
  ];
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    conditional.push(new Headers(init?.headers).get("if-none-match"));
    return answers.shift();
  }) as typeof fetch;
  const log: string[] = [];
  const load = (now: number) => loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: fetcher, now, cache: null, log: (l) => log.push(l) });
  await load(0);
  const kept = await load(61_000);
  assert.deepEqual([kept.policy.version, kept.environment, kept.saltEpoch], [3, "preview", 2], "a 304 that holds keeps the body and takes its signed environment and epoch");
  const refetched = await load(122_000);
  assert.deepEqual([refetched.policy.version, refetched.environment, refetched.saltEpoch], [4, "production", 1], "the epoch and environment of a 304 that does not hold are never applied");
  assert.deepEqual(conditional, [null, '"3"', '"3"', null], "the full fetch asks without If-None-Match");
  assert.match(log.join("\n"), /policy refused \(the signature does not hold\); fetching it in full/);
});

test("an answer larger than 1 MiB is refused", async () => {
  resetPolicyCache();
  const log: string[] = [];
  const huge = await signedPolicy({ ...POLICY, about: "a".repeat(1_100_000) }, { install: INSTALL, issuedAt: 1 });
  const state = await loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: (async () => huge) as typeof fetch, now: 0, cache: null, log: (l) => log.push(l) });
  assert.equal(state.policy.version, 0);
  assert.deepEqual(log, ["journeys: policy refused (the answer is larger than 1 MiB); keeping the embedded default"]);
});

test("without an install id nothing is fetched, since the signature names the install; a policy url set without one is said once", async () => {
  resetPolicyCache();
  const answers = serving(POLICY);
  const log: string[] = [];
  for (const now of [0, 61_000]) assert.equal((await loadPolicy({ installId: null, url: URL_A, credential: "k", fetch: answers.fetch, now, cache: null, log: (l) => log.push(l) })).policy.version, 0);
  assert.deepEqual(answers.calls, []);
  assert.deepEqual(log, ["journeys: JOURNEYS_INSTALL_ID is not set; the policy is signed for an install, so the embedded default runs"]);
});

test("a 304 stamped more than an hour ago, or before the policy held, keeps the last good policy without asking again: a full fetch would fail the same way", async () => {
  for (const [what, stamp, reason] of [["an old 304", 10_000 - 3_700, /stamped more than an hour before/], ["a replayed 304", 9_999, /older than the policy held/]] as const) {
    resetPolicyCache();
    const held = JSON.stringify(POLICY);
    const answers = [await signedPolicy(POLICY, { install: INSTALL, issuedAt: 10_000, etag: '"3"' }), await signedNotModified(held, { install: INSTALL, issuedAt: stamp, environment: "preview", saltEpoch: "2", etag: '"3"' })];
    let fetches = 0;
    const log: string[] = [];
    const load = (now: number) => loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: (async () => ((fetches += 1), answers.shift())) as typeof fetch, now, cache: null, log: (l) => log.push(l) });
    await load(10_000_000);
    const kept = await load(10_061_000);
    assert.deepEqual([kept.policy.version, kept.environment, kept.saltEpoch, fetches], [3, "production", 1, 2], what);
    assert.match(log.at(-1) ?? "", reason, what);
  }
});

test("the signed answer the sensor keeps is the copy a new instance starts from, after a 200 and after a 304", async () => {
  resetPolicyCache();
  const entries = new Map<string, string>();
  const cache = { get: async (k: string) => entries.get(k) ?? null, put: async (k: string, v: string) => void entries.set(k, v) };
  const held = JSON.stringify(POLICY);
  const answers = [await signedPolicy(POLICY, { install: INSTALL, issuedAt: 1, etag: '"3"' }), await signedNotModified(held, { install: INSTALL, issuedAt: 2, environment: "preview", saltEpoch: "2", etag: '"3"' })];
  const fetcher = (async () => answers.shift() ?? Promise.reject(new Error("network down"))) as typeof fetch;
  const load = (now: number) => loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: fetcher, now, cache, log: () => undefined });
  await load(0);
  resetPolicyCache();
  const afterFull = await load(1_000);
  assert.deepEqual([afterFull.policy.version, afterFull.environment, answers.length], [3, "production", 1], "a new instance starts from the stored 200, without a fetch");
  const afterNotModified = await load(62_000);
  assert.deepEqual([afterNotModified.environment, afterNotModified.saltEpoch], ["preview", 2]);
  resetPolicyCache();
  const restarted = await load(63_000);
  assert.deepEqual([restarted.policy.version, restarted.environment, restarted.saltEpoch, restarted.signed?.etag], [3, "preview", 2, '"3"'], "the 304's signed environment and epoch were stored with it");
});

test("a stored etag that is not one is never sent: the next load fetches in full", async () => {
  resetPolicyCache();
  const body = JSON.stringify(POLICY);
  const entry = { body, signature: await policySignature(INSTALL, "production", "1", 1, body), environment: "production", saltEpoch: "1", etag: '"2"\r\nx-injected: 1' };
  const conditional: Array<string | null> = [];
  const answers = [await signedPolicy({ ...POLICY, version: 4 }, { install: INSTALL, issuedAt: 2, etag: '"4"' })];
  const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    conditional.push(new Headers(init?.headers).get("if-none-match"));
    return answers.shift();
  }) as typeof fetch;
  const load = (now: number) => loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: fetcher, now, cache: { get: async () => JSON.stringify(entry), put: async () => undefined }, log: () => undefined });
  assert.equal((await load(0)).signed?.etag, null, "the stored copy is used, without its etag");
  assert.equal((await load(61_000)).policy.version, 4);
  assert.deepEqual(conditional, [null]);
});

test("loads that finish out of order keep the answer signed last", async () => {
  resetPolicyCache();
  const answers = [await signedPolicy(POLICY, { install: INSTALL, issuedAt: 1 }), await signedPolicy({ ...POLICY, version: 5 }, { install: INSTALL, issuedAt: 3, saltEpoch: "3" }), await signedPolicy({ ...POLICY, version: 4 }, { install: INSTALL, issuedAt: 2, saltEpoch: "2" })];
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    const answer = answers.shift();
    if (calls === 3) await new Promise((resolve) => setTimeout(resolve, 20));
    return answer;
  }) as typeof fetch;
  const load = (now: number) => loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: fetcher, now, cache: null, log: () => undefined });
  await load(0);
  await Promise.all([load(61_000), load(61_000)]);
  const held = await load(61_500);
  assert.deepEqual([held.policy.version, held.saltEpoch], [5, 3], "the slower, older answer does not replace the newer one");
});

test("a known answer signed with the policy route's own key script and signing steps checks out", async () => {
  resetPolicyCache();
  // Signed outside this repository with the policy route's signing steps; only the public half is kept.
  const vector = {
    x: "tkVg5pbRKaQojrkJSJneSZEKr0iGJMedy3FegWZ-M00",
    body: '{"schema":"scope.policy/1","version":1,"about":"A known-answer vector: café ✓","secrets":{},"headers":{},"forward":{},"rules":[],"surfaces":{}}',
    installId: "jin_vector000000000000000000",
    signature: "policy:99 1761134400 h41iQQdM-DrSKpgiFH2d88DrtGpVDkSucUpUfciMyucuCztEDg9fS1FrSb6fq_8Liv7Jr3OBBBi5_FbiSLjsCA",
  };
  trustPolicyKeyForTests("policy:99", await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: vector.x }, { name: "Ed25519" }, false, ["verify"]));
  const log: string[] = [];
  const state = await loadPolicy({ installId: vector.installId, url: "https://api.example/v1/installs/jin_vector000000000000000000/policy", credential: "k", fetch: (async () => new Response(vector.body, { headers: { "x-journeys-environment": "preview", "x-journeys-salt-epoch": "3", "x-journeys-signature": vector.signature } })) as typeof fetch, now: 1_761_134_400_000, cache: null, log: (l) => log.push(l) });
  assert.deepEqual([state.policy.version, state.environment, state.saltEpoch, log], [1, "preview", 3, []]);
});

test("a body that is not UTF-8 is refused before its signature is read; a byte-order mark is kept, so the signature over it still holds", async () => {
  resetPolicyCache();
  const log: string[] = [];
  const load = (answer: Response, now: number) => loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: (async () => answer) as typeof fetch, now, cache: null, log: (l) => log.push(l) });
  await load(new Response(new Uint8Array([0x7b, 0xff, 0x7d]), { headers: { "x-journeys-environment": "production", "x-journeys-salt-epoch": "1" } }), 0);
  assert.equal(log.at(-1), "journeys: policy refused (the answer is not UTF-8); keeping the embedded default");
  resetPolicyCache();
  const marked = `﻿${JSON.stringify(POLICY)}`;
  await load(new Response(marked, { headers: { "x-journeys-environment": "production", "x-journeys-salt-epoch": "1", "x-journeys-signature": await policySignature(INSTALL, "production", "1", 1, marked) } }), 0);
  assert.match(log.at(-1) ?? "", /^journeys: policy refused \((?!the signature)/, "the signature holds over the marked bytes; the JSON parser refuses the mark");
});

test("an empty install id is no install id", async () => {
  resetPolicyCache();
  const answers = serving(POLICY);
  assert.equal((await loadPolicy({ installId: "", url: URL_A, credential: "k", fetch: answers.fetch, now: 0, cache: null, log: () => undefined })).policy.version, 0);
  assert.deepEqual(answers.calls, []);
});

test("held settings belong to one install: another install, or none, on the same url never runs them", async () => {
  resetPolicyCache();
  const answers = [await signedPolicy(POLICY, { install: INSTALL, issuedAt: 1 }), await signedPolicy(POLICY, { install: INSTALL, issuedAt: 1 })];
  const fetcher = (async () => answers.shift()) as typeof fetch;
  const load = (installId: string | null) => loadPolicy({ installId, url: URL_A, credential: "k", fetch: fetcher, now: 0, cache: null, log: () => undefined });
  assert.equal((await load(INSTALL)).policy.version, 3);
  assert.equal((await load("jin_b")).policy.version, 0, "fetched for jin_b, the answer signed for jin_a is refused");
  assert.equal((await load(null)).policy.version, 0, "without an install, the embedded default");
  assert.equal((await load(INSTALL)).policy.version, 3, "jin_a's settings are still held for jin_a");
});

test("a refused answer leaves the stored copy as the sensor runs, so a new instance starts the same way", async () => {
  resetPolicyCache();
  const entries = new Map<string, string>();
  const cache = { get: async (k: string) => entries.get(k) ?? null, put: async (k: string, v: string) => void entries.set(k, v) };
  const answers = [await signedPolicy(POLICY, { install: INSTALL, issuedAt: 1, environment: "preview", saltEpoch: "4" }), await signedPolicy({ ...POLICY, version: 5 }, { install: INSTALL, issuedAt: 2, environment: "staging", saltEpoch: "4" })];
  const load = (now: number) => loadPolicy({ installId: INSTALL, url: URL_A, credential: "k", fetch: (async () => answers.shift() ?? Promise.reject(new Error("network down"))) as typeof fetch, now, cache, log: () => undefined });
  await load(0);
  const running = await load(61_000);
  resetPolicyCache();
  const restarted = await load(62_000);
  assert.deepEqual([restarted.policy.version, restarted.environment, restarted.saltEpoch], [running.policy.version, running.environment, running.saltEpoch]);
  assert.deepEqual([restarted.policy.version, restarted.environment], [3, "preview"]);
});
