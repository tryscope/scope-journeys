// Generates, from the four JSON Schema files the sensor ships (packages/core/schemas/*.json):
//   1. the TypeScript types in packages/core/src/generated/<name>.ts (json-schema-to-typescript);
//   2. the standalone validators in packages/core/src/generated/validators.js (ajv's code
//      generation, ESM, every format inlined as a regular expression), so the shipped core needs
//      no validator library at runtime and holds no require().
// Run by `npm run build` before tsc; the generated files are committed and a test regenerates them
// into a temporary directory (`--out <dir>`) and compares, so a stale commit fails CI without the
// test ever rewriting the files that the other test processes are importing.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import { compile } from "json-schema-to-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const core = join(here, "..", "packages", "core");
const schemasDir = join(core, "schemas");
const outFlag = process.argv.indexOf("--out");
const out = outFlag > 0 && process.argv[outFlag + 1] ? resolve(process.argv[outFlag + 1]) : join(core, "src", "generated");
mkdirSync(out, { recursive: true });

const NAMES = { request: "ScopeRequest1", declaration: "ScopeDeclaration1", decision: "ScopeDecision1", policy: "ScopePolicy1" };
const schemas = Object.fromEntries(Object.keys(NAMES).map((name) => [name, JSON.parse(readFileSync(join(schemasDir, `${name}.json`), "utf8"))]));

// 1. Types.
for (const [name, typeName] of Object.entries(NAMES)) {
  const ts = await compile(schemas[name], typeName, {
    bannerComment: `/* Generated from schemas/${name}.json by scripts/types-from-schemas.mjs. Do not edit. */`,
    additionalProperties: false,
    strictIndexSignatures: false,
    style: { semi: true, singleQuote: false, printWidth: 110 },
  });
  writeFileSync(join(out, `${name}.ts`), ts);
}

// 2. Validators. Formats are regular expressions here on purpose: ajv-formats would be a
// runtime dependency of the generated code, and the core ships with none.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false, allowUnionTypes: true, code: { source: true, esm: true, lines: true } });
ajv.addFormat("uuid", /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
ajv.addFormat("date-time", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/);
for (const name of Object.keys(NAMES)) ajv.addSchema(schemas[name], schemas[name].$id);
const code = standaloneCode(ajv, {
  validateRequest: schemas.request.$id,
  validateDeclaration: schemas.declaration.$id,
  validateDecision: schemas.decision.$id,
  validatePolicy: schemas.policy.$id,
});
if (/\brequire\s*\(/.test(code)) throw new Error("the generated validators carry a require(); the core must ship without a runtime dependency");
writeFileSync(join(out, "validators.js"), `/* Generated from schemas/*.json by scripts/types-from-schemas.mjs (ajv standalone, ESM). Do not edit. */\n${code}`);
console.log(`generated: ${Object.keys(NAMES).map((n) => `${n}.ts`).join(", ")}, validators.js`);
