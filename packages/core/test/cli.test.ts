// The three commands through the built bin, as a customer runs them. Needs `npm run build`
// in packages/core first (CI builds before it tests).
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const run = promisify(execFile);
const CORE = new URL("../", import.meta.url).pathname;
const ROOT = join(CORE, "..", "..");
const BIN = join(CORE, "bin", "journeys.mjs");
const built = existsSync(join(CORE, "dist", "cli", "index.js"));

async function journeys(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await run(process.execPath, [BIN, ...args], { cwd: CORE });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof e.code === "number" ? e.code : 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

test("journeys version prints the package version and the schema majors", { skip: built ? false : "packages/core is not built" }, async () => {
  const { code, stdout } = await journeys(["version", "--json"]);
  assert.equal(code, 0);
  const report = JSON.parse(stdout);
  assert.equal(report.package, `scope-journeys ${JSON.parse(readFileSync(join(CORE, "package.json"), "utf8")).version}`);
  assert.equal(report.record_schema, "scope.request/1");
  assert.equal(report.policy_schema, "scope.policy/1");
});

test("journeys policy validate exits 0 on the toy policy and 1 naming the path of a planted secret", { skip: built ? false : "packages/core is not built" }, async () => {
  const ok = await journeys(["policy", "validate", join(ROOT, "fixtures", "synthetic", "policy.json"), "--json"]);
  assert.equal(ok.code, 0, ok.stdout + ok.stderr);
  assert.match(JSON.parse(ok.stdout).summary, /^valid: scope\.policy\/1 version 3, 13 rules$/);
  const dir = mkdtempSync(join(tmpdir(), "journeys-cli-"));
  const planted = JSON.parse(readFileSync(join(ROOT, "fixtures", "synthetic", "policy.json"), "utf8"));
  planted.forward.headers["x-acme-edge"] = "sjk_live_0123456789abcdefghijklmnopqrstuv";
  writeFileSync(join(dir, "planted.json"), JSON.stringify(planted));
  const bad = await journeys(["policy", "validate", join(dir, "planted.json"), "--json"]);
  assert.equal(bad.code, 1);
  const report = JSON.parse(bad.stdout);
  assert.deepEqual(report.errors.map((e: { path: string }) => e.path), ["/forward/headers/x-acme-edge"]);
  assert.doesNotMatch(bad.stdout, /sjk_live_0123/, "the value never appears");
  const unknown = await journeys(["frobnicate"]);
  assert.equal(unknown.code, 2);
});

test("journeys doctor --local observes a local app through the core and reports the page", { skip: built ? false : "packages/core is not built" }, async () => {
  const quickstart = JSON.parse(readFileSync(join(ROOT, "fixtures", "synthetic", "01-html-page", "upstream.json"), "utf8"));
  const server = createServer((req, res) => {
    if (req.url?.startsWith("/docs/quickstart")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(quickstart.body);
    } else {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<h1>Not found</h1>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const ok = await journeys(["doctor", "--local", "--policy", join(ROOT, "fixtures", "synthetic", "policy.json"), "--url", `http://127.0.0.1:${port}`, "--json"]);
    assert.equal(ok.code, 0, ok.stdout + ok.stderr);
    const report = JSON.parse(ok.stdout);
    assert.equal(report.route, "docs");
    assert.equal(report.status, 200);
    assert.match(report.page.reference_minted, /^[0-9A-HJKMNP-TV-Z]{8}$/);
    assert.ok(report.decisions.some((d: { outcome: string }) => d.outcome === "applied"));
    assert.ok(report.supplied_by_the_platform_at_deploy_time.includes("scope.client.asn"));
    const missing = await journeys(["doctor", "--local", "--policy", join(ROOT, "fixtures", "synthetic", "policy.json"), "--url", `http://127.0.0.1:${port}`, "--path", "/docs/nope", "--json"]);
    assert.equal(missing.code, 1);
    assert.match(JSON.parse(missing.stdout).reasons.join(" "), /404/);
  } finally {
    server.close();
  }
});
