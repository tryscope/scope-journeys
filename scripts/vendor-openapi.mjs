// Vendors the Journeys subset of Scope's OpenAPI document into the CLI (plan D19, J2.1): the CLI is
// an external caller of the public API, typed against one pinned version of the contract, never
// against the private contract package. Usage:
//   node scripts/vendor-openapi.mjs [--source <openapi.json>] [--check]
// The source defaults to JOURNEYS_OPENAPI_SOURCE, else the monorepo's generated document beside
// this repository. Only the Journeys resources are kept, with the component schemas they reference
// (transitively), and the document is stamped with the contract version it came from.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const target = join(root, "packages", "core", "src", "cli", "openapi.journeys.json");
const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source");
const source = sourceIndex >= 0 ? resolve(args[sourceIndex + 1]) : process.env.JOURNEYS_OPENAPI_SOURCE ?? join(root, "..", "scope-journeys", "packages", "contract", "generated", "openapi.json");
const check = args.includes("--check");

const KEEP = /^\/v1\/(requests|installs|policies|journeys|visits|intents)(\/|$)/;

function refsIn(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => refsIn(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "$ref" && typeof v === "string") out.add(v);
      else refsIn(v, out);
    }
  }
  return out;
}

function vendored(document) {
  const paths = Object.fromEntries(Object.entries(document.paths ?? {}).filter(([path]) => KEEP.test(path)).sort(([a], [b]) => (a < b ? -1 : 1)));
  const components = document.components ?? {};
  const kept = {};
  const queue = [...refsIn(paths)];
  while (queue.length) {
    const ref = queue.shift();
    const m = /^#\/components\/([^/]+)\/(.+)$/.exec(ref);
    if (!m) continue;
    const [, kind, name] = m;
    if (kept[kind]?.[name]) continue;
    const entry = components[kind]?.[name];
    if (entry === undefined) throw new Error(`${ref} is referenced but not defined in the source document`);
    (kept[kind] ??= {})[name] = entry;
    for (const inner of refsIn(entry)) queue.push(inner);
  }
  for (const kind of Object.keys(kept)) kept[kind] = Object.fromEntries(Object.entries(kept[kind]).sort(([a], [b]) => (a < b ? -1 : 1)));
  return {
    openapi: document.openapi,
    info: { ...document.info, title: "Scope Journeys (the public API's Journeys resources)", "x-journeys-vendored-from": { contract_version: document.info?.version ?? null } },
    paths,
    components: kept,
  };
}

const document = JSON.parse(readFileSync(source, "utf8"));
const text = `${JSON.stringify(vendored(document), null, 2)}\n`;
if (check) {
  const current = readFileSync(target, "utf8");
  if (current !== text) {
    console.error("packages/core/src/cli/openapi.journeys.json is stale against the source document: run node scripts/vendor-openapi.mjs");
    process.exit(1);
  }
  console.log("openapi.journeys.json current");
} else {
  writeFileSync(target, text);
  const paths = Object.keys(JSON.parse(text).paths).length;
  console.log(`wrote packages/core/src/cli/openapi.journeys.json: ${paths} paths from contract ${document.info?.version ?? "?"}`);
}
