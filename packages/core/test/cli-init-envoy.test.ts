// `journeys init --envoy`: the dry run applied to the sample envoy.yaml equals the
// configuration the compose test runs (the live form), the observability-mode fragment every
// install starts with, the Istio twin, a configuration whose shape is not understood refused with
// the fragment printed, and the full command against a mocked API: the install (form envoy), the
// fragments written, the variables in .env.local, exit 6 on a tracked .env.local, uninstall --envoy.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import { applyToEnvoyYaml, clusterYaml, filterYaml, initEnvoy, istioYaml } from "../src/cli/init-envoy.js";
import type { InitDeps } from "../src/cli/init-next.js";
import { readLock } from "../src/cli/project.js";
import { uninstallEnvoy } from "../src/cli/uninstall.js";
import { VERSION } from "../src/version.js";

const ROOT = join(new URL("../../../", import.meta.url).pathname);
const SAMPLE = join(ROOT, "test", "envoy", "sample.envoy.yaml");
const COMMITTED = join(ROOT, "test", "envoy", "envoy.yaml");
const SCHEMA = JSON.parse(readFileSync(join(new URL("../src/cli/output.schema.json", import.meta.url).pathname), "utf8"));
const validate = new Ajv2020({ strict: false }).compile(SCHEMA);

const INSTALL_ID = "jin_test0000000000000000000000";
const KEY = "sjk_test_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
let server: Server;
let apiUrl = "";
const posts: Array<{ path: string; body: unknown }> = [];

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      posts.push({ path: req.url ?? "", body: raw ? JSON.parse(raw) : null });
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ install: { install_id: INSTALL_ID, form: "envoy", hosts: ["api.acme.example"], environment: "production", state: "unclaimed", key_id: "sjk_test_aaaaaaaa", claim_url: "https://console.example/claim/t" }, key: KEY, claim_url: "https://console.example/claim/t", snippet: { form: "envoy", files: [] } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  apiUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
after(() => server.close());

function deps(): InitDeps {
  return { fetch: (input, init) => fetch(input, init), exec: async () => ({ code: 0, stdout: "", stderr: "" }), isTTY: false, ask: async (_q, fallback) => fallback, env: { JOURNEYS_API_URL: apiUrl }, stdout: () => undefined, random: (bytes) => Uint8Array.from({ length: bytes }, (_, i) => (i + 1) & 255), now: () => new Date("2026-10-10T12:00:00.000Z") };
}

function materialise(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "journeys-envoy-"));
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

const options = (cwd: string, extra: Partial<Parameters<typeof initEnvoy>[0]> = {}): Parameters<typeof initEnvoy>[0] => ({ cwd, apiUrl: null, hosts: ["api.acme.example"], docsHost: "same", processor: "host.docker.internal:18790", config: null, dryRun: false, live: false, yes: true, environment: "production", packageVersion: VERSION, assertion: null, ...extra });

test("the dry run applied to the sample envoy.yaml, live, is the configuration the compose test runs, byte for byte", async () => {
  const cwd = materialise({ "envoy.yaml": readFileSync(SAMPLE, "utf8") });
  const report = await initEnvoy(options(cwd, { config: "envoy.yaml", dryRun: true, live: true }), deps());
  assert.equal(report.exit_code, 0, JSON.stringify(report));
  assert.ok(validate(report), JSON.stringify(validate.errors));
  assert.equal(report.fragment, readFileSync(COMMITTED, "utf8"));
  assert.equal(readFileSync(join(cwd, "envoy.yaml"), "utf8"), readFileSync(SAMPLE, "utf8"), "a dry run writes nothing");
  assert.equal(posts.length, 0, "a dry run never calls Scope");
});

test("the fragments: observability mode at install (streamed bodies, no override, nothing waits), the live form once a rule is live; the Istio twin carries the same filter and cluster", () => {
  const observe = filterYaml({ processor: { host: "journeys-ext-proc", port: 9000 }, observability: true });
  assert.match(observe, /observability_mode: true/);
  assert.match(observe, /request_body_mode: STREAMED/);
  assert.match(observe, /allow_mode_override: false/);
  assert.match(observe, /failure_mode_allow: true/);
  const live = filterYaml({ processor: { host: "journeys-ext-proc", port: 9000 }, observability: false });
  assert.doesNotMatch(live, /observability_mode/);
  assert.match(live, /request_body_mode: NONE/);
  assert.match(live, /response_body_mode: NONE/);
  assert.match(live, /allow_mode_override: true/);
  const cluster = clusterYaml({ processor: { host: "journeys-ext-proc", port: 9000 }, observability: true });
  assert.match(cluster, /http2_protocol_options/);
  assert.match(cluster, /address: journeys-ext-proc, port_value: 9000/);
  const istio = istioYaml({ processor: { host: "journeys-ext-proc", port: 9000 }, observability: true });
  assert.match(istio, /kind: EnvoyFilter/);
  assert.match(istio, /operation: INSERT_BEFORE/);
  assert.match(istio, /name: envoy\.filters\.http\.ext_proc/);
  assert.match(istio, /cluster_name: journeys_ext_proc/);
  const refused = applyToEnvoyYaml("static_resources:\n  listeners: []\n", { processor: { host: "p", port: 9000 }, observability: true });
  assert.equal(refused.ok, false);
  assert.match(refused.reason ?? "", /router/);
  const again = applyToEnvoyYaml(readFileSync(COMMITTED, "utf8"), { processor: { host: "p", port: 9000 }, observability: true });
  assert.equal(again.reason, "already applied");
});

test("init --envoy: the install created (form envoy), the fragments written, the configuration applied and restorable, the variables in .env.local; uninstall --envoy restores and never calls Scope", async () => {
  posts.length = 0;
  const cwd = materialise({ "envoy.yaml": readFileSync(SAMPLE, "utf8"), ".gitignore": ".env.local\n" });
  const report = await initEnvoy(options(cwd, { config: "envoy.yaml", live: true }), deps());
  assert.equal(report.exit_code, 0, JSON.stringify(report));
  assert.ok(validate(report), JSON.stringify(validate.errors));
  assert.equal(posts.length, 1);
  const body = posts[0]?.body as { form: string; package: { name: string; adapter: string } };
  assert.equal(body.form, "envoy");
  assert.equal(body.package.name, "scope-journeys-envoy");
  assert.equal(body.package.adapter, "envoy");
  assert.deepEqual(report.files_written, ["journeys/envoy.journeys.yaml", "journeys/istio.journeys.yaml", "envoy.yaml", ".env.local"]);
  assert.equal(readFileSync(join(cwd, "envoy.yaml"), "utf8"), readFileSync(COMMITTED, "utf8"));
  assert.match(readFileSync(join(cwd, "journeys", "envoy.journeys.yaml"), "utf8"), /^- name: envoy\.filters\.http\.ext_proc/);
  const env = readFileSync(join(cwd, ".env.local"), "utf8");
  assert.match(env, /^JOURNEYS_INSTALL_ID=jin_test0000000000000000000000$/m);
  assert.match(env, new RegExp(`^JOURNEYS_INSTALL_KEY=${KEY}$`, "m"));
  assert.ok(report.env_pending.some((l) => /JOURNEYS_EXT_PROC_LISTEN=0\.0\.0\.0:18790/.test(l)), JSON.stringify(report.env_pending));
  assert.ok(!JSON.stringify(report).includes(KEY));
  assert.equal(readLock(cwd)?.form, "envoy");
  const undone = await uninstallEnvoy(cwd);
  assert.equal(undone.ok, true, JSON.stringify(undone));
  assert.deepEqual(undone.restored, ["envoy.yaml"]);
  assert.equal(readFileSync(join(cwd, "envoy.yaml"), "utf8"), readFileSync(SAMPLE, "utf8"));
  assert.ok(!existsSync(join(cwd, "journeys", "envoy.journeys.yaml")));
  assert.equal(readLock(cwd), null);
  assert.equal(posts.length, 1, "uninstall never calls Scope");
});

test("init --envoy without --config writes the fragments and prints the merge step; .env.local not ignored exits 6; a bad --processor exits 2", async () => {
  posts.length = 0;
  const cwd = materialise({ ".gitignore": ".env.local\n" });
  const report = await initEnvoy(options(cwd), deps());
  assert.equal(report.exit_code, 3, JSON.stringify(report));
  assert.ok(report.manual?.some((m) => /merge journeys\/envoy\.journeys\.yaml/.test(m)));
  assert.ok(existsSync(join(cwd, ".env.local")));
  const tracked = await initEnvoy(options(materialise({})), deps());
  assert.equal(tracked.exit_code, 6);
  const bad = await initEnvoy(options(cwd, { processor: "nine-thousand" }), deps());
  assert.equal(bad.exit_code, 2);
  assert.match(bad.next_step, /host:port/);
});
