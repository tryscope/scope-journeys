// The OTLP schema files the docs host serves at /schemas/<version>: every file
// under docs/schemas/ is an OpenTelemetry schema file whose schema_url is the URL the docs host
// serves it at, and the running host (DOCS_URL) serves it as YAML.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const BASE = (process.env.DOCS_URL ?? "http://127.0.0.1:3917").replace(/\/$/, "");
const DOCS = new URL("../", import.meta.url).pathname;
const PUBLISHED_ORIGIN = "https://journeys.tryscope.com";
const FILES = readdirSync(join(DOCS, "schemas")).filter((name) => name.endsWith(".yaml")).sort();

test("every schema file names its own published URL and the file format", () => {
  assert.ok(FILES.length >= 1, "docs/schemas holds at least one version");
  for (const name of FILES) {
    const version = name.replace(/\.yaml$/, "");
    assert.match(version, /^\d+\.\d+\.\d+$/, name);
    const text = readFileSync(join(DOCS, "schemas", name), "utf8");
    assert.match(text, /^file_format: 1\.1\.0$/m, `${name} is an OpenTelemetry schema file`);
    assert.ok(text.includes(`schema_url: ${PUBLISHED_ORIGIN}/schemas/${version}\n`), `${name} names ${PUBLISHED_ORIGIN}/schemas/${version}`);
    assert.match(text, new RegExp(`^versions:\\n(?:.*\\n)*?  ${version.replaceAll(".", "\\.")}:`, "m"), `${name} lists its own version`);
  }
});

test("the host serves every schema file as YAML at /schemas/<version>, and nothing else under /schemas", async () => {
  for (const name of FILES) {
    const version = name.replace(/\.yaml$/, "");
    const response = await fetch(`${BASE}/schemas/${version}`);
    assert.equal(response.status, 200, `/schemas/${version}`);
    assert.match(response.headers.get("content-type") ?? "", /^application\/yaml/);
    assert.equal(await response.text(), readFileSync(join(DOCS, "schemas", name), "utf8"));
  }
  const missing = await fetch(`${BASE}/schemas/9.9.9`);
  assert.equal(missing.status, 404);
  const traversal = await fetch(`${BASE}/schemas/..%2Fpackage.json`);
  assert.equal(traversal.status, 404);
});
