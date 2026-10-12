// The derived fixture policies are committed current (scripts/fixture-policies.mjs --write).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { serialize, variants } from "../../scripts/fixture-policies.mjs";

const SYNTHETIC = new URL("../../fixtures/synthetic/", import.meta.url).pathname;

test("policy.dryrun.json and policy.gate-closed.json are derived from policy.json and current", () => {
  for (const [name, document] of Object.entries(variants())) {
    assert.equal(readFileSync(join(SYNTHETIC, name), "utf8"), serialize(document), `fixtures/synthetic/${name} is stale: node scripts/fixture-policies.mjs --write`);
  }
});
