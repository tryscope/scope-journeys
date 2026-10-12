// The Web Bot Auth fixtures (J3.5): a synthetic signer (an Ed25519 key derived from a fixed seed,
// so nothing secret is committed and the files are reproducible), its key directory, and one
// request per variant signed for the host it was sent to. `--write` regenerates the fixtures'
// `request.json` and `directory.json`; `test/node/webbotauth-fixtures.test.ts` fails when they are
// stale. No recorded traffic of any real signer is used (D17).
import { createHash, createPrivateKey, createPublicKey, sign } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SYNTHETIC = new URL("../fixtures/synthetic/", import.meta.url).pathname;
const SIGNER = "https://signer.example";
const DIRECTORY_URL = `${SIGNER}/.well-known/http-message-signatures-directory`;
const KEY_ID = "fixture-key-2026-10";
// The fixtures' clock is 2026-10-10T12:00:29Z; the signature is valid from two minutes before to three minutes after.
const SIGNED_AT = Math.floor(Date.parse("2026-10-10T12:00:29.000Z") / 1000);
const CREATED = SIGNED_AT - 120;
const EXPIRES = SIGNED_AT + 180;

const seed = createHash("sha256").update("journeys fixture signer 2026-10").digest();
// PKCS#8 for an Ed25519 private key is a fixed 16-byte prefix followed by the 32-byte seed.
const privateKey = createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]), format: "der", type: "pkcs8" });
const publicJwk = createPublicKey(privateKey).export({ format: "jwk" });

export const directory = { keys: [{ kty: "OKP", crv: "Ed25519", kid: KEY_ID, x: publicJwk.x, use: "sig" }] };

const COMPONENTS = ["@authority", "@method", "signature-agent"];

/** The request's signature headers for `authority`, per RFC 9421 with the components above. */
export function signed(authority, method, keyid = KEY_ID) {
  const agent = `"${SIGNER}"`;
  const params = `(${COMPONENTS.map((c) => `"${c}"`).join(" ")});created=${CREATED};expires=${EXPIRES};keyid="${keyid}";alg="ed25519";tag="web-bot-auth"`;
  const value = (c) => (c === "@authority" ? authority : c === "@method" ? method.toUpperCase() : c === "signature-agent" ? agent : null);
  const base = [...COMPONENTS.map((c) => `"${c}": ${value(c)}`), `"@signature-params": ${params}`].join("\n");
  const signature = sign(null, Buffer.from(base), privateKey).toString("base64");
  return { "signature-agent": agent, "signature-input": `sig1=${params}`, signature: `sig1=:${signature}:` };
}

const request = (host, headers, extra = {}) => ({
  method: "GET",
  url: `https://${host}/docs/quickstart`,
  headers: { accept: "text/html", "user-agent": "Mozilla/5.0 (compatible; fixture-signer/1.0)", "cf-connecting-ip": "203.0.113.9", ...headers, ...extra },
  body: null,
});

/** The five variants: what each fixture's `request.json` and `directory.json` hold. */
export function variants() {
  const good = signed("acme.example", "GET");
  const wrongKey = { ...good, "signature-input": good["signature-input"].replace(`keyid="${KEY_ID}"`, 'keyid="no-such-key"') };
  const forOtherHost = signed("acme.example", "GET");
  const reachable = { url: DIRECTORY_URL, status: 200, body: directory };
  return {
    "29-webbotauth-signed": { request: request("acme.example", good), directory: reachable },
    "29-webbotauth-signed-expired": { request: request("acme.example", good), directory: reachable },
    "29-webbotauth-signed-wrong-keyid": { request: request("acme.example", wrongKey), directory: reachable },
    "29-webbotauth-signed-directory-unreachable": { request: request("acme.example", good), directory: { url: DIRECTORY_URL, unreachable: true } },
    // Sent to the origin's own host while signed for the host the agent spoke to (the Program 9 finding as a test).
    "29-webbotauth-signed-authority-mismatch": { request: request("origin.acme.example", forOtherHost, { "x-forwarded-host": "acme.example" }), directory: reachable },
  };
}

export const serialize = (document) => `${JSON.stringify(document, null, 2)}\n`;

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const write = process.argv.includes("--write");
  let stale = 0;
  for (const [name, files] of Object.entries(variants())) {
    for (const [file, document] of [["request.json", files.request], ["directory.json", files.directory]]) {
      const path = join(SYNTHETIC, name, file);
      const text = serialize(document);
      let current = null;
      try {
        current = readFileSync(path, "utf8");
      } catch {
        current = null;
      }
      if (current === text) continue;
      stale += 1;
      if (write) writeFileSync(path, text);
      console.log(`${write ? "wrote" : "stale"} fixtures/synthetic/${name}/${file}`);
    }
  }
  if (!write && stale) process.exit(1);
  if (!stale) console.log("web bot auth fixtures current");
}
