// The assertion fixture's key pair (J3.4): a P-256 pair derived from a fixed seed, so nothing
// secret is committed and `facts.json` reproduces. `--write` regenerates the fixture's facts.json;
// `test/node/assertion-fixture.test.ts` fails when it is stale.
import { createECDH, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SYNTHETIC = new URL("../fixtures/synthetic/", import.meta.url).pathname;
export const FIXTURE_INSTALL = "jin_fixture0000000000000000";
export const FIXTURE_KID = `${FIXTURE_INSTALL}:1`;
export const FIXTURE_ISSUER = `https://api.fixture.example/v1/installs/${FIXTURE_INSTALL}`;

const b64url = (buffer) => buffer.toString("base64url");

/** The pair from the seed: the private scalar is the seed, the public point computed from it. */
export function fixtureAssertionKey() {
  const seed = createHash("sha256").update("journeys fixture assertion key 2026-10").digest();
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(seed);
  const point = ecdh.getPublicKey(null, "uncompressed");
  const x = b64url(point.subarray(1, 33));
  const y = b64url(point.subarray(33, 65));
  return {
    kid: FIXTURE_KID,
    issuer: FIXTURE_ISSUER,
    public_jwk: { kty: "EC", crv: "P-256", x, y, kid: FIXTURE_KID },
    private_jwk: { kty: "EC", crv: "P-256", x, y, d: b64url(seed), kid: FIXTURE_KID },
  };
}

/** The facts.json of `30-assertion-signed`: the toy page's facts with the key. */
export function fixtureFacts() {
  const base = JSON.parse(readFileSync(join(SYNTHETIC, "01-html-page", "facts.json"), "utf8"));
  const key = fixtureAssertionKey();
  return { ...base, address: "203.0.113.30", ts: "2026-10-10T12:00:30.000Z", assertion: { kid: key.kid, issuer: key.issuer, private_jwk: key.private_jwk } };
}

export const serialize = (document) => `${JSON.stringify(document, null, 2)}\n`;

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const path = join(SYNTHETIC, "30-assertion-signed", "facts.json");
  const text = serialize(fixtureFacts());
  let current = null;
  try {
    current = readFileSync(path, "utf8");
  } catch {
    current = null;
  }
  if (current === text) console.log("assertion fixture current");
  else if (process.argv.includes("--write")) {
    writeFileSync(path, text);
    console.log("wrote fixtures/synthetic/30-assertion-signed/facts.json");
  } else {
    console.log("stale fixtures/synthetic/30-assertion-signed/facts.json");
    process.exit(1);
  }
}
