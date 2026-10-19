// No secret in a policy. The policy is a public document; every
// policy the repository holds, and the embedded default, must scan clean, and the one planted
// install key in the leak fixture must be found at exactly its path.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { defaultPolicy } from "../../packages/core/src/policy.js";
import { findSecretShapedValues, validatePolicy } from "../../packages/core/src/validate.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const SYNTHETIC = join(ROOT, "fixtures", "synthetic");

function policies(): Array<{ name: string; document: unknown }> {
  const out: Array<{ name: string; document: unknown }> = [];
  for (const file of readdirSync(SYNTHETIC).filter((f) => /^policy.*\.json$/.test(f))) out.push({ name: file, document: JSON.parse(readFileSync(join(SYNTHETIC, file), "utf8")) });
  for (const dir of readdirSync(SYNTHETIC, { withFileTypes: true })) {
    if (!dir.isDirectory() || !/^\d\d-/.test(dir.name)) continue;
    const document = JSON.parse(readFileSync(join(SYNTHETIC, dir.name, "policy.json"), "utf8")) as { $ref?: string };
    if (!document.$ref) out.push({ name: `${dir.name}/policy.json`, document });
  }
  out.push({ name: "defaultPolicy", document: defaultPolicy });
  return out;
}

test("no policy in the repository, and not the embedded default, holds a secret-shaped value", () => {
  const found: string[] = [];
  for (const { name, document } of policies()) {
    for (const finding of findSecretShapedValues(document)) found.push(`${name}: ${finding.path} ${finding.message}`);
  }
  assert.deepEqual(found, []);
  console.log(`${policies().length} policies scanned, 0 findings`);
});

test("the planted install key in the leak fixture is found at exactly its path, and the policy is refused", () => {
  const document = JSON.parse(readFileSync(join(SYNTHETIC, "leak", "policy-with-secret.json"), "utf8"));
  const findings = findSecretShapedValues(document);
  assert.equal(findings.length, 1, JSON.stringify(findings));
  assert.equal(findings[0]?.path, "/forward/headers/x-acme-edge");
  const validation = validatePolicy(document);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((e) => e.path === "/forward/headers/x-acme-edge"), "validatePolicy refuses the document on the planted value");
  assert.ok(!JSON.stringify(validation.errors).includes("sjk_live_planted"), "the finding names the path, never the value");
});
