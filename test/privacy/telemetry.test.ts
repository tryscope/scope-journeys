// V10, test three: TELEMETRY.md says exactly what the sensor records. The committed document is
// regenerated and diffed (a stale commit fails), every field of scope.request/1 appears in it, and
// every field name in it is a property of one of the two record schemas or a section of the policy.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = new URL("../../", import.meta.url).pathname;
const CORE = join(ROOT, "packages", "core");

const request = JSON.parse(readFileSync(join(CORE, "schemas", "request.json"), "utf8")) as { properties: Record<string, { properties?: Record<string, unknown> }> };
const declaration = JSON.parse(readFileSync(join(CORE, "schemas", "declaration.json"), "utf8")) as { properties: Record<string, unknown> };
const policy = JSON.parse(readFileSync(join(CORE, "schemas", "policy.json"), "utf8")) as { properties: Record<string, unknown> };
const document = readFileSync(join(CORE, "TELEMETRY.md"), "utf8");

test("TELEMETRY.md is the generator's output, not a hand edit (regenerate and diff)", () => {
  const out = execFileSync(process.execPath, [join(ROOT, "scripts", "telemetry-doc.mjs"), "--check"], { cwd: ROOT, encoding: "utf8" });
  assert.match(out, /TELEMETRY\.md current/);
});

test("every field of scope.request/1 appears in TELEMETRY.md, and every documented field exists in a schema", () => {
  const documented = new Set<string>();
  for (const line of document.split("\n")) {
    const m = /^\| `([^`]+)` \|/.exec(line);
    if (m?.[1]) documented.add(m[1]);
  }
  assert.ok(documented.size > 40, `the document lists ${documented.size} fields; expected the record's groups`);

  const missing = Object.keys(request.properties).filter((name) => !documented.has(name));
  assert.deepEqual(missing, [], `fields of scope.request/1 absent from TELEMETRY.md: ${missing.join(", ")}`);

  const known = new Set<string>([...Object.keys(request.properties), ...Object.keys(declaration.properties), ...Object.keys(policy.properties)]);
  for (const [name, p] of Object.entries(request.properties)) for (const sub of Object.keys(p.properties ?? {})) known.add(`${name}.${sub}`);
  const unknown = [...documented].filter((name) => !known.has(name));
  assert.deepEqual(unknown, [], `TELEMETRY.md documents fields no schema has: ${unknown.join(", ")}`);
});

test("TELEMETRY.md carries no em dash and names the lightest form (no bodies)", () => {
  assert.doesNotMatch(document, /—/, "an em dash in a customer-facing document");
  assert.match(document, /in its lightest form it records no bodies at all/);
});
