import type { Io } from "./io.js";
import type { CompiledPolicy } from "./policy.js";
import { isReference } from "./references.js";

// The names hashed under every policy, the built-in default included: a URL parameter or a body
// field so named, in any case and spelling (apiKey, api-key; in a URL also percent-encoded). A valid
// reference code stays only where the policy says references travel.
const SECRET_NAMES = ["api_key", "key", "token", "access_token", "refresh_token", "id_token", "code", "client_secret", "password", "secret", "signature", "sig"];
const bare = (name: string): string => name.toLowerCase().replace(/[_-]/g, "");
const SECRET_FIELDS = new Set(SECRET_NAMES.map(bare));
// A `code` the client sends is an OAuth or device code; in an answer it is far more often an error code.
const ANSWER_FIELDS = new Set([...SECRET_FIELDS].filter((name) => name !== "code"));
// A name=value pair at the top of a URL or free text, its raw value running to the next &, # or
// space; then a name inside such a value, found without consuming the value it sits in, so pairs
// nested at any depth are reached in one linear scan.
const PAIR = /(^|[?&#\s])([^?&#\s=]+)=([^&#\s]*)/g;
const NAME = /(?:^|[?&#\s])([^?&#\s=]+)=/g;
const VALUE = /[^&#\s]*/y;
// Only ASCII escapes are decoded: every separator and secret name is ASCII, and this cannot throw.
const ascii = (text: string): string => text.replace(/%[0-7][0-9a-f]/gi, (escape) => String.fromCharCode(parseInt(escape.slice(1), 16)));

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
  const edits = value.includes("=") ? secretValues(value, policy) : [];
  if (edits.length) {
    const hashes = await Promise.all(edits.map(([, secret]) => io.hash(secret)));
    out = "";
    let last = 0;
    edits.forEach(([at, secret], i) => {
      out += `${value.slice(last, at)}h:${hashes[i]}`;
      last = at + secret.length;
    });
    out += value.slice(last);
  }
  // Most strings hold no secret: they skip the hashing and its await (search leaves the shared lastIndex alone).
  for (const re of policy.shapes) if (out.search(re) !== -1) out = await hashMatches(out, re, io, (m, hash) => `${m[1] ?? "v"}:h:${hash}`);
  return out;
}

/** Whether a pair's value is left as sent: empty, already hashed, or a valid reference where the policy says references travel. */
const kept = (name: string, value: string, policy: CompiledPolicy): boolean => !value || hashedValue(value) !== null || (policy.referenceNames.has(name) && isReference(value));

/** The start and value of every secret-named pair inside `text`, at any depth. */
function nestedSecrets(text: string, policy: CompiledPolicy): Array<[number, string]> {
  const found: Array<[number, string]> = [];
  let last = 0;
  for (const m of text.matchAll(NAME)) {
    const start = m.index + m[0].length;
    if (start < last) continue;
    const name = ascii(m[1] ?? "").toLowerCase();
    if (!SECRET_FIELDS.has(bare(name))) continue;
    VALUE.lastIndex = start;
    const value = VALUE.exec(text)?.[0] ?? "";
    if (kept(name, value, policy)) continue;
    found.push([start, value]);
    last = start + value.length;
  }
  return found;
}

/**
 * The start and value of every value to hash in `text`: a pair whose name, decoded, is a secret name.
 * Any other value carrying such a pair at any depth (a URL in a parameter) has those nested values
 * hashed where they sit when it was sent unencoded, and is hashed whole when it was encoded
 * (re-encoding it would not give back what was sent).
 */
function secretValues(text: string, policy: CompiledPolicy): Array<[number, string]> {
  const edits: Array<[number, string]> = [];
  for (const m of text.matchAll(PAIR)) {
    const name = ascii(m[2] ?? "").toLowerCase();
    const value = m[3] ?? "";
    const start = m.index + m[0].length - value.length;
    if (SECRET_FIELDS.has(bare(name))) {
      if (!kept(name, value, policy)) edits.push([start, value]);
      continue;
    }
    const inner = ascii(value);
    const nested = /[?&#\s]/.test(inner) ? nestedSecrets(inner, policy) : [];
    if (!nested.length) continue;
    if (inner === value) for (const [at, secret] of nested) edits.push([start + at, secret]);
    else edits.push([start, value]);
  }
  return edits;
}

/**
 * Redaction by field name, recursively: a field the policy names as a secret, or one of the names
 * hashed under every policy, becomes `h:<hash>` of its string, or of its whole value as JSON
 * otherwise (one hash per field, however large); a field the policy names as a
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
      if (v !== null && v !== undefined && v !== "" && (policy.secretFields.has(k) || ((from === "answer" ? ANSWER_FIELDS : SECRET_FIELDS).has(bare(k)) && !reference))) out[k] = `h:${await io.hash(typeof v === "string" ? v : JSON.stringify(v))}`;
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
