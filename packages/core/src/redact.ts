import type { Io } from "./io.js";
import type { CompiledPolicy } from "./policy.js";
import { isReference } from "./references.js";

// The names hashed under every policy, the built-in default included: a URL parameter or a body
// field whose last word is one of WORDS (api-key, X-Amz-Security-Token, securityToken) or that is
// one of SECRET_FIELDS in any case and spelling (apikey, ToKeN, Code); in a URL also
// percent-encoded. A valid reference code stays only where the policy says references travel.
const WORDS = new Set(["key", "token", "secret", "password", "signature", "sig"]);
const bare = (name: string): string => name.toLowerCase().replace(/[_-]/g, "");
const SECRET_FIELDS = new Set([...WORDS, "api_key", "access_token", "refresh_token", "id_token", "client_secret", "code", "session_id"].map(bare));
// A `code` the client sends is an OAuth or device code; in an answer it is far more often an error code.
const ANSWER_FIELDS = new Set([...SECRET_FIELDS].filter((name) => name !== "code"));
// Every secret name holds one of these once bare, so most names skip the splitting.
const CANDIDATE = new RegExp([...SECRET_FIELDS, ...WORDS].join("|"));
const ESCAPES = /%[0-7][0-9a-f]/gi;

/**
 * The secret name `name` ends in, or null: its last run of letters, digits, `_` and `-` that holds a
 * letter (`next?code`, `token[0]`, `user[token]`), or the run before its trailing `[...]` keys
 * (`token[a]`), when that run is one of `names` or its last word one of WORDS.
 */
function secretName(name: string, names: ReadonlySet<string>): string | null {
  if (!CANDIDATE.test(bare(name))) return null;
  let outer = name;
  while (outer.endsWith("]") && outer.lastIndexOf("[") > 0) outer = outer.slice(0, outer.lastIndexOf("["));
  for (const side of [name, outer]) {
    const run = side.split(/[^A-Za-z0-9_-]+/).filter((r) => /[A-Za-z]/.test(r)).pop() ?? "";
    const word = run.split(/[_-]|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/).filter((w) => /[A-Za-z]/.test(w)).pop() ?? "";
    if (names.has(bare(run)) || WORDS.has(word.toLowerCase())) return run;
  }
  return null;
}

/**
 * Where the secret in `chunk` starts, or null when it holds none; it runs to the chunk's end. The
 * chunk is read at each raw `=`: a secret's name hides the value after it, and a part that holds an
 * `=` once decoded (base64 padding at its end aside), or is still encoded after four decodings,
 * hides itself from its last `/`, `?` or `;` on.
 */
function secretFrom(chunk: string, policy: CompiledPolicy): number | null {
  const parts = chunk.split("=");
  let at = 0;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] ?? "";
    // Read as the site reads it and as an app that decodes it again would; ASCII escapes cannot throw.
    let read = part;
    for (let n = 0; n < 4 && read.search(ESCAPES) !== -1; n += 1) read = read.replace(ESCAPES, (escape) => String.fromCharCode(parseInt(escape.slice(1), 16)));
    if (read.search(ESCAPES) !== -1 || (read.includes("=") && read.replace(/={1,2}$/, "").includes("="))) {
      const head = part.slice(0, part.search(ESCAPES));
      return at + Math.max(head.lastIndexOf("/"), head.lastIndexOf("?"), head.lastIndexOf(";")) + 1;
    }
    at += part.length + 1;
    const name = i < parts.length - 1 ? secretName(read, SECRET_FIELDS) : null;
    if (name !== null) {
      const sent = chunk.slice(at).trimStart();
      if (!kept(name.toLowerCase(), sent, policy)) return chunk.length - sent.length;
    }
  }
  return null;
}

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
 * Redaction of a string, a URL or free text, in chunks between `&`, `#` and whitespace (a space by an
 * `=` aside): each chunk's secret, as `secretFrom` finds it, becomes `h:<hash>`. Then a value of the
 * product's signed shape is replaced, wherever it appears, by `<prefix>:h:<hash>` where the prefix is
 * the shape's first capture group (the product's own key prefix) or `v`. Field names leak signed
 * values under unexpected names; shapes do not.
 */
export async function redactString(value: string, policy: CompiledPolicy, io: Io): Promise<string> {
  let out = value;
  if (/=|%[0-7][0-9a-f]/i.test(value)) {
    // The odd chunks are the separators.
    const found = value.split(/([&#]|(?<![=\s])\s+(?![=\s]))/).map((chunk, i) => ({ chunk, from: i % 2 ? null : secretFrom(chunk, policy) }));
    const secrets = found.filter(({ from }) => from !== null).length;
    // Past 64 secret values the string is one hash, so the secret names cost a bounded number of hashes per string.
    if (secrets > 64) out = `h:${await io.hash(value)}`;
    else if (secrets) out = (await Promise.all(found.map(async ({ chunk, from }) => (from === null ? chunk : `${chunk.slice(0, from)}h:${await io.hash(chunk.slice(from))}`)))).join("");
  }
  // Most strings hold no secret: they skip the hashing and its await (search leaves the shared lastIndex alone).
  for (const re of policy.shapes) if (out.search(re) !== -1) out = await hashMatches(out, re, io, (m, hash) => `${m[1] ?? "v"}:h:${hash}`);
  return out;
}

/** Whether a pair's value is left as sent: empty, already hashed, or a valid reference where the policy says references travel. */
const kept = (name: string, value: string, policy: CompiledPolicy): boolean => !value || hashedValue(value) !== null || (policy.referenceNames.has(name) && isReference(value));

/**
 * Redaction by field name, recursively: a field the policy names as a secret, or one of the names
 * hashed under every policy unless it is true or false, becomes `h:<hash>` of its string, or of its
 * whole value as JSON otherwise (one hash per field, however large); a field the policy names as a
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
      const name = typeof v === "boolean" ? null : secretName(k, from === "answer" ? ANSWER_FIELDS : SECRET_FIELDS);
      const reference = typeof v === "string" && name !== null && policy.referenceNames.has(name.toLowerCase()) && isReference(v);
      if (v !== null && v !== undefined && v !== "" && (policy.secretFields.has(k) || (name !== null && !reference))) out[k] = `h:${await io.hash(typeof v === "string" ? v : JSON.stringify(v))}`;
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
