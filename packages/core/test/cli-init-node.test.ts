// `journeys init --node` on five fixture projects, byte for byte, against a mocked API and a
// recording command runner: the mount after the line that creates the app (ESM and CommonJS,
// with and without semicolons), the entry found from main or a script, the two lines printed when
// no entry is known (exit 3), the refusal on a project without a framework (exit 2), the JSON
// output against output.schema.json, and `uninstall --node` restoring the entry file.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import { initNode } from "../src/cli/init-node.js";
import type { InitDeps, InitReport } from "../src/cli/init-next.js";
import { manualLines, mountSource } from "../src/cli/mount-file.js";
import { detectNode, readLock, scriptEntry } from "../src/cli/project.js";
import { uninstallNode } from "../src/cli/uninstall.js";
import { VERSION } from "../src/version.js";

const FIXTURES = join(new URL("./fixtures/init-node/", import.meta.url).pathname);
const SCHEMA = JSON.parse(readFileSync(join(new URL("../src/cli/output.schema.json", import.meta.url).pathname), "utf8"));

interface Fixture {
  about: string;
  args: string[];
  files: Record<string, string>;
  expected: { exit_code: number; framework?: string; hosts?: string[]; files: Record<string, string>; files_written: string[]; install: [string, string[]] | null };
}

interface Recorded {
  command: string;
  args: string[];
  cwd: string;
}

const INSTALL_ID = "jin_test0000000000000000000000";
const KEY = "sjk_test_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CLAIM = "https://console.example/journeys/claim/dG9rZW4";

let server: Server;
let apiUrl = "";
const posts: Array<{ path: string; headers: Record<string, string | string[] | undefined>; body: unknown }> = [];

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      posts.push({ path: req.url ?? "", headers: req.headers, body: raw ? JSON.parse(raw) : null });
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ install: { install_id: INSTALL_ID, customer_id: null, form: "node", hosts: ["acme.example"], environment: "production", key_id: "sjk_test_aaaaaaaa", oidc_subject: null, package: null, policy_id: null, policy_version: null, state: "unclaimed", salt_epoch: 1, first_record_at: null, first_agent_at: null, last_record_at: null, records_day: 0, batches_day: 0, observer: null, claim_url: CLAIM, created_at: "2026-10-10T12:00:00.000Z" }, key: KEY, claim_url: CLAIM, snippet: { form: "node", files: [] } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  apiUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
after(() => server.close());

function materialise(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "journeys-init-node-"));
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

function deps(): InitDeps & { recorded: Recorded[] } {
  const recorded: Recorded[] = [];
  return {
    recorded,
    fetch: (input, init) => fetch(input, init),
    exec: async (command, args, o) => {
      recorded.push({ command, args, cwd: o.cwd });
      return { code: 0, stdout: "", stderr: "" };
    },
    isTTY: false,
    ask: async (_q, fallback) => fallback,
    env: { JOURNEYS_API_URL: apiUrl },
    stdout: () => undefined,
    random: (bytes) => Uint8Array.from({ length: bytes }, (_, i) => (i + 1) & 255),
    now: () => new Date("2026-10-10T12:00:00.000Z"),
  };
}

const list = (value: string | undefined): string[] | null => (value ? value.split(",").map((s) => s.trim()) : null);

/** The fixture's argv as `runInit` would parse it. */
function optionsOf(args: string[], cwd: string): Parameters<typeof initNode>[0] {
  const flag = (name: string): string | undefined => {
    const at = args.indexOf(name);
    return at >= 0 ? args[at + 1] : undefined;
  };
  return { cwd, apiUrl: null, hosts: list(flag("--hosts")), docsHost: flag("--docs-host") ?? null, host: null, entry: flag("--entry") ?? null, yes: args.includes("--yes"), environment: "production", packageVersion: VERSION, assertion: null };
}

const validate = new Ajv2020({ strict: false }).compile(SCHEMA);

for (const name of ["node-express", "node-express-cjs", "node-hono-ts", "node-fastify-no-entry", "node-no-framework"]) {
  const fixture = JSON.parse(readFileSync(join(FIXTURES, `${name}.json`), "utf8")) as Fixture;
  test(`init --node on ${name}: ${fixture.about}`, async () => {
    posts.length = 0;
    const cwd = materialise(fixture.files);
    const d = deps();
    const report: InitReport = await initNode(optionsOf(fixture.args, cwd), d);
    assert.equal(report.exit_code, fixture.expected.exit_code, JSON.stringify(report));
    assert.ok(validate(report), JSON.stringify(validate.errors));
    if (fixture.expected.framework) assert.equal(report.framework, fixture.expected.framework);
    if (fixture.expected.hosts) assert.deepEqual(report.hosts, fixture.expected.hosts);
    for (const [path, contents] of Object.entries(fixture.expected.files)) assert.equal(readFileSync(join(cwd, path), "utf8"), contents.replace("{API_URL}", apiUrl), `${name}: ${path}`);
    assert.deepEqual(report.files_written, fixture.expected.files_written);
    const install = d.recorded.find((r) => r.args.some((a) => a.startsWith("scope-journeys-node")));
    if (fixture.expected.install) assert.deepEqual([install?.command, install?.args], [fixture.expected.install[0], fixture.expected.install[1].map((a) => a.replace("{VERSION}", VERSION))]);
    else assert.equal(install, undefined, "no dependency installed");
    if (fixture.expected.exit_code === 2) {
      assert.equal(posts.length, 0, "no call to Scope");
      assert.ok(!existsSync(join(cwd, ".env.local")));
    } else {
      assert.equal(posts.length, 1, "one call to Scope");
      const body = posts[0]?.body as { form: string; hosts: string[]; package: { name: string; adapter: string } };
      assert.equal(body.form, "node");
      assert.equal(body.package.name, "scope-journeys-node");
      assert.equal(body.package.adapter, "node");
      assert.ok(typeof posts[0]?.headers["idempotency-key"] === "string");
      assert.ok(report.env_pending.some((l) => /JOURNEYS_TRUST_PROXY=1/.test(l)), "the deployment's trust-proxy line is printed");
      assert.ok(!JSON.stringify(report).includes(KEY) && !JSON.stringify(report).includes("AQIDBAUGBwgJ"), "neither the key nor the salt in the report");
    }
    if (fixture.expected.exit_code === 3) {
      assert.ok(report.manual?.some((l) => /import \{ fastifyJourneys \}/.test(l)), JSON.stringify(report.manual));
      assert.ok(report.manual?.some((l) => /fastify\.register\(fastifyJourneys\)/.test(l)));
    }
  });
}

test("a rerun replays the same idempotency key, leaves a mounted entry alone and says so", async () => {
  posts.length = 0;
  const fixture = JSON.parse(readFileSync(join(FIXTURES, "node-express.json"), "utf8")) as Fixture;
  const cwd = materialise(fixture.files);
  const first = await initNode(optionsOf(fixture.args, cwd), deps());
  const key = posts[0]?.headers["idempotency-key"];
  const mounted = readFileSync(join(cwd, "server.mjs"), "utf8");
  const second = await initNode(optionsOf(fixture.args, cwd), deps());
  assert.equal(first.exit_code, 0);
  assert.equal(second.exit_code, 0);
  assert.equal(posts[1]?.headers["idempotency-key"], key);
  assert.equal(readFileSync(join(cwd, "server.mjs"), "utf8"), mounted, "not mounted twice");
  assert.ok(second.warnings.some((w) => /already mounts/.test(w)), JSON.stringify(second.warnings));
  assert.deepEqual(second.files_written, [".env.local"]);
});

test("uninstall --node restores the entry file as it was, removes the dependency and the lock, never calls Scope", async () => {
  posts.length = 0;
  const fixture = JSON.parse(readFileSync(join(FIXTURES, "node-express.json"), "utf8")) as Fixture;
  const cwd = materialise(fixture.files);
  const d = deps();
  await initNode(optionsOf(fixture.args, cwd), d);
  assert.equal(readLock(cwd)?.mount_file, "server.mjs");
  const calls = posts.length;
  const report = await uninstallNode(cwd, d.exec);
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.deepEqual(report.restored, ["server.mjs"]);
  assert.equal(readFileSync(join(cwd, "server.mjs"), "utf8"), fixture.files["server.mjs"]);
  assert.ok(report.removed.includes("scope-journeys-node"));
  assert.equal(readLock(cwd), null);
  assert.equal(posts.length, calls, "uninstall never calls Scope");
  assert.deepEqual(d.recorded.at(-1)?.args, ["uninstall", "scope-journeys-node"]);
});

test(".env.local not ignored: the mount is written, no secret lands in a tracked file, exit 6", async () => {
  const fixture = JSON.parse(readFileSync(join(FIXTURES, "node-express.json"), "utf8")) as Fixture;
  const cwd = materialise({ ...fixture.files, ".gitignore": "node_modules/\n" });
  const report = await initNode(optionsOf(fixture.args, cwd), deps());
  assert.equal(report.exit_code, 6);
  assert.ok(!existsSync(join(cwd, ".env.local")));
  assert.ok(readFileSync(join(cwd, "server.mjs"), "utf8").includes("app.use(journeys())"));
});

test("mountSource: the three frameworks, indentation and semicolons kept, a shebang and use strict respected, a shape it does not understand refused with the two lines, an existing mount left alone", () => {
  const express = mountSource('import express from "express"\n\nconst app = express()\napp.get("/", (req, res) => res.send("ok"))\n', "express", "esm");
  assert.equal(express.source, 'import { journeys } from "scope-journeys-node"\nimport express from "express"\n\nconst app = express()\napp.use(journeys())\napp.get("/", (req, res) => res.send("ok"))\n');
  const fastify = mountSource('#!/usr/bin/env node\nimport Fastify from "fastify";\n\n  const server = Fastify({ logger: true });\n', "fastify", "esm");
  assert.equal(fastify.source, '#!/usr/bin/env node\nimport { fastifyJourneys } from "scope-journeys-node";\nimport Fastify from "fastify";\n\n  const server = Fastify({ logger: true });\n  server.register(fastifyJourneys);\n');
  const hono = mountSource('import { Hono } from "hono"\n\nexport const app = new Hono<{ Bindings: Env }>()\n', "hono", "esm");
  assert.equal(hono.ok, false, "an exported binding is not a line the mount understands");
  assert.deepEqual(hono.manual, manualLines("hono", "esm"));
  const plain = mountSource('import { Hono } from "hono"\nconst app = new Hono<{ Bindings: Env }>({ strict: false })\n', "hono", "esm");
  assert.equal(plain.source, 'import { honoJourneys } from "scope-journeys-node"\nimport { Hono } from "hono"\nconst app = new Hono<{ Bindings: Env }>({ strict: false })\napp.use(honoJourneys())\n');
  const cjs = mountSource('"use strict";\nconst express = require("express");\nconst app = express();\n', "express", "cjs");
  assert.equal(cjs.source, '"use strict";\nconst { journeys } = require("scope-journeys-node");\nconst express = require("express");\nconst app = express();\napp.use(journeys());\n');
  const again = mountSource(cjs.source, "express", "cjs");
  assert.equal(again.reason, "already mounted");
  assert.equal(again.source, cjs.source);
  const refused = mountSource('import express from "express"\nexport default express()\n', "express", "esm");
  assert.equal(refused.ok, false);
  assert.match(refused.reason ?? "", /const app = express\(\)/);
  assert.equal(refused.manual.length, 2);
});

test("detectNode: the entry from main, a start script or a dev script; the framework in express, fastify, hono order; the module style from the file", () => {
  assert.equal(scriptEntry("node --env-file=.env server.mjs"), "server.mjs");
  assert.equal(scriptEntry("tsx watch src/index.ts"), "src/index.ts");
  assert.equal(scriptEntry("next dev"), null);
  assert.equal(scriptEntry(undefined), null);
  const root = materialise({ "package.json": JSON.stringify({ type: "commonjs", scripts: { start: "node src/server.js" }, dependencies: { hono: "4", express: "5" } }), "src/server.js": 'import express from "express"\nconst app = express()\n' });
  const detected = detectNode(root, null);
  assert.ok(detected.ok);
  assert.equal(detected.project.framework, "express");
  assert.deepEqual(detected.project.frameworks, ["express", "hono"]);
  assert.equal(detected.project.entry, "src/server.js");
  assert.equal(detected.project.moduleStyle, "esm", "an import statement in a .js file makes it ESM");
  const flagged = detectNode(root, "nope.js");
  assert.ok(flagged.ok && flagged.project.entry === "src/server.js", "a missing --entry falls back to the script's file");
  const none = detectNode(materialise({ "package.json": "{}" }), null);
  assert.ok(!none.ok && none.reason === "no_framework");
  const broken = detectNode(materialise({ "package.json": "{" }), null);
  assert.ok(!broken.ok && broken.reason === "not_node");
});
