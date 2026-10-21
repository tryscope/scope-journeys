// The public repository holds the core, the adapters, the CLI and
// synthetic fixtures, and nothing from the lab: no recorded cell, no real policy, no calibration,
// no fleet file, and no file that names the lab's product. The fixtures directory holds exactly the
// synthetic set, and no tracked or unignored file mentions the lab.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = new URL("../../", import.meta.url).pathname;
// Spelled in two halves so this file does not name the lab either.
const LAB = new RegExp(["relay", "braid"].join(""), "i");
const BINARY = /\.(png|jpg|jpeg|gif|tgz|gz|zip|woff2?|ico)$/i;

test("fixtures/ holds exactly the synthetic set", () => {
  assert.deepEqual(readdirSync(join(ROOT, "fixtures")).sort(), ["synthetic"]);
});

test("no file in the repository names the lab's product", () => {
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { cwd: ROOT, encoding: "utf8" })
    .split("\n")
    .filter((f) => f && !f.includes("node_modules/") && !BINARY.test(f));
  assert.ok(files.length > 50, `expected the repository's files, saw ${files.length}`);
  const offenders: string[] = [];
  for (const file of files) {
    const full = join(ROOT, file);
    if (!statSync(full).isFile()) continue;
    if (LAB.test(readFileSync(full, "utf8"))) offenders.push(file);
  }
  assert.deepEqual(offenders, [], `files naming the lab: ${offenders.join(", ")}`);
});
