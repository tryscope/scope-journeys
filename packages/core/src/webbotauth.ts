import type { Io } from "./io.js";

/**
 * Web Bot Auth (RFC 9421 HTTP message signatures with a `Signature-Agent`), verified in the sensor
 * against the host the agent spoke to (architecture §14.4, decision 12): the operator names itself
 * and signs the request with a key it publishes in its directory. Behind a sensor the authority is
 * the sensor's host, never the origin's, which is why the verifier lives here.
 */
export type SignatureReason = "verified" | "expired" | "not_yet_valid" | "unknown_key" | "directory_unreachable" | "bad_signature" | "unsupported_alg" | "authority_mismatch";

export interface SignatureResult {
  agent: string;
  keyid: string | null;
  valid: boolean;
  reason: SignatureReason;
  authority: string;
}

interface Jwk {
  kid?: string;
  kty?: string;
  crv?: string;
  alg?: string;
  x?: string;
  n?: string;
  e?: string;
}

export const DIRECTORY_PATH = "/.well-known/http-message-signatures-directory";
const DIRECTORY_TTL_SECONDS = 3600;
// An outage at the signer must not blind a host for an hour: a failed fetch is remembered a minute.
const NEGATIVE_TTL_SECONDS = 60;
const CLOCK_SKEW_SECONDS = 60;

/** The directory the agent names: its origin, or the directory URL itself when it says so. */
export function directoryUrl(agent: string): string {
  const origin = agent.replace(/^"|"$/g, "").replace(/\/$/, "");
  return origin.endsWith("/http-message-signatures-directory") ? origin : `${origin}${DIRECTORY_PATH}`;
}

async function keysOf(agent: string, io: Pick<Io, "forward" | "cache">): Promise<Jwk[] | null> {
  const url = directoryUrl(agent);
  const key = `webbotauth:${url}`;
  const cached = await io.cache.get(key);
  if (cached !== null) return (JSON.parse(cached) as { keys: Jwk[] | null }).keys;
  let keys: Jwk[] | null = null;
  try {
    const response = await io.forward(new Request(url, { headers: { accept: "application/http-message-signatures-directory+json" } }));
    if (response.ok) {
      const document = (await response.json()) as { keys?: unknown };
      keys = Array.isArray(document.keys) ? (document.keys as Jwk[]) : [];
    }
  } catch {
    keys = null;
  }
  await io.cache.put(key, JSON.stringify({ keys }), keys === null ? NEGATIVE_TTL_SECONDS : DIRECTORY_TTL_SECONDS);
  return keys;
}

const base64ToBytes = (b64: string): Uint8Array<ArrayBuffer> => {
  const raw = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
};

/** The key as WebCrypto takes it: Ed25519 (what the directories the lab met publish), or RSA-PSS with SHA-512 when a directory publishes RSA keys. */
async function importKey(jwk: Jwk, alg: string | null): Promise<{ key: CryptoKey; algorithm: AlgorithmIdentifier | RsaPssParams } | null> {
  try {
    if (jwk.kty === "OKP" && jwk.crv === "Ed25519" && jwk.x && (!alg || alg === "ed25519")) {
      return { key: await crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x: jwk.x }, { name: "Ed25519" }, false, ["verify"]), algorithm: { name: "Ed25519" } };
    }
    if (jwk.kty === "RSA" && jwk.n && jwk.e && (!alg || alg === "rsa-pss-sha512")) {
      return { key: await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e }, { name: "RSA-PSS", hash: "SHA-512" }, false, ["verify"]), algorithm: { name: "RSA-PSS", saltLength: 64 } };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Verify the request's signature against `authority`, the host it arrived on. When the signature
 * does not hold there but holds for one of `candidates` (the host a proxy in front named), the
 * reason is `authority_mismatch`: a good signature for a host this sensor does not serve, which is
 * the Program 9 finding (102 of 102 false mismatches at the origin, 44 of 44 verified at the host
 * the agent spoke to).
 */
export async function verifyWebBotAuth(headers: Headers, method: string, authority: string, io: Pick<Io, "forward" | "cache" | "now">, candidates: readonly string[] = []): Promise<SignatureResult> {
  const agent = (headers.get("signature-agent") ?? "").replace(/^"|"$/g, "");
  const input = headers.get("signature-input") ?? "";
  const signature = headers.get("signature") ?? "";
  const label = input.split("=")[0] ?? "";
  const params = input.slice(label.length + 1);
  const listed = /^\(([^)]*)\)/.exec(params);
  const keyid = /keyid="([^"]+)"/.exec(params)?.[1] ?? null;
  if (!agent || !listed || !signature) return { agent, keyid, valid: false, reason: "bad_signature", authority };
  const components = [...(listed[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
  const value = (component: string, host: string): string | null => (component === "@authority" ? host : component === "@method" ? method.toUpperCase() : headers.get(component));
  if (components.some((c) => value(c, authority) === null)) return { agent, keyid, valid: false, reason: "bad_signature", authority };
  const base = (host: string): string => [...components.map((c) => `"${c}": ${value(c, host)}`), `"@signature-params": ${params}`].join("\n");
  const created = Number(/created=(\d+)/.exec(params)?.[1] ?? 0);
  const expires = Number(/expires=(\d+)/.exec(params)?.[1] ?? 0);
  const alg = /alg="([^"]+)"/.exec(params)?.[1] ?? null;
  const now = io.now() / 1000;
  if (created && now < created - CLOCK_SKEW_SECONDS) return { agent, keyid, valid: false, reason: "not_yet_valid", authority };
  if (expires && now > expires) return { agent, keyid, valid: false, reason: "expired", authority };
  const keys = await keysOf(agent, io);
  if (keys === null) return { agent, keyid, valid: false, reason: "directory_unreachable", authority };
  const jwk = keys.find((k) => k.kid === keyid);
  if (!jwk) return { agent, keyid, valid: false, reason: "unknown_key", authority };
  const imported = await importKey(jwk, alg);
  if (!imported) return { agent, keyid, valid: false, reason: "unsupported_alg", authority };
  const encoded = /:([^:]+):/.exec(signature)?.[1];
  if (!encoded) return { agent, keyid, valid: false, reason: "bad_signature", authority };
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64ToBytes(encoded);
  } catch {
    return { agent, keyid, valid: false, reason: "bad_signature", authority };
  }
  const encoder = new TextEncoder();
  const holds = (host: string): Promise<boolean> => crypto.subtle.verify(imported.algorithm, imported.key, bytes, encoder.encode(base(host)));
  if (await holds(authority)) return { agent, keyid, valid: true, reason: "verified", authority };
  for (const candidate of new Set(candidates.filter((c) => c && c !== authority))) {
    if (await holds(candidate)) return { agent, keyid, valid: false, reason: "authority_mismatch", authority };
  }
  return { agent, keyid, valid: false, reason: "bad_signature", authority };
}
