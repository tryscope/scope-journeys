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
// A name=value pair in a URL or free text, read twice without consuming the value a name sits in,
// so pairs nested at any depth are reached: on the raw text, where a value runs to the next raw &,
// # or space with its own escapes kept (`password=%26...`); and on the text with its ASCII escapes
// decoded but whitespace escapes kept, where a name an encoded separator hid is found. A name may
// start after `=` or an encoded space too (a pair carried as a value: `params=token%3D...`).
const NAME = /(?<=^|[?&#\s=]|%20|%0[9a-d])((?:[^?&#\s=%]|%(?!20|0[9a-d]))+)=/gi;
const VALUE = /[^&#\s]*/y;
const NON_SPACE_ESCAPE = /%(?!20|0[9a-d])[0-7][0-9a-f]/gi;
// A pair's name as the origin reads it: its ASCII escapes decoded (which cannot throw), and the part
// after the last separator an encoded one hid (`b%26code` names `code`).
const nameOf = (raw: string): string =>
  raw
    .replace(/%[0-7][0-9a-f]/gi, (escape) => String.fromCharCode(parseInt(escape.slice(1), 16)))
    .toLowerCase()
    .split(/[?&#\s]/)
    .pop() ?? "";

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
  const spans = /=|%3d/i.test(value) ? secretSpans(value, policy) : [];
  // Past 64 secret values the string is one hash, so the secret names cost a bounded number of hashes per string.
  if (spans.length > 64) out = `h:${await io.hash(value)}`;
  else if (spans.length) {
    const hashes = await Promise.all(spans.map(([start, end]) => io.hash(value.slice(start, end))));
    out = "";
    let last = 0;
    spans.forEach(([start, end], i) => {
      out += `${value.slice(last, start)}h:${hashes[i]}`;
      last = end;
    });
    out += value.slice(last);
  }
  // Most strings hold no secret: they skip the hashing and its await (search leaves the shared lastIndex alone).
  for (const re of policy.shapes) if (out.search(re) !== -1) out = await hashMatches(out, re, io, (m, hash) => `${m[1] ?? "v"}:h:${hash}`);
  return out;
}

/** Whether a pair's value is left as sent: empty, already hashed, or a valid reference where the policy says references travel. */
const kept = (name: string, value: string, policy: CompiledPolicy): boolean => !value || hashedValue(value) !== null || (policy.referenceNames.has(name) && isReference(value));

/**
 * The [start, end) of the secret values `text` holds, mapped through `at` to the raw string. The name
 * is checked before the value is read, and the names inside a value already found are skipped, so
 * the scan stays linear.
 */
function scanPairs(text: string, at: (position: number) => number, policy: CompiledPolicy): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let last = 0;
  for (const m of text.matchAll(NAME)) {
    const start = m.index + m[0].length;
    if (start < last) continue;
    const name = nameOf(m[1] ?? "");
    if (!SECRET_FIELDS.has(bare(name))) continue;
    VALUE.lastIndex = start;
    const value = VALUE.exec(text)?.[0] ?? "";
    if (kept(name, value, policy)) continue;
    last = start + value.length;
    spans.push([at(start), at(last)]);
  }
  return spans;
}

/** The raw [start, end) of every secret value in `text`, from both readings, overlapping or touching spans merged. */
function secretSpans(text: string, policy: CompiledPolicy): Array<[number, number]> {
  const spans = scanPairs(text, (position) => position, policy);
  // The decoded text, and for each of its positions the raw position it came from (one more for the end).
  let decoded = "";
  const from: number[] = [];
  let raw = 0;
  const copy = (until: number): void => {
    decoded += text.slice(raw, until);
    for (; raw < until; raw += 1) from.push(raw);
  };
  for (const m of text.matchAll(NON_SPACE_ESCAPE)) {
    copy(m.index);
    decoded += String.fromCharCode(parseInt(m[0].slice(1), 16));
    from.push(m.index);
    raw = m.index + m[0].length;
  }
  if (raw > 0) {
    copy(text.length);
    from.push(text.length);
    spans.push(...scanPairs(decoded, (position) => from[position] ?? text.length, policy));
  }
  spans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (previous && span[0] <= previous[1]) previous[1] = Math.max(previous[1], span[1]);
    else merged.push(span);
  }
  return merged;
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
