import type { Io } from "./io.js";
import type { CompiledPolicy } from "./policy.js";

/**
 * Redaction by value shape: a value of the product's signed shape is replaced, wherever it appears
 * in a string, by `<prefix>:h:<hash>` where the prefix is the shape's first capture group (the
 * product's own key prefix) or `v`. Field names leak (Program 5: 435 signed values in 15,194
 * events until shape hashing, 0 after); shapes do not.
 */
export async function redactString(value: string, policy: CompiledPolicy, io: Io): Promise<string> {
  let out = value;
  for (const re of policy.shapes) {
    re.lastIndex = 0;
    if (!re.test(out)) continue;
    const parts: string[] = [];
    let last = 0;
    re.lastIndex = 0;
    for (const m of out.matchAll(re)) {
      parts.push(out.slice(last, m.index), `${m[1] ?? "v"}:h:${await io.hash(m[0])}`);
      last = m.index + m[0].length;
    }
    parts.push(out.slice(last));
    out = parts.join("");
  }
  return out;
}

/**
 * Redaction by field name, recursively: a field the policy names as a secret becomes `h:<hash>`;
 * a field the policy names as a uri field has its named query parameter hashed in place; every
 * string is then redacted by shape.
 */
export async function redact(value: unknown, policy: CompiledPolicy, io: Io): Promise<unknown> {
  if (typeof value === "string") return redactString(value, policy, io);
  if (Array.isArray(value)) return Promise.all(value.map((v) => redact(v, policy, io)));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const param = policy.uriFields[k];
      if (policy.secretFields.has(k) && typeof v === "string" && v.length > 0) out[k] = `h:${await io.hash(v)}`;
      else if (param && typeof v === "string") out[k] = v.replace(new RegExp(`${param}=[^&]+`), `${param}=h:${await io.hash(new RegExp(`${param}=([^&]+)`).exec(v)?.[1] ?? "")}`);
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
