import type { Io } from "./io.js";
import type { CompiledPolicy } from "./policy.js";
import { redact } from "./redact.js";

export const RECORD_SCHEMA = "scope.request/1";
export const DECLARATION_SCHEMA = "scope.declaration/1";
export const POLICY_SCHEMA = "scope.policy/1";
export const BODY_LIMIT = 65536;

export interface ReadBody {
  /** The parsed, redacted body: JSON, a form, `{bytes, type}` for text or HTML, `{bytes, unparsed: true}` for JSON that did not parse. */
  parsed: Record<string, unknown> | unknown[];
  bytes: number;
  truncated: boolean;
}

/**
 * A body as the record keeps it: JSON or a form parsed and redacted by field and by shape, capped
 * at 64 KB; a text or HTML body is `{bytes, type}` and nothing else (architecture §7.6).
 */
export async function readBody(text: string, contentType: string, policy: CompiledPolicy, io: Io): Promise<ReadBody> {
  const truncated = text.length > BODY_LIMIT;
  const slice = truncated ? text.slice(0, BODY_LIMIT) : text;
  let parsed: unknown = null;
  if (/json/.test(contentType)) {
    try {
      parsed = JSON.parse(slice);
    } catch {
      parsed = null;
    }
  } else if (/x-www-form-urlencoded/.test(contentType)) parsed = Object.fromEntries(new URLSearchParams(slice));
  else parsed = { bytes: text.length, type: contentType.split(";")[0] ?? "" };
  if (parsed === null) return { parsed: { bytes: text.length, unparsed: true }, bytes: text.length, truncated };
  const redacted = await redact(parsed, policy, io);
  return { parsed: (redacted && typeof redacted === "object" ? redacted : { value: redacted }) as ReadBody["parsed"], bytes: text.length, truncated };
}

const hex = (bytes: Uint8Array): string => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/** A UUIDv7: 48 bits of the clock, the version, 74 bits of the adapter's entropy. The record's identity and its idempotency key. */
export function uuidv7(io: Io): string {
  const ms = io.now();
  const rand = io.random(10);
  const time = new Uint8Array(6);
  let t = ms;
  for (let i = 5; i >= 0; i -= 1) {
    time[i] = t % 256;
    t = Math.floor(t / 256);
  }
  const bytes = new Uint8Array(16);
  bytes.set(time, 0);
  bytes.set(rand, 6);
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** A UUIDv4-shaped id from the adapter's entropy (the gate's session id when the client sent none). */
export function uuidv4(io: Io): string {
  const bytes = io.random(16);
  bytes[6] = 0x40 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const iso = (ms: number): string => new Date(ms).toISOString();
