// The two sample apps under test/node-adapter/apps: `init --node`'s mount
// written into each by the same function the CLI uses, the mounted app started as a child process
// against this repository's node_modules, and `journeys doctor --local` observing a page through
// it: the mount without an install forwards untouched under the default policy, and the page
// arrives. The staging half (doctor against staging) is the owner's.
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { doctorLocal } from "../../packages/core/src/cli/doctor.js";
import { mountSource } from "../../packages/core/src/cli/mount-file.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const APPS = join(ROOT, "test", "node-adapter", "apps");
const POLICY = join(ROOT, "fixtures", "synthetic", "policy.json");
const built = existsSync(join(ROOT, "packages", "node", "dist", "index.js"));

async function start(dir: string): Promise<{ child: ChildProcess; url: string; output: () => string }> {
  const child = spawn(process.execPath, ["server.mjs"], { cwd: dir, env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  child.stdout?.on("data", (c: Buffer) => (out += c.toString()));
  child.stderr?.on("data", (c: Buffer) => (out += c.toString()));
  for (let i = 0; i < 200 && !/listening (http:\/\/\S+)/.test(out); i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
  const url = /listening (http:\/\/\S+)/.exec(out)?.[1];
  assert.ok(url, `the app did not start:\n${out}`);
  return { child, url, output: () => out };
}

for (const [name, framework] of [["express", "express"], ["hono", "hono"]] as const) {
  test(`the ${name} sample app: the mount written, the app started, doctor --local sees the page through it`, { skip: built ? false : "the Node adapter is not built" }, async () => {
    const dir = mkdtempSync(join(tmpdir(), `journeys-app-${name}-`));
    cpSync(join(APPS, name), dir, { recursive: true });
    symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"), "dir");
    const previous = readFileSync(join(dir, "server.mjs"), "utf8");
    const mounted = mountSource(previous, framework, "esm");
    assert.equal(mounted.ok, true, mounted.reason ?? "");
    assert.ok(mounted.source.includes(framework === "express" ? "app.use(journeys())" : "app.use(honoJourneys())"), mounted.source);
    writeFileSync(join(dir, "server.mjs"), mounted.source);
    const app = await start(dir);
    try {
      const report = await doctorLocal({ policy: POLICY, url: app.url });
      assert.equal(report.ok, true, JSON.stringify(report.reasons));
      assert.equal(report.route, "docs");
      assert.equal(report.page?.face, "html");
      assert.equal(report.status, 200);
      const api = await fetch(`${app.url}/api/v1/me`, { headers: { accept: "application/json" } });
      assert.equal(api.status, 401, "the API route answers through the mount");
      assert.match(app.output(), /JOURNEYS_INSTALL_ID is not set/, "the mount without an install says so once");
    } finally {
      app.child.kill("SIGTERM");
      await new Promise((resolve) => app.child.once("exit", resolve));
    }
  });
}
