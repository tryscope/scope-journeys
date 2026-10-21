// The verifier, reason by reason, against a synthetic signer: only a listed signer's directory is
// fetched, cached an hour (a minute when unreachable); the window on io.now(), the key by keyid,
// Ed25519 on WebCrypto, the authority the host the agent spoke to.
import assert from "node:assert/strict";
import { test } from "node:test";

import { compilePolicy, defaultPolicy } from "../src/policy.js";
import { verifyWebBotAuth } from "../src/webbotauth.js";
import { directory, signed } from "../../../scripts/sign-webbotauth.mjs";

const NOW = Date.parse("2026-10-10T12:00:29.000Z");
const DIRECTORY = "https://signer.example/.well-known/http-message-signatures-directory";
const SIGNERS = ["https://signer.example"];

function world(options: { status?: number; unreachable?: boolean; now?: number; keys?: unknown } = {}) {
  const store = new Map<string, { value: string; ttl: number }>();
  const fetched: string[] = [];
  const io = {
    now: () => options.now ?? NOW,
    forward: async (request: Request) => {
      fetched.push(request.url);
      if (options.unreachable) throw new TypeError("fetch failed");
      return Response.json(options.keys === undefined ? directory : { keys: options.keys }, { status: options.status ?? 200 });
    },
    cache: {
      get: async (key: string) => store.get(key)?.value ?? null,
      put: async (key: string, value: string, ttl: number) => {
        store.set(key, { value, ttl });
      },
    },
  };
  return { io, fetched, store };
}

const headersOf = (h: Record<string, string>): Headers => new Headers(h);

test("a listed signer, named by its origin, its origin with a slash or its directory URL, is verified from the directory the list names", async () => {
  for (const named of ["https://signer.example", "https://signer.example/", DIRECTORY]) {
    const w = world();
    const result = await verifyWebBotAuth(headersOf(signed("acme.example", "GET", "fixture-key-2026-10", named)), "GET", "acme.example", SIGNERS, w.io);
    assert.equal(result.reason, "verified", named);
    assert.deepEqual(w.fetched, [DIRECTORY], named);
  }
});

test("a signer not on the list: unlisted_signer, no outbound request and nothing cached, whatever the header holds", async () => {
  const inline = `data:application/json,${encodeURIComponent(JSON.stringify(directory))}`;
  const unlisted = [
    "https://unlisted.example",
    "https://signer.example.unlisted.example",
    "https://signer.example:8443",
    "http://signer.example",
    "https://signer.example/private#/http-message-signatures-directory",
    "https://signer.example/private?/.well-known/http-message-signatures-directory",
    "http://10.0.0.7:8080/internal#/http-message-signatures-directory",
    inline,
  ];
  for (const agent of unlisted) {
    // The world answers every URL with the signer's keys, so a fetch would have verified.
    const w = world();
    const result = await verifyWebBotAuth(headersOf(signed("acme.example", "GET", "fixture-key-2026-10", agent)), "GET", "acme.example", SIGNERS, w.io);
    assert.deepEqual(result, { agent, keyid: "fixture-key-2026-10", valid: false, reason: "unlisted_signer", authority: "acme.example" }, agent);
    assert.deepEqual(w.fetched, [], agent);
    assert.equal(w.store.size, 0, agent);
  }
  const none = world();
  assert.equal((await verifyWebBotAuth(headersOf(signed("acme.example", "GET")), "GET", "acme.example", [], none.io)).reason, "unlisted_signer", "an empty list verifies no one");
  assert.deepEqual(none.fetched, []);
});

test("the cache holds listed signers only: a thousand distinct unlisted signers leave it empty", async () => {
  const w = world();
  for (let i = 0; i < 1000; i += 1) await verifyWebBotAuth(headersOf(signed("acme.example", "GET", "fixture-key-2026-10", `https://s${i}.unlisted.example`)), "GET", "acme.example", SIGNERS, w.io);
  assert.equal(w.store.size, 0);
  assert.deepEqual(w.fetched, []);
});

test("the policy's signers: absent means the built-in list, a list replaces it, an entry that is not an exact https origin and a value that is not a list are ignored and named", () => {
  const document = (extra: Record<string, unknown>): Record<string, unknown> => ({ schema: "scope.policy/1", version: 1, surfaces: { docs: { paths: ["^/docs/"] } }, rules: [], ...extra });
  const builtIn = ["https://crawler.exa.ai", "https://chatgpt.com"];
  assert.deepEqual(compilePolicy(defaultPolicy).signers, builtIn);
  assert.deepEqual(compilePolicy(document({})).signers, builtIn);
  assert.deepEqual(compilePolicy(document({})).notices, []);
  assert.deepEqual(compilePolicy(document({ signers: ["https://signer.example"] })).signers, ["https://signer.example"]);
  assert.deepEqual(compilePolicy(document({ signers: [] })).signers, []);
  const mixed = compilePolicy(document({ signers: ["https://ok.example", "http://plain.example", "https://slash.example/", "https://path.example/x", "https://Upper.example", "https://user@at.example", "https://ok.example#x", 7] }));
  assert.deepEqual(mixed.signers, ["https://ok.example"]);
  assert.deepEqual(mixed.notices, [
    'signers entry ignored: "http://plain.example" is not an https origin',
    'signers entry ignored: "https://slash.example/" is not an https origin',
    'signers entry ignored: "https://path.example/x" is not an https origin',
    'signers entry ignored: "https://Upper.example" is not an https origin',
    'signers entry ignored: "https://user@at.example" is not an https origin',
    'signers entry ignored: "https://ok.example#x" is not an https origin',
    "signers entry ignored: 7 is not an https origin",
  ]);
  const notList = compilePolicy(document({ signers: "https://signer.example" }));
  assert.deepEqual(notList.signers, builtIn);
  assert.deepEqual(notList.notices, ["signers ignored: not a list"]);
});

test("verified: the signature holds against the host the agent spoke to; the directory is fetched once and cached for an hour", async () => {
  const w = world();
  const first = await verifyWebBotAuth(headersOf(signed("acme.example", "GET")), "GET", "acme.example", SIGNERS, w.io);
  assert.deepEqual(first, { agent: "https://signer.example", keyid: "fixture-key-2026-10", valid: true, reason: "verified", authority: "acme.example" });
  const second = await verifyWebBotAuth(headersOf(signed("acme.example", "GET")), "GET", "acme.example", SIGNERS, w.io);
  assert.equal(second.reason, "verified");
  assert.deepEqual(w.fetched, [DIRECTORY], "one directory fetch, through io.forward with the absolute URL");
  assert.equal(w.store.get(`webbotauth:${DIRECTORY}`)?.ttl, 3600);
});

test("expired and not yet valid, on io.now()", async () => {
  const expired = await verifyWebBotAuth(headersOf(signed("acme.example", "GET")), "GET", "acme.example", SIGNERS, world({ now: NOW + 10 * 60_000 }).io);
  assert.equal(expired.reason, "expired");
  assert.equal(expired.valid, false);
  const early = await verifyWebBotAuth(headersOf(signed("acme.example", "GET")), "GET", "acme.example", SIGNERS, world({ now: NOW - 10 * 60_000 }).io);
  assert.equal(early.reason, "not_yet_valid");
});

test("unknown_key, unsupported_alg, directory_unreachable (cached a minute), bad_signature, authority_mismatch", async () => {
  const good = signed("acme.example", "GET");
  const unknown = await verifyWebBotAuth(headersOf({ ...good, "signature-input": good["signature-input"].replace('keyid="fixture-key-2026-10"', 'keyid="nope"') }), "GET", "acme.example", SIGNERS, world().io);
  assert.equal(unknown.reason, "unknown_key");
  assert.equal(unknown.keyid, "nope");
  const unsupported = await verifyWebBotAuth(headersOf(good), "GET", "acme.example", SIGNERS, world({ keys: [{ kid: "fixture-key-2026-10", kty: "EC", crv: "P-256", x: "a", y: "b" }] }).io);
  assert.equal(unsupported.reason, "unsupported_alg");
  const down = world({ unreachable: true });
  const unreachable = await verifyWebBotAuth(headersOf(good), "GET", "acme.example", SIGNERS, down.io);
  assert.equal(unreachable.reason, "directory_unreachable");
  assert.equal(down.store.get(`webbotauth:${DIRECTORY}`)?.ttl, 60, "a failed fetch is remembered a minute, not an hour");
  const refused = await verifyWebBotAuth(headersOf(good), "GET", "acme.example", SIGNERS, world({ status: 503 }).io);
  assert.equal(refused.reason, "directory_unreachable");
  const tampered = await verifyWebBotAuth(headersOf({ ...good, signature: good.signature.replace(/^sig1=:(.)/, (_, c: string) => `sig1=:${c === "A" ? "B" : "A"}`) }), "GET", "acme.example", SIGNERS, world().io);
  assert.equal(tampered.reason, "bad_signature");
  const incomplete = await verifyWebBotAuth(headersOf({ "signature-agent": good["signature-agent"] }), "GET", "acme.example", SIGNERS, world().io);
  assert.equal(incomplete.reason, "bad_signature");
  const elsewhere = await verifyWebBotAuth(headersOf(good), "GET", "origin.acme.example", SIGNERS, world().io, ["acme.example"]);
  assert.deepEqual(elsewhere, { agent: "https://signer.example", keyid: "fixture-key-2026-10", valid: false, reason: "authority_mismatch", authority: "origin.acme.example" });
  const nowhere = await verifyWebBotAuth(headersOf(good), "GET", "origin.acme.example", SIGNERS, world().io, []);
  assert.equal(nowhere.reason, "bad_signature");
  const wrongMethod = await verifyWebBotAuth(headersOf(good), "POST", "acme.example", SIGNERS, world().io);
  assert.equal(wrongMethod.reason, "bad_signature");
});
