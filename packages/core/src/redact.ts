import type { Io } from "./io.js";
import type { CompiledPolicy } from "./policy.js";

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
 * Redaction by value shape: a value of the product's signed shape is replaced, wherever it appears
 * in a string, by `<prefix>:h:<hash>` where the prefix is the shape's first capture group (the
 * product's own key prefix) or `v`. Field names leak signed values under unexpected names; shapes
 * do not.
 */
export async function redactString(value: string, policy: CompiledPolicy, io: Io): Promise<string> {
  let out = value;
  // Most strings hold no secret: they skip the hashing and its await (search leaves the shared lastIndex alone).
  for (const re of policy.shapes) if (out.search(re) !== -1) out = await hashMatches(out, re, io, (m, hash) => `${m[1] ?? "v"}:h:${hash}`);
  return out;
}

/**
 * Redaction by field name, recursively: a field the policy names as a secret becomes `h:<hash>`;
 * a field the policy names as a uri field has its named parameter, in the query or the fragment,
 * hashed in place; every string is then redacted by shape.
 */
export async function redact(value: unknown, policy: CompiledPolicy, io: Io): Promise<unknown> {
  if (typeof value === "string") return redactString(value, policy, io);
  if (Array.isArray(value)) return Promise.all(value.map((v) => redact(v, policy, io)));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const param = policy.uriFields.get(k);
      if (policy.secretFields.has(k) && typeof v === "string" && v.length > 0) out[k] = `h:${await io.hash(v)}`;
      else if (param && typeof v === "string") out[k] = await redactString(await hashMatches(v, param, io, (_, hash) => `h:${hash}`), policy, io);
      else out[k] = await redact(v, policy, io);
    }
    return out;
  }
  return value;
}

/** A hashed value as it appears in a redacted body (`h:<hash>` or `<prefix>:h:<hash>`), or null. */
export function hashedValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^(?:[A-Za-z0-9_-]+:)?h:([0-9a-f]{12})$/.exec(value);
  return m ? (m[1] ?? null) : null;
}
