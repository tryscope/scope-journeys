// The signed fixtures are committed current (scripts/sign-webbotauth.mjs --write): the synthetic signer's key is derived from a fixed seed, so the files reproduce.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { serialize, variants } from "../../scripts/sign-webbotauth.mjs";

const SYNTHETIC = new URL("../../fixtures/synthetic/", import.meta.url).pathname;

test("the five Web Bot Auth fixtures carry the request and directory the signer script produces", () => {
  for (const [name, files] of Object.entries(variants())) {
    assert.equal(readFileSync(join(SYNTHETIC, name, "request.json"), "utf8"), serialize(files.request), `${name}/request.json is stale: node scripts/sign-webbotauth.mjs --write`);
    assert.equal(readFileSync(join(SYNTHETIC, name, "directory.json"), "utf8"), serialize(files.directory), `${name}/directory.json is stale`);
  }
});
