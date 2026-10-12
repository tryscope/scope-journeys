// The assertion fixture's facts.json is committed current (scripts/assertion-fixture-key.mjs --write): the key pair is derived from a fixed seed, so the file reproduces.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { fixtureFacts, serialize } from "../../scripts/assertion-fixture-key.mjs";

const SYNTHETIC = new URL("../../fixtures/synthetic/", import.meta.url).pathname;

test("30-assertion-signed/facts.json carries the key the script derives", () => {
  assert.equal(readFileSync(join(SYNTHETIC, "30-assertion-signed", "facts.json"), "utf8"), serialize(fixtureFacts()), "stale: node scripts/assertion-fixture-key.mjs --write");
});
