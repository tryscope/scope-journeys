// J3.5: the verifier, reason by reason, against a synthetic signer: the directory fetched through
// io.forward with an absolute URL and cached an hour (a minute when unreachable), the window on
// io.now(), the key by keyid, Ed25519 on WebCrypto, the authority the host the agent spoke to.
import assert from "node:assert/strict";
import { test } from "node:test";

import { directoryUrl, verifyWebBotAuth } from "../src/webbotauth.js";
import { directory, signed } from "../../../scripts/sign-webbotauth.mjs";

const NOW = Date.parse("2026-10-10T12:00:29.000Z");
const DIRECTORY = "https://signer.example/.well-known/http-message-signatures-directory";

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

test("the directory URL from the agent: the origin, or the directory itself when the agent names it", () => {
  assert.equal(directoryUrl('"https://signer.example"'), DIRECTORY);
  assert.equal(directoryUrl("https://signer.example/"), DIRECTORY);
  assert.equal(directoryUrl(`"${DIRECTORY}"`), DIRECTORY);
});

test("verified: the signature holds against the host the agent spoke to; the directory is fetched once and cached for an hour", async () => {
  const w = world();
  const first = await verifyWebBotAuth(headersOf(signed("acme.example", "GET")), "GET", "acme.example", w.io);
  assert.deepEqual(first, { agent: "https://signer.example", keyid: "fixture-key-2026-10", valid: true, reason: "verified", authority: "acme.example" });
  const second = await verifyWebBotAuth(headersOf(signed("acme.example", "GET")), "GET", "acme.example", w.io);
  assert.equal(second.reason, "verified");
  assert.deepEqual(w.fetched, [DIRECTORY], "one directory fetch, through io.forward with the absolute URL");
  assert.equal(w.store.get(`webbotauth:${DIRECTORY}`)?.ttl, 3600);
});

test("expired and not yet valid, on io.now()", async () => {
  const expired = await verifyWebBotAuth(headersOf(signed("acme.example", "GET")), "GET", "acme.example", world({ now: NOW + 10 * 60_000 }).io);
  assert.equal(expired.reason, "expired");
  assert.equal(expired.valid, false);
  const early = await verifyWebBotAuth(headersOf(signed("acme.example", "GET")), "GET", "acme.example", world({ now: NOW - 10 * 60_000 }).io);
  assert.equal(early.reason, "not_yet_valid");
});

test("unknown_key, unsupported_alg, directory_unreachable (cached a minute), bad_signature, authority_mismatch", async () => {
  const good = signed("acme.example", "GET");
  const unknown = await verifyWebBotAuth(headersOf({ ...good, "signature-input": good["signature-input"].replace('keyid="fixture-key-2026-10"', 'keyid="nope"') }), "GET", "acme.example", world().io);
  assert.equal(unknown.reason, "unknown_key");
  assert.equal(unknown.keyid, "nope");
  const unsupported = await verifyWebBotAuth(headersOf(good), "GET", "acme.example", world({ keys: [{ kid: "fixture-key-2026-10", kty: "EC", crv: "P-256", x: "a", y: "b" }] }).io);
  assert.equal(unsupported.reason, "unsupported_alg");
  const down = world({ unreachable: true });
  const unreachable = await verifyWebBotAuth(headersOf(good), "GET", "acme.example", down.io);
  assert.equal(unreachable.reason, "directory_unreachable");
  assert.equal(down.store.get(`webbotauth:${DIRECTORY}`)?.ttl, 60, "a failed fetch is remembered a minute, not an hour");
  const refused = await verifyWebBotAuth(headersOf(good), "GET", "acme.example", world({ status: 503 }).io);
  assert.equal(refused.reason, "directory_unreachable");
  const tampered = await verifyWebBotAuth(headersOf({ ...good, signature: good.signature.replace(/^sig1=:(.)/, (_, c: string) => `sig1=:${c === "A" ? "B" : "A"}`) }), "GET", "acme.example", world().io);
  assert.equal(tampered.reason, "bad_signature");
  const incomplete = await verifyWebBotAuth(headersOf({ "signature-agent": good["signature-agent"] }), "GET", "acme.example", world().io);
  assert.equal(incomplete.reason, "bad_signature");
  const elsewhere = await verifyWebBotAuth(headersOf(good), "GET", "origin.acme.example", world().io, ["acme.example"]);
  assert.deepEqual(elsewhere, { agent: "https://signer.example", keyid: "fixture-key-2026-10", valid: false, reason: "authority_mismatch", authority: "origin.acme.example" });
  const nowhere = await verifyWebBotAuth(headersOf(good), "GET", "origin.acme.example", world().io, []);
  assert.equal(nowhere.reason, "bad_signature");
  const wrongMethod = await verifyWebBotAuth(headersOf(good), "POST", "acme.example", world().io);
  assert.equal(wrongMethod.reason, "bad_signature");
});
