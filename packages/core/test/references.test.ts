// The eight-character reference: minted with a check character, recognised by
// shape and check character, and found in a request only when both hold.
import assert from "node:assert/strict";
import { test } from "node:test";

import { B32, REFERENCE, findReference, isReference, mintReference } from "../src/references.js";

const io = { now: () => Date.parse("2026-10-10T12:00:00.000Z"), random: (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255) };

test("a minted reference has the shape and its check character holds", () => {
  const ref = mintReference(io as never);
  assert.match(ref, REFERENCE);
  assert.ok(isReference(ref));
  let sum = 0;
  for (const ch of ref.slice(0, 7)) sum += B32.indexOf(ch);
  assert.equal(ref[7], B32[sum % 32]);
});

test("isReference refuses the right shape with the wrong check character, and any other shape", () => {
  assert.ok(isReference("ABCDEFGV"), "A to G sum to 91, 91 mod 32 is 27, V");
  assert.equal(isReference("ABCDEFGH"), false, "the shape holds, the check character does not");
  assert.equal(isReference("ABCD-EFGH"), false, "a device user code");
  assert.equal(isReference("abcdefgv"), false, "lower case");
  assert.equal(isReference("ABCDEFG"), false);
});

test("findReference takes the first parameter whose value is a reference and skips the rest", () => {
  const params = ["ref", "code"];
  assert.equal(findReference(new URL("https://acme.example/docs?ref=ABCDEFGV"), params), "ABCDEFGV");
  assert.equal(findReference(new URL("https://acme.example/device?code=ABCD-EFGH"), params), "", "a user code in a reference parameter is not a reference");
  assert.equal(findReference(new URL("https://acme.example/device?code=ABCDEFGH"), params), "", "the check character decides, not the shape alone");
  assert.equal(findReference(new URL("https://acme.example/device?code=ABCD-EFGH&ref=ABCDEFGV"), params), "ABCDEFGV", "a later parameter still counts");
  assert.equal(findReference(new URL("https://acme.example/docs"), params), "");
});
