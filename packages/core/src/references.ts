import type { Io } from "./io.js";

/** The reference alphabet: base32 without I, L, O and U, so a reference survives being read aloud or retyped. */
export const B32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const REFERENCE = /^[0-9A-HJKMNP-TV-Z]{8}$/;

/**
 * Eight characters: three encode the minting minute (modulo 32^3), four are random, one is a
 * check character, so validity needs no state and a mutation is detectable.
 * Minted per serve of a page, per finder answer, per error link, per helpful 404.
 */
export function mintReference(io: Io): string {
  const minutes = Math.floor(io.now() / 60000) % 32768;
  let body = (B32[(minutes >> 10) & 31] ?? "0") + (B32[(minutes >> 5) & 31] ?? "0") + (B32[minutes & 31] ?? "0");
  for (const b of io.random(4)) body += B32[b % 32] ?? "0";
  let sum = 0;
  for (const ch of body) sum += B32.indexOf(ch);
  return body + (B32[sum % 32] ?? "0");
}

/** Whether a value has the reference shape and its check character holds. */
export function isReference(value: string): boolean {
  if (!REFERENCE.test(value)) return false;
  let sum = 0;
  for (const ch of value.slice(0, 7)) sum += B32.indexOf(ch);
  return B32[sum % 32] === value[7];
}

/**
 * The first reference the policy's query parameters carry: a value is a reference only when its
 * shape and check character hold. Anything else in a reference parameter (a device user code in
 * `code=` on a sign-in page) is not a reference and is not recorded as one; the device door's
 * fields carry it as `scope.key.user_code` where the policy names it.
 */
export function findReference(url: URL, referenceParams: readonly string[]): string {
  return referenceParams.map((name) => url.searchParams.get(name)).find((v): v is string => v !== null && isReference(v)) ?? "";
}
