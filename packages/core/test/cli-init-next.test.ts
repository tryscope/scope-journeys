// J2.1: `journeys init` on five fixture projects, byte for byte, against a mocked API and a
// recording command runner; the exit codes; the JSON output against output.schema.json; the one
// idempotent call; the OIDC form; the refusal to write a secret into a tracked file.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import { initNext, type InitDeps, type InitReport } from "../src/cli/init-next.js";
import { readLock } from "../src/cli/project.js";
import { unwrapProxySource, wrapProxySource } from "../src/cli/proxy-file.js";
import { uninstallNext } from "../src/cli/uninstall.js";
import { VERSION } from "../src/version.js";

const FIXTURES = join(new URL("./fixtures/init/", import.meta.url).pathname);
const SCHEMA = JSON.parse(readFileSync(join(new URL("../src/cli/output.schema.json", import.meta.url).pathname), "utf8"));

interface Fixture {
  about: string;
  args: string[];
  files: Record<string, string>;
  expected: { exit_code: number; files: Record<string, string>; files_written: string[]; hosts?: string[]; warnings?: string[]; install: [string, string[]] | null };
}

interface Recorded {
  command: string;
  args: string[];
  cwd: string;
  input?: string;
}

const INSTALL_ID = "jin_test0000000000000000000000";
const KEY = "sjk_test_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CLAIM = "https://console.example/journeys/claim/dG9rZW4";

let server: Server;
let apiUrl = "";
const posts: Array<{ path: string; headers: Record<string, string | string[] | undefined>; body: unknown }> = [];
let answer: { status: number; body: unknown; headers?: Record<string, string> } = { status: 201, body: {} };

before(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      posts.push({ path: req.url ?? "", headers: req.headers, body: raw ? JSON.parse(raw) : null });
      res.writeHead(answer.status, { "content-type": "application/json", ...(answer.headers ?? {}) });
      res.end(JSON.stringify(answer.body));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  apiUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
after(() => server.close());

const created = (overrides: Partial<{ key: string | undefined }> = {}) => ({
  status: 201,
  body: {
    install: { install_id: INSTALL_ID, customer_id: null, form: "next", hosts: ["acme.example"], environment: "production", key_id: "sjk_test_aaaaaaaa", oidc_subject: null, package: null, policy_id: null, policy_version: null, state: "unclaimed", salt_epoch: 1, first_record_at: null, first_agent_at: null, last_record_at: null, records_day: 0, batches_day: 0, observer: null, claim_url: CLAIM, created_at: "2026-10-10T12:00:00.000Z" },
    key: "key" in overrides ? overrides.key : KEY,
    claim_url: CLAIM,
    snippet: { form: "next", files: [] },
  },
});

function materialise(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "journeys-init-"));
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

function deps(options: { tty?: boolean; vercelAuthenticated?: boolean; env?: Record<string, string> } = {}): InitDeps & { recorded: Recorded[] } {
  const recorded: Recorded[] = [];
  const out: InitDeps & { recorded: Recorded[] } = {
    recorded,
    fetch: (input, init) => fetch(input, init),
    exec: async (command, args, o) => {
      recorded.push({ command, args, cwd: o.cwd, input: o.input });
      if (command === "vercel" && args[0] === "whoami") return { code: options.vercelAuthenticated ? 0 : 1, stdout: "", stderr: "" };
      return { code: 0, stdout: "", stderr: "" };
    },
    isTTY: options.tty ?? false,
    ask: async (_q, fallback) => fallback,
    env: { JOURNEYS_API_URL: apiUrl, ...(options.env ?? {}) },
    stdout: () => undefined,
    random: (bytes) => Uint8Array.from({ length: bytes }, (_, i) => (i + 1) & 255),
    now: () => new Date("2026-10-10T12:00:00.000Z"),
  };
  return out;
}

function argsOf(args: string[]): Parameters<typeof initNext>[0] {
  const get = (flag: string): string | null => {
    const i = args.indexOf(flag);
    return i >= 0 ? (args[i + 1] ?? null) : null;
  };
  return { cwd: "", apiUrl: null, key: args.includes("--key"), oidc: args.includes("--oidc"), hosts: get("--hosts")?.split(",") ?? null, docsHost: get("--docs-host"), host: get("--host"), yes: args.includes("--yes"), environment: "production", packageVersion: VERSION };
}

function treeOf(root: string, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name === ".journeys") continue;
      Object.assign(out, treeOf(root, rel));
    } else out[rel] = readFileSync(join(root, rel), "utf8");
  }
  return out;
}

const validate = new Ajv2020({ allErrors: true, strict: true }).compile(SCHEMA);

for (const file of readdirSync(FIXTURES).filter((f) => f.endsWith(".json")).sort()) {
  const fixture = JSON.parse(readFileSync(join(FIXTURES, file), "utf8")) as Fixture;
  const name = file.replace(/\.json$/, "");
  test(`init on ${name}: ${fixture.about}`, async () => {
    posts.length = 0;
    answer = created();
    const root = materialise(fixture.files);
    const d = deps();
    const report = await initNext({ ...argsOf(fixture.args), cwd: root }, d);
    assert.equal(report.exit_code, fixture.expected.exit_code, JSON.stringify(report));
    assert.ok(validate(report), JSON.stringify(validate.errors));
    const after = treeOf(root);
    for (const [path, expected] of Object.entries(fixture.expected.files)) {
      assert.equal(after[path], expected.replace("{API_URL}", apiUrl), `${name}: ${path} differs`);
    }
    for (const path of Object.keys(fixture.files)) if (!(path in fixture.expected.files)) assert.equal(after[path], fixture.files[path], `${name}: ${path} was changed`);
    assert.deepEqual(report.files_written, fixture.expected.files_written);
    if (fixture.expected.hosts) assert.deepEqual(report.hosts, fixture.expected.hosts);
    if (fixture.expected.warnings) assert.deepEqual(report.warnings, fixture.expected.warnings);
    const installs = d.recorded.filter((r) => r.command !== "vercel");
    if (fixture.expected.install) {
      const [command, args] = fixture.expected.install;
      assert.deepEqual(installs.map((r) => [r.command, r.args]), [[command, args.map((a) => a.replace("{VERSION}", VERSION))]]);
      assert.equal(posts.length, 1, "exactly one POST /v1/installs");
      assert.equal(posts[0]?.path, "/v1/installs");
      assert.match(String(posts[0]?.headers["idempotency-key"]), /^[0-9a-f-]{36}$/);
      assert.equal((posts[0]?.body as { form: string }).form, "next");
      assert.equal(report.install_id, INSTALL_ID);
      assert.equal(report.claim_url, CLAIM);
      assert.ok(!JSON.stringify(report).includes(KEY), "the key never appears in the report");
      assert.ok(!JSON.stringify(report).includes("AQIDBAUGBwgJ"), "the salt never appears in the report");
      assert.equal(readLock(root)?.install_id, INSTALL_ID);
    } else {
      assert.equal(installs.length, 0);
      assert.equal(posts.length, 0, "no call reaches Scope on a refused project");
    }
  });
}

test("a rerun replays the same idempotency key and does not rewrite the wrapped proxy twice", async () => {
  posts.length = 0;
  answer = created();
  const fixture = JSON.parse(readFileSync(join(FIXTURES, "next-16-existing-proxy.json"), "utf8")) as Fixture;
  const root = materialise(fixture.files);
  const first = await initNext({ ...argsOf(fixture.args), cwd: root }, deps());
  assert.equal(first.exit_code, 0);
  const second = await initNext({ ...argsOf(fixture.args), cwd: root }, deps());
  assert.equal(second.exit_code, 0);
  assert.equal(posts.length, 2);
  assert.equal(posts[0]?.headers["idempotency-key"], posts[1]?.headers["idempotency-key"]);
  assert.equal(readFileSync(join(root, "proxy.ts"), "utf8"), fixture.expected.files["proxy.ts"]);
  assert.ok(second.warnings.some((w) => /already calls withJourneys/.test(w)));
});

test("the OIDC form: VERCEL_OIDC_TOKEN in .env.local, no key written, the token sent", async () => {
  posts.length = 0;
  answer = created({ key: undefined });
  const claims = Buffer.from(JSON.stringify({ sub: "owner:acme:project:acme-app:environment:production", iss: "https://oidc.vercel.com/acme" })).toString("base64url");
  const token = `eyJhbGciOiJSUzI1NiJ9.${claims}.c2ln`;
  const fixture = JSON.parse(readFileSync(join(FIXTURES, "next-16-fresh.json"), "utf8")) as Fixture;
  const root = materialise({ ...fixture.files, ".env.local": `VERCEL_OIDC_TOKEN=${token}\n`, ".vercel/project.json": JSON.stringify({ projectId: "prj_1", orgId: "team_1" }) });
  const report = await initNext({ ...argsOf(["--hosts", "acme.example", "--docs-host", "same", "--yes"]), cwd: root }, deps({ vercelAuthenticated: true }));
  assert.equal(report.exit_code, 0, JSON.stringify(report));
  assert.equal(report.oidc, true);
  assert.equal((posts[0]?.body as { oidc_token?: string }).oidc_token, token);
  const env = readFileSync(join(root, ".env.local"), "utf8");
  assert.ok(!env.includes("JOURNEYS_INSTALL_KEY"), "no key under OIDC");
  assert.ok(env.includes("JOURNEYS_INSTALL_ID=") && env.includes("JOURNEYS_SALT="));
  assert.ok(env.startsWith(`VERCEL_OIDC_TOKEN=${token}`), "the existing line is kept");
  const vercelAdds = (await Promise.resolve(report)) && report.env_written.filter((e) => e.includes("vercel"));
  assert.deepEqual(vercelAdds, ["JOURNEYS_INSTALL_ID (vercel: production, preview, development)", "JOURNEYS_SALT (vercel: production, preview, development)", "JOURNEYS_API_URL (vercel: production, preview, development)"]);
});

test("--oidc without a token exits 4 and names the one step", async () => {
  posts.length = 0;
  const fixture = JSON.parse(readFileSync(join(FIXTURES, "next-16-fresh.json"), "utf8")) as Fixture;
  const root = materialise(fixture.files);
  const report = await initNext({ ...argsOf(["--oidc", "--hosts", "acme.example", "--yes"]), cwd: root }, deps());
  assert.equal(report.exit_code, 4);
  assert.match(report.next_step, /OIDC/);
  assert.equal(posts.length, 0);
});

test(".env.local not ignored: exit 6, the files written but no secret in a tracked file", async () => {
  posts.length = 0;
  answer = created();
  const fixture = JSON.parse(readFileSync(join(FIXTURES, "next-16-fresh.json"), "utf8")) as Fixture;
  const root = materialise({ ...fixture.files, ".gitignore": "node_modules/\n" });
  const report = await initNext({ ...argsOf(fixture.args), cwd: root }, deps());
  assert.equal(report.exit_code, 6);
  assert.ok(!existsSync(join(root, ".env.local")));
  assert.ok(report.env_pending.length >= 3);
  assert.match(report.next_step, /\.gitignore/);
});

test("a proxy file the wrap does not understand: the other steps finish and the exit is 3 with the two lines", async () => {
  posts.length = 0;
  answer = created();
  const fixture = JSON.parse(readFileSync(join(FIXTURES, "next-16-existing-proxy.json"), "utf8")) as Fixture;
  const root = materialise({ ...fixture.files, "proxy.ts": "export default class Proxy {}\n" });
  const report = await initNext({ ...argsOf(fixture.args), cwd: root }, deps());
  assert.equal(report.exit_code, 3);
  assert.equal(readFileSync(join(root, "proxy.ts"), "utf8"), "export default class Proxy {}\n", "the file was left alone");
  assert.ok(report.manual?.some((m) => m.includes("withJourneys({ next:")));
  assert.equal(posts.length, 1, "the install was still created");
  assert.ok(existsSync(join(root, ".env.local")));
});

test("the API refusing with 429 exits 5 with the Retry-After", async () => {
  posts.length = 0;
  answer = { status: 429, body: { error: { code: "install_rate_limited", message: "five per hour" }, request_id: "req_1" }, headers: { "retry-after": "1800" } };
  const fixture = JSON.parse(readFileSync(join(FIXTURES, "next-16-fresh.json"), "utf8")) as Fixture;
  const root = materialise(fixture.files);
  const report = await initNext({ ...argsOf(fixture.args), cwd: root }, deps());
  assert.equal(report.exit_code, 5);
  assert.match(report.next_step, /1800/);
});

test("uninstall reverses the wrap, the created instrumentation and the lock, and never calls the API", async () => {
  posts.length = 0;
  answer = created();
  const fixture = JSON.parse(readFileSync(join(FIXTURES, "next-16-existing-proxy.json"), "utf8")) as Fixture;
  const root = materialise(fixture.files);
  const d = deps();
  await initNext({ ...argsOf(fixture.args), cwd: root }, d);
  const callsBefore = posts.length;
  const report = await uninstallNext(root, d.exec);
  assert.equal(report.ok, true, JSON.stringify(report));
  assert.equal(readFileSync(join(root, "proxy.ts"), "utf8"), fixture.files["proxy.ts"]!.replace('matcher: ["/dashboard/:path*"]', 'matcher: ["/dashboard/:path*", "/((?!_next/static|_next/image|favicon.ico).*)"]'), "the wrap is undone (the merged matcher stays, it is harmless)");
  assert.equal(readFileSync(join(root, "instrumentation.ts"), "utf8"), fixture.files["instrumentation.ts"]);
  assert.ok(!existsSync(join(root, ".journeys")));
  assert.equal(posts.length, callsBefore);
  assert.ok(d.recorded.some((r) => r.command === "pnpm" && r.args[0] === "remove"));
});

test("wrapProxySource and unwrapProxySource round-trip the three shapes", () => {
  const named = "export default async function proxy(req) {\n  return null\n}\n";
  const w1 = wrapProxySource(named);
  assert.equal(w1.ok, true);
  assert.equal(w1.previous, "proxy");
  assert.equal(unwrapProxySource(w1.source, "proxy").replace(/export const config[\s\S]*$/, "").trim(), named.trim());
  const expression = "import { x } from \"./x\"\n\nexport default (req) => x(req)\n";
  const w2 = wrapProxySource(expression);
  assert.equal(w2.ok, true);
  assert.equal(w2.previous, "journeysPrevious");
  assert.ok(w2.source.includes("const journeysPrevious = (req) => x(req)"));
  const refused = wrapProxySource("export const config = { matcher: someVariable }\nexport default function p() {}\n");
  assert.equal(refused.ok, false);
  assert.equal(refused.manual.length, 2);
});
