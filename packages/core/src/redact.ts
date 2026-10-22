import type { Io } from "./io.js";
import type { CompiledPolicy } from "./policy.js";
import { isReference } from "./references.js";

// The names hashed under every policy, the built-in default included: a URL parameter or a body
// field so named, in any case and spelling (apiKey, api-key; in a URL also percent-encoded, as in a
// URL carried inside a parameter). A valid reference code stays only where the policy says
// references travel.
const SECRET_NAMES = ["api_key", "key", "token", "access_token", "refresh_token", "id_token", "code", "client_secret", "password", "secret", "signature", "sig"];
const bare = (name: string): string => name.toLowerCase().replace(/[_-]/g, "");
const SECRET_FIELDS = new Set(SECRET_NAMES.map(bare));
// A `code` the client sends is an OAuth or device code; in an answer it is far more often an error code.
const ANSWER_FIELDS = new Set([...SECRET_FIELDS].filter((name) => name !== "code"));
const SECRET_PARAMS = new RegExp(`(?<=(?:^|[?&#\\s]|%3f|%26|%23)(${SECRET_NAMES.map((n) => n.replace(/_/g, "(?:[_-]|%5f|%2d)?")).join("|")})(?:=|%3d))(?:(?!%26|%23)[^&#\\s])+`, "gi");

/** `text` with each match of the global `re` replaced by `mark(match, its hash)`; the hashes are computed together. */
async function hashMatches(text: string, re: RegExp, io: Io, mark: (match: RegExpExecArray, hash: string) => string): Promise<string> {
  const hashed = await Promise.all([...text.matchAll(re)].map(async (m) => ({ m, hash: await io.hash(m[0]) })));
  let out = "";
  let last = 0;
  for (const { m, hash } of hashed) {
    out += text.slice(last, m.index) + mark(m, hash);
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}

/**
 * Redaction of a string: the value of a secret-named URL parameter becomes `h:<hash>`, then a value
 * of the product's signed shape is replaced, wherever it appears, by `<prefix>:h:<hash>` where the
 * prefix is the shape's first capture group (the product's own key prefix) or `v`. Field names leak
 * signed values under unexpected names; shapes do not.
 */
export async function redactString(value: string, policy: CompiledPolicy, io: Io): Promise<string> {
  let out = value;
  if (out.search(SECRET_PARAMS) !== -1) out = await hashMatches(out, SECRET_PARAMS, io, (m, hash) => (hashedValue(m[0]) || (policy.referenceNames.has((m[1] ?? "").toLowerCase()) && isReference(m[0])) ? m[0] : `h:${hash}`));
  // Most strings hold no secret: they skip the hashing and its await (search leaves the shared lastIndex alone).
  for (const re of policy.shapes) if (out.search(re) !== -1) out = await hashMatches(out, re, io, (m, hash) => `${m[1] ?? "v"}:h:${hash}`);
  return out;
}

/**
 * Redaction by field name, recursively: a field the policy names as a secret, or one of the names
 * hashed under every policy, becomes `h:<hash>` of its string, or of its whole value as JSON when
 * that is an object or an array (one hash per field, however large); a field the policy names as a
 * uri field has its named parameter, in the query or the fragment, hashed in place; every other
 * string is redacted as above.
 */
export async function redact(value: unknown, policy: CompiledPolicy, io: Io, from: "request" | "answer"): Promise<unknown> {
  if (typeof value === "string") return redactString(value, policy, io);
  if (Array.isArray(value)) return Promise.all(value.map((v) => redact(v, policy, io, from)));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const param = policy.uriFields.get(k);
      const reference = typeof v === "string" && policy.referenceNames.has(k.toLowerCase()) && isReference(v);
      const secret = (typeof v === "string" && v.length > 0) || (v !== null && typeof v === "object");
      if (secret && (policy.secretFields.has(k) || ((from === "answer" ? ANSWER_FIELDS : SECRET_FIELDS).has(bare(k)) && !reference))) out[k] = `h:${await io.hash(typeof v === "string" ? v : JSON.stringify(v))}`;
      else if (param && typeof v === "string") out[k] = await redactString(await hashMatches(v, param, io, (_, hash) => `h:${hash}`), policy, io);
      else out[k] = await redact(v, policy, io, from);
    }
    return out;
  }
  return value;
}

/**
 * A recorded body cut to the allowlist: an allowed field keeps its whole value, any other is
 * dropped, objects and arrays are searched for allowed fields at any depth (an array keeps its
 * positions, null where nothing is allowed); null when nothing allowed remains.
 */
export function allowedFields(value: unknown, names: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) {
    const kept = value.map((v) => allowedFields(v, names));
    return kept.some((v) => v !== null) ? kept : null;
  }
  if (!value || typeof value !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const kept = names.has(k) ? v : allowedFields(v, names);
    if (names.has(k) || kept !== null) out[k] = kept;
  }
  return Object.keys(out).length ? out : null;
}

/** A hashed value as it appears in a redacted body (`h:<hash>` or `<prefix>:h:<hash>`), or null. */
export function hashedValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(?:[A-Za-z0-9_-]+:)?h:([0-9a-f]{12})$/.exec(value);
  return m ? (m[1] ?? null) : null;
}
