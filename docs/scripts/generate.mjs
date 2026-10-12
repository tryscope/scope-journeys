// The docs build's generation step: the pages derived from the repository land in
// `content/generated/` (ignored by git, regenerated on every build), and every page the registry
// names must exist. `--published` also checks the OpenAPI document against the CLI on the registry.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { apiReference } from "./api-reference.mjs";

const DOCS = new URL("../", import.meta.url).pathname;
const ROOT = join(DOCS, "..");
const GENERATED = join(DOCS, "content", "generated");
mkdirSync(GENERATED, { recursive: true });

const read = (path) => {
  if (!existsSync(path)) throw new Error(`generate: ${path} is missing`);
  return readFileSync(path, "utf8");
};

writeFileSync(join(GENERATED, "telemetry.md"), read(join(ROOT, "packages/core/TELEMETRY.md")));
writeFileSync(join(GENERATED, "security.md"), read(join(ROOT, "SECURITY.md")));
writeFileSync(join(GENERATED, "changelog.md"), read(join(ROOT, "CHANGELOG.md")));
writeFileSync(join(GENERATED, "deprecation.md"), read(join(ROOT, "DEPRECATION.md")));
// Served at /SKILL.md; the package's copy is the source and the smoke test checks the two are equal.
writeFileSync(join(GENERATED, "SKILL.md"), read(join(ROOT, "packages/core/SKILL.md")));
writeFileSync(join(GENERATED, "api.md"), `${apiReference({ published: process.argv.includes("--published") })}\n`);

const pages = JSON.parse(read(join(DOCS, "lib", "pages.json")));
const missing = pages.filter((p) => !existsSync(p.source.kind === "generated" ? join(GENERATED, p.source.file) : join(DOCS, "content", p.source.file)));
if (missing.length) throw new Error(`generate: pages without a source file: ${missing.map((p) => p.slug || "/").join(", ")}`);
console.log(`generate: ${pages.length} pages, ${pages.filter((p) => p.source.kind === "generated").length} generated, SKILL.md copied`);
