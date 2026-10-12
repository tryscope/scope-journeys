// The repository's lint, dependency-free so it runs everywhere `node` does. Four rules the
// packages promise their readers (a customer's security review and a customer's coding agent
// both read what lands in node_modules):
//   1. the shipped core reads as its source: no `any`, no `eval`, no dynamic `require`, no
//      minification step (the build is `tsc` only; this checks the sources);
//   2. the core runs on the plain Workers runtime: no `node:` import and no Node global
//      (`process`, `Buffer`) outside `src/cli`, which is the Node-only bin;
//   3. nothing a customer reads carries an em dash (documents, READMEs, CLI strings, docs);
//   4. nothing in the repository names the lab (D17: the public repository holds only the core,
//      the adapters, the CLI and synthetic fixtures). The leak test in test/privacy covers the
//      fixtures directory layout; this rule covers every tracked file.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const violations = [];

const sources = tracked.filter((f) => /^packages\/[^/]+\/src\/.*\.ts$/.test(f) && !f.includes("/generated/"));
for (const file of sources) {
  const text = readFileSync(`${ROOT}${file}`, "utf8");
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  // String literals are not code: the CLI prints a `require` line for a CommonJS app's entry file.
  const unquoted = code.replace(/"[^"]*"|'[^']*'|`[^`]*`/g, "");
  if (/\bany\b/.test(unquoted)) violations.push(`${file}: uses \`any\``);
  if (/\beval\s*\(/.test(unquoted)) violations.push(`${file}: uses eval`);
  if (/\brequire\s*\(/.test(unquoted)) violations.push(`${file}: uses require`);
  const inCli = /\/src\/cli\//.test(file);
  const inCore = /^packages\/core\/src\//.test(file) && !inCli;
  if (inCore) {
    for (const match of code.matchAll(/from\s+["']node:[^"']+["']/g)) violations.push(`${file}: imports ${match[0]} (the core runs on the plain Workers runtime)`);
    if (/\bprocess\.\w+/.test(code)) violations.push(`${file}: reads \`process\` (the core has no Node globals)`);
    if (/\bBuffer\b/.test(code)) violations.push(`${file}: uses \`Buffer\` (the core has no Node globals)`);
  }
}

const customerRead = tracked.filter((f) => /\.(md|txt)$/.test(f) || /^packages\/[^/]+\/src\/.*\.ts$/.test(f) || /^docs\//.test(f));
for (const file of customerRead) {
  if (file === "LICENSE") continue;
  const text = readFileSync(`${ROOT}${file}`, "utf8");
  const lines = text.split("\n");
  lines.forEach((line, index) => {
    if (line.includes("—")) violations.push(`${file}:${index + 1}: em dash`);
  });
}

for (const file of tracked) {
  if (file === "scripts/lint.mjs") continue;
  const text = readFileSync(`${ROOT}${file}`, "latin1");
  // Spelled in two halves so the lint does not name the lab either.
  if (new RegExp(["relay", "braid"].join(""), "i").test(text)) violations.push(`${file}: names the lab (D17)`);
}

if (violations.length > 0) {
  console.error("lint: violations");
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`lint: ${tracked.length} tracked files clean`);
