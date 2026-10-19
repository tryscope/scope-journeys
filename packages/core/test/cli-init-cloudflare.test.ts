// `journeys init --cloudflare` against a mocked wrangler and a mocked Cloudflare API: the
// generated wrangler.toml equals the fixture, the two secrets are put and never written to a
// tracked file, an unproxied record prints the warning, the deploy runs from journeys/.
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { initCloudflare, uninstallCloudflare, wranglerToml } from "../src/cli/init-cloudflare.js";
import type { InitDeps } from "../src/cli/init-next.js";
import { VERSION } from "../src/version.js";

const INSTALL_ID = "jin_test0000000000000000000000";
const KEY = "sjk_live_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
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
      res.end(JSON.stringify({ install: { install_id: INSTALL_ID, form: "cloudflare", hosts: ["docs.acme.example", "api.acme.example"], environment: "production", state: "unclaimed", key_id: "sjk_live_bbbbbbbb", claim_url: "https://console.example/claim/t" }, key: KEY, claim_url: "https://console.example/claim/t", snippet: { form: "cloudflare", files: [] } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  apiUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
after(() => server.close());

interface Recorded {
  command: string;
  args: string[];
  cwd: string;
  input?: string;
}

function deps(options: { loggedIn: boolean; proxied: Record<string, boolean | null> }): InitDeps & { recorded: Recorded[] } {
  const recorded: Recorded[] = [];
  const cfFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith("https://api.cloudflare.com/client/v4/zones?")) return Response.json({ result: [{ id: "zone1", name: "acme.example" }], result_info: { total_pages: 1 } });
    const dns = /zones\/zone1\/dns_records\?name=([^&]+)/.exec(url);
    if (dns) {
      const host = decodeURIComponent(dns[1] ?? "");
      const proxied = options.proxied[host];
      return Response.json({ result: proxied === null ? [] : [{ type: "CNAME", proxied }] });
    }
    return fetch(input, init);
  };
  return {
    recorded,
    fetch: cfFetch,
    exec: async (command, args, o) => {
      recorded.push({ command, args, cwd: o.cwd, input: o.input });
      const joined = args.join(" ");
      if (/wrangler@4 whoami/.test(joined)) return options.loggedIn ? { code: 0, stdout: "│ Acme Inc │ 0123456789abcdef0123456789abcdef │\n", stderr: "" } : { code: 0, stdout: "You are not authenticated.", stderr: "" };
      if (/wrangler@4 deploy/.test(joined)) return { code: 0, stdout: "Deployed scope-journeys triggers (1.2 sec)\nDeployment ID: 11111111-2222-3333-4444-555555555555\nVersion ID: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee\n", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    },
    isTTY: false,
    ask: async (_q, fallback) => fallback,
    env: { JOURNEYS_API_URL: apiUrl, CLOUDFLARE_API_TOKEN: "cf-test-token-not-real" },
    stdout: () => undefined,
    random: (bytes) => Uint8Array.from({ length: bytes }, (_, i) => (i + 1) & 255),
    now: () => new Date("2026-10-10T12:00:00.000Z"),
  };
}

const EXPECTED_TOML = `name = "scope-journeys"
main = "src/worker.ts"
compatibility_date = "2026-10-01"
routes = [
  { pattern = "docs.acme.example/*", zone_name = "acme.example" },
  { pattern = "api.acme.example/*", zone_name = "acme.example" },
]

[observability]
enabled = true

[vars]
JOURNEYS_INSTALL_ID = "${INSTALL_ID}"
JOURNEYS_API_URL = "{API_URL}"
JOURNEYS_NAME = "scope-journeys"
# Secrets, never in this file: \`npx wrangler@4 secret put JOURNEYS_INSTALL_KEY\`, \`npx wrangler@4 secret put JOURNEYS_SALT\` and \`npx wrangler@4 secret put JOURNEYS_ASSERTION_KEY\`
# (journeys init set all three; .env.secrets beside this file holds them for the next init run and is ignored by git).
`;

test("init --cloudflare writes journeys/, puts the two secrets, deploys from journeys/, warns on the unproxied record", async () => {
  posts.length = 0;
  const cwd = mkdtempSync(join(tmpdir(), "journeys-cf-"));
  const d = deps({ loggedIn: true, proxied: { "docs.acme.example": true, "api.acme.example": false } });
  const report = await initCloudflare({ cwd, dir: "journeys", apiUrl: null, hosts: ["docs.acme.example", "api.acme.example"], origin: null, environment: "production", packageVersion: VERSION, yes: true, name: "scope-journeys" }, d);
  assert.equal(report.exit_code, 0, JSON.stringify(report));
  assert.equal(readFileSync(join(cwd, "journeys", "wrangler.toml"), "utf8"), EXPECTED_TOML.replace("{API_URL}", apiUrl));
  assert.equal(readFileSync(join(cwd, "journeys", "src", "worker.ts"), "utf8"), 'export { default } from "scope-journeys-cloudflare/worker"\n');
  assert.equal(posts.length, 1);
  assert.equal((posts[0]?.body as { form: string }).form, "cloudflare");
  const puts = d.recorded.filter((r) => r.args.includes("secret") && r.args.includes("put"));
  assert.deepEqual(puts.map((p) => p.args.at(-1)), ["JOURNEYS_INSTALL_KEY", "JOURNEYS_SALT"]);
  assert.equal(puts[0]?.input, `${KEY}\n`);
  assert.ok(puts.every((p) => p.cwd === join(cwd, "journeys")));
  const deploy = d.recorded.find((r) => r.args.includes("deploy"));
  assert.equal(deploy?.cwd, join(cwd, "journeys"), "the deploy runs from journeys/");
  assert.deepEqual(report.deployment, { id: "11111111-2222-3333-4444-555555555555", version: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });
  for (const file of readdirSync(join(cwd, "journeys"))) {
    if (file === ".env.secrets" || file === "node_modules" || file === ".journeys") continue;
    const path = join(cwd, "journeys", file);
    if (!existsSync(path) || readdirSync(cwd).length === 0) continue;
    const text = file === "src" ? readFileSync(join(path, "worker.ts"), "utf8") : readFileSync(path, "utf8");
    assert.ok(!text.includes(KEY) && !text.includes("AQIDBAUGBwgJ"), `${file} holds a secret`);
  }
  assert.ok(readFileSync(join(cwd, "journeys", ".gitignore"), "utf8").includes(".env.secrets"));
  assert.ok(report.warnings.some((w) => /api\.acme\.example is not proxied/.test(w)), JSON.stringify(report.warnings));
  assert.ok(!JSON.stringify(report).includes(KEY));
});

test("not logged in to wrangler exits 4; a host outside every zone exits 2; no hosts exits 2", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "journeys-cf-"));
  const out = await initCloudflare({ cwd, dir: "journeys", apiUrl: null, hosts: ["docs.acme.example"], origin: null, environment: "production", packageVersion: VERSION, yes: true, name: "scope-journeys" }, deps({ loggedIn: false, proxied: {} }));
  assert.equal(out.exit_code, 4);
  assert.match(out.next_step, /wrangler login/);
  const foreign = await initCloudflare({ cwd, dir: "journeys", apiUrl: null, hosts: ["docs.other.example"], origin: null, environment: "production", packageVersion: VERSION, yes: true, name: "scope-journeys" }, deps({ loggedIn: true, proxied: {} }));
  assert.equal(foreign.exit_code, 2);
  assert.match(foreign.next_step, /docs\.other\.example belongs to no zone/);
  const none = await initCloudflare({ cwd, dir: "journeys", apiUrl: null, hosts: [], origin: null, environment: "production", packageVersion: VERSION, yes: true, name: "scope-journeys" }, deps({ loggedIn: true, proxied: {} }));
  assert.equal(none.exit_code, 2);
});

test("uninstall --cloudflare deletes the Worker by its name and removes the directory", async () => {
  posts.length = 0;
  const cwd = mkdtempSync(join(tmpdir(), "journeys-cf-"));
  const d = deps({ loggedIn: true, proxied: { "docs.acme.example": true, "api.acme.example": true } });
  await initCloudflare({ cwd, dir: "journeys", apiUrl: null, hosts: ["docs.acme.example", "api.acme.example"], origin: "https://origin.acme.example", environment: "preview", packageVersion: VERSION, yes: true, name: "scope-journeys" }, d);
  const toml = readFileSync(join(cwd, "journeys", "wrangler.toml"), "utf8");
  assert.ok(toml.includes('JOURNEYS_ORIGIN = "https://origin.acme.example"') && toml.includes('JOURNEYS_ENVIRONMENT = "preview"'));
  const report = await uninstallCloudflare(cwd, "journeys", d);
  assert.equal(report.ok, true);
  const del = d.recorded.find((r) => r.args.includes("delete"));
  assert.deepEqual(del?.args.slice(-4), ["delete", "--name", "scope-journeys", "--force"]);
  assert.ok(!existsSync(join(cwd, "journeys")));
});

test("--name names the Worker in wrangler.toml and the README, uninstall deletes by it; a name outside the Worker shape exits 2", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "journeys-cf-"));
  const d = deps({ loggedIn: true, proxied: { "docs.acme.example": true } });
  const report = await initCloudflare({ cwd, dir: "journeys", apiUrl: null, hosts: ["docs.acme.example"], origin: null, environment: "production", packageVersion: VERSION, yes: true, name: "scope-journeys-run1" }, d);
  assert.equal(report.exit_code, 0, JSON.stringify(report));
  assert.match(readFileSync(join(cwd, "journeys", "wrangler.toml"), "utf8"), /^name = "scope-journeys-run1"$/m);
  assert.ok(readFileSync(join(cwd, "journeys", "README.md"), "utf8").includes("`scope-journeys-run1`"));
  await uninstallCloudflare(cwd, "journeys", d);
  const del = d.recorded.find((r) => r.args.includes("delete"));
  assert.deepEqual(del?.args.slice(-4), ["delete", "--name", "scope-journeys-run1", "--force"]);
  for (const bad of ["Scope-Journeys", "-journeys", "a".repeat(64), "scope journeys"]) {
    const refused = await initCloudflare({ cwd: mkdtempSync(join(tmpdir(), "journeys-cf-")), dir: "journeys", apiUrl: null, hosts: ["docs.acme.example"], origin: null, environment: "production", packageVersion: VERSION, yes: true, name: bad }, deps({ loggedIn: true, proxied: {} }));
    assert.equal(refused.exit_code, 2, bad);
    assert.match(refused.next_step, /is not a Worker name/);
  }
});

test("wranglerToml renders the template's shape", () => {
  const toml = wranglerToml({ name: "scope-journeys", hosts: [{ host: "docs.example.com", zone: "example.com" }], installId: "jin_x", apiUrl: "https://api.tryscope.com", origin: null, environment: "production" });
  assert.ok(toml.startsWith('name = "scope-journeys"\nmain = "src/worker.ts"\ncompatibility_date = "2026-10-01"\nroutes = [\n  { pattern = "docs.example.com/*", zone_name = "example.com" },\n]'));
  assert.ok(toml.includes("[observability]\nenabled = true"));
  assert.ok(!toml.includes("JOURNEYS_INSTALL_KEY ="), "no secret in the toml");
});
