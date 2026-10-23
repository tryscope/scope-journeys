// The standalone proxy through the built bin, as a customer runs it: `journeys proxy --origin
// --listen` fronts a toy origin, the hop carries the gateway's headers, the record ships to the
// ingest named by .env.local in the working directory, and a SIGTERM during a request lets the
// response complete and the record ship before the process exits 0. Needs `npm run build` (the
// core's bin and the Node adapter's dist); CI builds before it tests.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { policySignature, testPolicyKeys } from "./signed.js";

const CORE = new URL("../", import.meta.url).pathname;
const ROOT = join(CORE, "..", "..");
const BIN = join(CORE, "bin", "journeys.mjs");
const TRUST = join(CORE, "test", "trust-policy-key.mjs");
const built = existsSync(join(CORE, "dist", "cli", "proxy.js")) && existsSync(join(ROOT, "packages", "node", "dist", "index.js"));

const listen = (server: Server): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve(typeof address === "object" && address ? address.port : 0);
    });
  });

const PAGE = '<!doctype html><html><body><h1>Quickstart</h1><a href="https://acme.example/docs/install">Install</a></body></html>';

test("journeys proxy: the standalone sensor in front of a toy origin; SIGTERM drains the request in flight and ships its record", { skip: built ? false : "the core and the Node adapter are not built" }, async () => {
  const seen: Array<Record<string, string>> = [];
  const origin = createServer((req, res) => {
    seen.push(Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : (v ?? "")])));
    setTimeout(() => {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(PAGE);
    }, 400);
  });
  const batches: unknown[][] = [];
  const policyFetches: Array<Record<string, string | string[] | undefined>> = [];
  // The toy policy as the policy route signs it; the child trusts the test key through the TRUST preload.
  const policyBody = JSON.stringify(JSON.parse(readFileSync(join(ROOT, "fixtures", "synthetic", "policy.json"), "utf8")));
  const issuedAt = Math.floor(Date.now() / 1000);
  const signature = await policySignature("jin_test0000000000000000000000", "production", "1", issuedAt, policyBody);
  const { x } = await crypto.subtle.exportKey("jwk", (await testPolicyKeys()).publicKey);
  // The ingest: the toy policy on the policy route, shipments accepted, anything else 404.
  const ingest = createServer((req, res) => {
    if (req.method === "GET" && req.url === "/policy") {
      policyFetches.push(req.headers);
      res.writeHead(200, { "content-type": "application/json", etag: '"3"', "x-journeys-environment": "production", "x-journeys-salt-epoch": "1", "x-journeys-signature": signature });
      res.end(policyBody);
      return;
    }
    if (req.method !== "POST" || req.url !== "/v1/requests") {
      req.resume();
      res.writeHead(404);
      res.end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      void new Response(new Blob([Buffer.concat(chunks)]).stream().pipeThrough(new DecompressionStream("gzip"))).text().then((text) => {
        batches.push(JSON.parse(text) as unknown[]);
        res.writeHead(202);
        res.end();
      });
    });
  });
  const originPort = await listen(origin);
  const ingestPort = await listen(ingest);
  const cwd = mkdtempSync(join(tmpdir(), "journeys-proxy-"));
  writeFileSync(join(cwd, ".env.local"), `JOURNEYS_INSTALL_ID=jin_test0000000000000000000000\nJOURNEYS_INSTALL_KEY=sjk_test_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee\nJOURNEYS_SALT=test-salt\nJOURNEYS_API_URL=http://127.0.0.1:${ingestPort}\nJOURNEYS_POLICY_URL=http://127.0.0.1:${ingestPort}/policy\n`);
  const child = spawn(process.execPath, ["--import", TRUST, BIN, "proxy", "--origin", `http://127.0.0.1:${originPort}`, "--listen", "127.0.0.1:0", "--json"], { cwd, env: { ...process.env, TEST_POLICY_KEY_X: x }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
  child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  try {
    for (let i = 0; i < 300 && !/"listening"/.test(stdout); i += 1) await new Promise((resolve) => setTimeout(resolve, 50));
    const report = JSON.parse(stdout) as { listening: string; origin: string; install: string };
    assert.equal(report.install, "jin_test0000000000000000000000");
    const pending = fetch(`${report.listening}/docs/quickstart`, { headers: { accept: "text/html", "user-agent": "Claude-User (claude-code/2.1.0; +https://www.anthropic.com/claude-code)" } });
    for (let i = 0; i < 100 && seen.length === 0; i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(seen.length, 1, "the request reached the origin");
    child.kill("SIGTERM");
    const response = await pending;
    assert.equal(response.status, 200, "the response completes through the drain");
    assert.match(await response.text(), /Quickstart/);
    assert.equal(await exited, 0, `the proxy exits 0 after the drain\n${stderr}`);
    assert.equal(batches.length, 1, "the record shipped before the exit");
    const record = (batches[0] as Array<Record<string, unknown>>).find((r) => r.schema === "scope.request/1");
    assert.equal(record?.source, "node");
    assert.equal((record?.observer as { adapter: string }).adapter, "node");
    assert.equal(record?.["scope.route"], "docs");
    assert.equal(policyFetches[0]?.authorization, "Bearer sjk_test_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", "the policy fetched with the install key from .env.local");
    assert.equal(seen[0]?.via, "1.1 scope-journeys");
    assert.equal(seen[0]?.["x-acme-edge"], "journeys", "the policy's forward header on the hop");
    assert.equal(seen[0]?.host, `127.0.0.1:${originPort}`);
    assert.equal(seen[0]?.["accept-encoding"], undefined);
    assert.equal(seen[0]?.["x-journeys-inner"], undefined);
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    origin.closeAllConnections();
    ingest.closeAllConnections();
    await Promise.all([new Promise((resolve) => origin.close(resolve)), new Promise((resolve) => ingest.close(resolve))]);
  }
});

test("journeys proxy without --origin exits 2 with the usage", { skip: built ? false : "the core is not built" }, async () => {
  const child = spawn(process.execPath, [BIN, "proxy"], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
  const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
  assert.equal(code, 2);
  assert.match(stderr, /journeys proxy --origin/);
});
