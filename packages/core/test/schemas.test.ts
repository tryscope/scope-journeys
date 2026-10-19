// The schemas as code. The record and policy majors cannot drift from the files, the
// generated types and validators are committed current, the shipped validators carry no
// runtime dependency, and the policy validator refuses a secret-shaped value.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { DECLARATION_SCHEMA, POLICY_SCHEMA, RECORD_SCHEMA } from "../src/record.js";
import { findSecretShapedValues, validatePolicy, validateRecord } from "../src/validate.js";
import { defaultPolicy } from "../src/policy.js";

const CORE = new URL("../", import.meta.url).pathname;
const ROOT = join(CORE, "..", "..");
const schema = (name: string): { $id: string; properties: Record<string, { const?: string }> } => JSON.parse(readFileSync(join(CORE, "schemas", `${name}.json`), "utf8"));

/** `scope.<name>/<major>` from a schema's `$id` `https://journeys.tryscope.com/schemas/journeys/<major>/<name>`. */
const schemaIdOf = (id: string): string => {
  const [major, name] = id.split("/").slice(-2);
  return `scope.${name}/${major}`;
};

test("the record, declaration and policy schema ids equal their files' $id", () => {
  assert.equal(schemaIdOf(schema("request").$id), RECORD_SCHEMA);
  assert.equal(schemaIdOf(schema("declaration").$id), DECLARATION_SCHEMA);
  assert.equal(schemaIdOf(schema("policy").$id), POLICY_SCHEMA);
  assert.equal(schema("request").properties.schema?.const, RECORD_SCHEMA);
  assert.equal(schema("declaration").properties.schema?.const, DECLARATION_SCHEMA);
  assert.equal(schema("policy").properties.schema?.const, POLICY_SCHEMA);
});

// The generator writes into a scratch directory, never into src/generated: the other test files run
// in parallel processes and import validators.js, and an in-place rewrite mid-run made that import
// fail with a missing export.
test("the generated types, validators and TELEMETRY.md are committed current", () => {
  const scratch = mkdtempSync(join(tmpdir(), "journeys-generated-"));
  try {
    execFileSync("node", [join(ROOT, "scripts", "types-from-schemas.mjs"), "--out", scratch], { cwd: CORE, stdio: "pipe" });
    const committed = join(CORE, "src", "generated");
    const stale = readdirSync(scratch).filter((name) => !existsSync(join(committed, name)) || !readFileSync(join(committed, name)).equals(readFileSync(join(scratch, name))));
    assert.deepEqual(stale, [], "generated files are stale: run `npm run generate -w scope-journeys` and commit");
    execFileSync("node", [join(ROOT, "scripts", "telemetry-doc.mjs"), "--check"], { cwd: CORE, stdio: "pipe" });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("the shipped validators carry no runtime dependency", () => {
  const code = readFileSync(join(CORE, "src", "generated", "validators.js"), "utf8");
  assert.doesNotMatch(code, /\brequire\s*\(/);
  assert.doesNotMatch(code, /^\s*import\s/m);
  assert.match(code, /export const validateRequest/);
  assert.match(code, /export const validatePolicy/);
});

test("validatePolicy accepts the toy policy and the embedded default, and names the path of a planted secret", () => {
  const toy = JSON.parse(readFileSync(join(ROOT, "fixtures", "synthetic", "policy.json"), "utf8"));
  assert.deepEqual(validatePolicy(toy).errors, []);
  assert.deepEqual(validatePolicy(defaultPolicy).errors, []);
  const planted = structuredClone(toy);
  planted.forward.headers["x-acme-edge"] = "sjk_live_0123456789abcdefghijklmnopqrstuv";
  const result = validatePolicy(planted);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map((e) => e.path), ["/forward/headers/x-acme-edge"]);
  assert.deepEqual(findSecretShapedValues({ a: { token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig" } }).map((f) => f.path), ["/a/token"]);
});

test("validatePolicy tolerates an absent schema field as a warning and refuses an unknown one", () => {
  const toy = JSON.parse(readFileSync(join(ROOT, "fixtures", "synthetic", "policy.json"), "utf8"));
  delete toy.schema;
  const absent = validatePolicy(toy);
  assert.equal(absent.ok, true);
  assert.deepEqual(absent.warnings.map((w) => w.path), ["/schema"]);
  toy.schema = "scope.policy/9";
  assert.equal(validatePolicy(toy).ok, false);
});

test("validateRecord validates every record of the committed fixtures and refuses an unknown schema", () => {
  const fixtures = execFileSync("ls", [join(ROOT, "fixtures", "synthetic")], { encoding: "utf8" }).split("\n").filter((n) => /^\d\d-/.test(n));
  let records = 0;
  for (const name of fixtures) {
    const expected = JSON.parse(readFileSync(join(ROOT, "fixtures", "synthetic", name, "expected.json"), "utf8"));
    for (const record of expected.records) {
      // The mask replaced the volatile values; put well-formed ones back on the fields the record carries
      // (a declaration has no observed_ts and no timing: the schema forbids them).
      const unmasked = { ...record, id: "01999999-9999-7999-8999-999999999999", ts: "2026-10-10T12:00:00.000Z" };
      if ("observed_ts" in unmasked) unmasked.observed_ts = "2026-10-10T12:00:00.000Z";
      if ("scope.timing" in unmasked) unmasked["scope.timing"] = { origin_ms: 1, total_ms: 2 };
      if (unmasked.request === "MASKED") unmasked.request = "01999999-9999-7999-8999-999999999999";
      if (unmasked.request_id === "MASKED") unmasked.request_id = "x";
      if (unmasked["scope.reference_minted"] === "MASKED") unmasked["scope.reference_minted"] = "8PGMYM8W";
      if (unmasked["scope.page"]?.reference_minted === "MASKED") unmasked["scope.page"] = { ...unmasked["scope.page"], reference_minted: "8PGMYM8W" };
      assert.deepEqual(validateRecord(unmasked).errors, [], `${name}: ${record.schema}`);
      records += 1;
    }
  }
  assert.ok(records >= 24, `expected at least one record per fixture, saw ${records}`);
  assert.equal(validateRecord({ schema: "scope.request/2" }).ok, false);
});
