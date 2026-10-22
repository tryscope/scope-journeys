import type { Environment, IoCache } from "./io.js";
import { compilePolicy, defaultPolicy, isEnvironment, isRecord, PolicyError, type CompiledPolicy } from "./policy.js";
import { policyRefusals } from "./validate.js";
import { base64ToBytes } from "./webbotauth.js";

/**
 * The policy as every adapter runs it: fetched with If-None-Match over https, used only once Scope's
 * signature holds, checked against the schema before it is compiled, held 60 seconds per install and
 * url, the signed answer kept in the adapter's cache so a new isolate or instance starts warm, the last
 * good policy kept on any failure, the embedded forward-only default when nothing ever loaded. A fetch
 * never takes more than 2 seconds and never throws to the request path.
 */
export interface PolicyState {
  at: number;
  policy: CompiledPolicy;
  environment: Environment | null;
  saltEpoch: number | null;
  /** The signed answer the policy came from, which a 304 is checked against; null for the embedded default. */
  signed: { body: string; issuedAt: number; etag: string | null } | null;
}

export const DEFAULT_API_URL = "https://api.tryscope.com";

const TTL_MS = 60_000;
const states = new Map<string, PolicyState>();
const refused = new Set<string>();

// The public halves of Scope's policy signing keys: policy:1 signs in production and policy:2 is the
// spare that replaces it. The sensor trusts these and no key it is told at run time.
const PINNED = new Map([
  ["policy:1", "VDatrIjKoiyZX9BwNOoRiEYslxc3QARxBBrEnUNuOY0"],
  ["policy:2", "iqiuV2kXMvp0Ijl5hYw42Jufzjnk-xdqmTOwSUouffs"],
]);
const keys = new Map<string, Promise<CryptoKey>>();

/** For the tests: forget every held policy and every warning already given. */
export function resetPolicyCache(): void {
  states.clear();
  refused.clear();
}

/** For the tests: trust a key made in the test run under `kid`. Nothing in the sensor calls it. */
export function trustPolicyKeyForTests(kid: string, key: CryptoKey): void {
  keys.set(kid, Promise.resolve(key));
}

/** `value` when it is https, or http to the loopback for a local run, with no credentials in it; otherwise null, said once per value. */
export function secureUrl(value: string, name: string, log: (line: string) => void): string | null {
  const url = URL.parse(value);
  if (url && !url.username && !url.password && (url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) return value;
  if (!refused.has(value)) {
    refused.add(value);
    log(`journeys: ${name} must be https (http only to the loopback) with no credentials in it; ignoring ${url ? `${url.protocol}//${url.host}` : "a value that is not a url"}`);
  }
  return null;
}

function checked(document: unknown): CompiledPolicy {
  const refusals = policyRefusals(document);
  if (refusals.length) throw new PolicyError(refusals.map((f) => `${f.path} ${f.message}`).join("; "));
  return compilePolicy(document);
}

const nullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

/** `value` when it is an entity tag, else null: nothing else is ever sent as If-None-Match. */
const etagOf = (value: unknown): string | null => (typeof value === "string" && /^(?:W\/)?"[\x21\x23-\x7e\x80-\xff]*"$/.test(value) ? value : null);

/** An answer as the policy route sent it: the exact body, the three headers the signature covers, and the etag, which it does not. */
interface Answer {
  body: string;
  signature: string | null;
  environment: string | null;
  saltEpoch: string | null;
  etag: string | null;
}

/** The answer's body as text, read to at most 1 MiB; a larger body or one that is not UTF-8 is refused. */
async function bodyText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let read = await reader?.read(); read && !read.done; read = await reader?.read()) {
    size += read.value.byteLength;
    if (size > 1_048_576) {
      void reader?.cancel().catch(() => undefined);
      throw new PolicyError("the answer is larger than 1 MiB");
    }
    chunks.push(read.value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  try {
    // ignoreBOM keeps every byte, so the text encodes back to exactly the bytes Scope signed.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new PolicyError("the answer is not UTF-8");
  }
}

/** What a signature that holds vouches for: when Scope signed, and the environment and epoch it signed. */
interface Signed {
  issuedAt: number;
  environment: string;
  saltEpoch: string;
}

/** What the answer's signature vouches for, once it holds under a pinned key over the six lines the policy route signs; otherwise a PolicyError says why. */
async function verified(installId: string, answer: Answer): Promise<Signed> {
  // `<kid> <issued_at> <signature>`: unix seconds, and 64 bytes of strict base64url without padding.
  const parts = answer.signature === null ? null : /^([A-Za-z0-9:._-]{1,64}) ([1-9][0-9]{0,11}) ([A-Za-z0-9_-]{85}[AQgw])$/.exec(answer.signature);
  if (!parts) throw new PolicyError(answer.signature === null ? "the answer is not signed" : "the signature is not in its signed form");
  const [, kid = "", stamp = "", signature = ""] = parts;
  if (answer.environment === null || answer.saltEpoch === null) throw new PolicyError("the answer lacks the environment or salt epoch the signature covers");
  const x = PINNED.get(kid);
  if (x && !keys.has(kid)) keys.set(kid, crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x }, { name: "Ed25519" }, false, ["verify"]));
  const key = keys.get(kid);
  if (!key) throw new PolicyError(`the answer is signed with an unknown key ${JSON.stringify(kid)}`);
  const message = new TextEncoder().encode(["journeys-policy-signature/1", installId, answer.environment, answer.saltEpoch, stamp, answer.body].join("\n"));
  if (!(await crypto.subtle.verify({ name: "Ed25519" }, await key, base64ToBytes(`${signature.replace(/-/g, "+").replace(/_/g, "/")}==`), message))) throw new PolicyError("the signature does not hold");
  return { issuedAt: Number(stamp), environment: answer.environment, saltEpoch: answer.saltEpoch };
}

/** The held state for a signed answer, refused when it is older than the policy held or its environment or salt epoch is not one the sensor takes; `policy` is the held compile of the same body, or null to compile it. */
function adopt(options: LoadOptions, answer: Answer, signed: Signed, policy: CompiledPolicy | null, held: PolicyState | undefined): PolicyState {
  if (held?.signed && signed.issuedAt < held.signed.issuedAt) throw new PolicyError("the answer is older than the policy held");
  if (!isEnvironment(signed.environment)) throw new PolicyError(`the answer's environment ${JSON.stringify(signed.environment)} is not production, preview or development`);
  if (!/^[1-9][0-9]*$/.test(signed.saltEpoch) || !Number.isSafeInteger(Number(signed.saltEpoch))) throw new PolicyError(`the answer's salt epoch ${JSON.stringify(signed.saltEpoch)} is not a positive whole number`);
  return {
    at: options.now,
    policy: policy ?? checked(JSON.parse(answer.body)),
    environment: signed.environment,
    saltEpoch: Number(signed.saltEpoch),
    signed: { body: answer.body, issuedAt: signed.issuedAt, etag: answer.etag },
  };
}

/** The adapter's stored copy as a held state, checked again like a fresh answer but for the hour, or null when there is none or it is refused. */
async function stored(options: LoadOptions, installId: string, key: string): Promise<PolicyState | null> {
  let entry: unknown;
  try {
    const text = await options.cache?.get(`policy:${key}`);
    entry = text ? JSON.parse(text) : null;
  } catch {
    // The cache is a convenience: one that cannot be read, or holds no JSON, is no stored copy.
    return null;
  }
  if (!isRecord(entry) || typeof entry.body !== "string" || !nullableString(entry.signature) || !nullableString(entry.environment) || !nullableString(entry.saltEpoch)) return null;
  const answer: Answer = { body: entry.body, signature: entry.signature, environment: entry.environment, saltEpoch: entry.saltEpoch, etag: etagOf(entry.etag) };
  try {
    return adopt(options, answer, await verified(installId, answer), null, undefined);
  } catch (error) {
    options.log(`journeys: stored policy refused (${error instanceof Error ? error.message : String(error)}); fetching it again`);
    return null;
  }
}

export interface LoadOptions {
  url: string | null;
  /** The install the policy is fetched for; Scope's signature names it, so without it nothing is fetched. */
  installId: string | null;
  /** The bearer the policy route accepts: the install key, or the Next form's OIDC token. */
  credential: string | null;
  fetch: typeof fetch;
  now: number;
  cache: IoCache | null;
  log: (line: string) => void;
}

export async function loadPolicy(options: LoadOptions): Promise<PolicyState> {
  // The policy route answers only an install or a session: without a credential there is nothing to fetch.
  const url = options.url === null || !options.credential ? null : secureUrl(options.url, "the policy url", options.log);
  const installId = options.installId || null;
  if (url !== null && installId === null && !refused.has(`install:${url}`)) {
    refused.add(`install:${url}`);
    options.log("journeys: JOURNEYS_INSTALL_ID is not set; the policy is signed for an install, so the embedded default runs");
  }
  // Held state is one install's answers from one url.
  const key = url !== null && installId !== null ? `${installId} ${url}` : "default";
  const current = states.get(key);
  if (current && options.now - current.at < TTL_MS) return current;
  if (url === null || installId === null) {
    const fresh = current ?? { at: options.now, policy: compilePolicy(defaultPolicy), environment: null, saltEpoch: null, signed: null };
    states.set(key, { ...fresh, at: options.now });
    return fresh;
  }
  // Loads for one install and url may finish in any order: an answer signed before the one now held never replaces it.
  const hold = (next: PolicyState): PolicyState => {
    const latest = states.get(key);
    const kept = latest?.signed && next.signed && latest.signed.issuedAt > next.signed.issuedAt ? latest : next;
    states.set(key, kept);
    return kept;
  };
  try {
    const warm = current ? null : await stored(options, installId, key);
    if (warm) return hold(warm);
    // One deadline for the fetch and the full fetch that follows a 304 whose signature does not hold.
    const signal = AbortSignal.timeout(2_000);
    let etag = current?.signed?.etag ?? null;
    for (;;) {
      // A redirect is not followed: its target was never checked like the configured url.
      const response = await options.fetch(url, { headers: { authorization: `Bearer ${options.credential}`, ...(etag ? { "if-none-match": etag } : {}) }, redirect: "manual", signal });
      // A 304 is signed over the body held: its environment and epoch apply only once that holds.
      const held = response.status === 304 && etag !== null && current?.signed ? { body: current.signed.body, policy: current.policy } : null;
      if (!held && !response.ok) {
        options.log(`journeys: policy fetch answered ${response.status}; keeping ${current ? "the last good policy" : "the embedded default"}`);
        // An unread body holds the connection open until the platform gives up on it; a cancel that fails changes nothing here.
        void response.body?.cancel().catch(() => undefined);
        break;
      }
      const answer: Answer = { body: held ? held.body : await bodyText(response), signature: response.headers.get("x-journeys-signature"), environment: response.headers.get("x-journeys-environment"), saltEpoch: response.headers.get("x-journeys-salt-epoch"), etag: held ? etag : etagOf(response.headers.get("etag")) };
      let signed: Signed;
      try {
        signed = await verified(installId, answer);
      } catch (error) {
        // Asking again in full helps only a 304 whose signature does not hold over the body held.
        if (!held || !(error instanceof PolicyError)) throw error;
        options.log(`journeys: policy refused (${error.message}); fetching it in full`);
        etag = null;
        continue;
      }
      if (Math.abs(options.now / 1000 - signed.issuedAt) > 3600) throw new PolicyError(`the answer is stamped more than an hour ${signed.issuedAt < options.now / 1000 ? "before" : "after"} this sensor's clock`);
      const adopted = adopt(options, answer, signed, held ? held.policy : null, current);
      if (!held) for (const notice of adopted.policy.notices) options.log(`journeys: policy ${adopted.policy.version}: ${notice}`);
      const kept = hold(adopted);
      if (kept === adopted) {
        try {
          await options.cache?.put(`policy:${key}`, JSON.stringify(answer), TTL_MS / 1000);
        } catch {
          // The cache is a convenience; the held state is the copy that matters.
        }
      }
      return kept;
    }
  } catch (error) {
    // A body that is not JSON throws a SyntaxError, and an answer or pattern the sensor refuses a PolicyError.
    const what = error instanceof PolicyError || error instanceof SyntaxError ? `policy refused (${error.message})` : `policy fetch failed (${error instanceof Error ? error.message : String(error)})`;
    options.log(`journeys: ${what}; keeping ${current ? "the last good policy" : "the embedded default"}`);
  }
  const latest = states.get(key);
  const fallback: PolicyState = latest ? { ...latest, at: options.now } : { at: options.now, policy: compilePolicy(defaultPolicy), environment: null, saltEpoch: null, signed: null };
  states.set(key, fallback);
  return fallback;
}
