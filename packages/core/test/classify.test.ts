// The surface map drives the classifier. Every route value is reached by at least one url
// in the toy map (the test prints the uncovered set and asserts it empty), the precedence holds on
// three overlapping cases, the routes form still classifies the way the regular expressions did,
// and the reader table names one agent string per family.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { classifyReader, classifyRoute } from "../src/classify.js";
import { compilePolicy, type Route } from "../src/policy.js";

const ROOT = new URL("../../../", import.meta.url).pathname;
const toy = compilePolicy(JSON.parse(readFileSync(join(ROOT, "fixtures", "synthetic", "policy.json"), "utf8")));

const EVERY_ROUTE: Route[] = ["docs", "docs_root", "download", "api", "mcp", "oauth.register", "oauth.authorize", "oauth.token", "oauth.approve", "device.start", "device.poll", "device.approve", "signup", "hooks.create", "hooks.catch", "credentials", "trial", "finder", "passthrough", "other", "cli.init", "cli.beacon"];

const SAMPLE: Record<string, Route> = {
  "/docs/quickstart": "docs",
  "/docs/quickstart.md": "docs",
  "/pricing": "docs",
  "/": "docs_root",
  "/llms.txt": "docs_root",
  "/dl/acme-cli.tgz": "download",
  "/api/v1/hooks": "api",
  "/.well-known/oauth-authorization-server": "api",
  "/mcp": "mcp",
  "/oauth/register": "oauth.register",
  "/oauth/authorize": "oauth.authorize",
  "/oauth/token": "oauth.token",
  "/api/oauth/approve": "oauth.approve",
  "/api/device/start": "device.start",
  "/api/device/poll": "device.poll",
  "/api/device/approve": "device.approve",
  "/signup": "signup",
  "/api/hooks": "hooks.create",
  "/hooks/catch/hk_1": "hooks.catch",
  "/api/credentials": "credentials",
  "/api/sdk/trial": "trial",
  "/api/docs/find": "finder",
  "/assets/logo.png": "passthrough",
  "/_next/static/chunk.js": "passthrough",
  "/guides/something-the-map-does-not-know": "other",
  "/api/cli/init": "cli.init",
  "/api/cli/beacon": "cli.beacon",
};

test("every scope.route value is reached by at least one url in the toy map", () => {
  const reached = new Set<Route>();
  for (const [path, route] of Object.entries(SAMPLE)) {
    const got = classifyRoute(path, toy);
    assert.equal(got.route, route, `${path} classified as ${got.route}, expected ${route}`);
    reached.add(got.route);
  }
  const uncovered = EVERY_ROUTE.filter((r) => !reached.has(r));
  console.log(`uncovered route values: ${JSON.stringify(uncovered)}`);
  assert.deepEqual(uncovered, []);
});

test("observed, content and page-like follow the role", () => {
  assert.deepEqual(classifyRoute("/docs/quickstart", toy), { route: "docs", observed: false, content: true, known: true, hookId: null });
  assert.deepEqual(classifyRoute("/api/device/poll", toy), { route: "device.poll", observed: true, content: false, known: true, hookId: null });
  assert.equal(classifyRoute("/hooks/catch/hk_1", toy).hookId, "hk_1");
  assert.equal(classifyRoute("/dl/acme-cli.tgz", toy).observed, false, "a download is recorded but its body is never read");
  const unknown = classifyRoute("/guides/x", toy);
  assert.deepEqual(unknown, { route: "other", observed: false, content: false, known: false, hookId: null }, "a path the map does not name is other: not observed, not a page, whatever the origin serves");
  assert.equal(classifyRoute("/api/v1/hooks", toy).content, false);
});

test("precedence: custom beats api, passthrough beats docs, finder beats api", () => {
  const custom = compilePolicy({
    ...JSON.parse(readFileSync(join(ROOT, "fixtures", "synthetic", "policy.json"), "utf8")),
    surfaces: { ...toy.document.surfaces, custom: [{ pattern: "^/api/v1/legacy-signup$", role: "signup" }], passthrough: ["^/docs/internal/"] },
  });
  assert.equal(classifyRoute("/api/v1/legacy-signup", custom).route, "signup", "custom over api");
  assert.equal(classifyRoute("/docs/internal/notes", custom).route, "passthrough", "passthrough over docs");
  assert.equal(classifyRoute("/api/docs/find", custom).route, "finder", "finder over api");
});

test("the routes form (four regular expressions) still classifies content, observed and passthrough as the expressions say", () => {
  // The route expressions of the lab's seventh policy, the one the oracle runs: content is what
  // not_content does not name, observed what observed names, passthrough first.
  const routes = compilePolicy({
    schema: "scope.policy/1",
    version: 7,
    routes: {
      run_prefix: "^/t/([a-z0-9]{8}|[a-z0-9]{16})(/.*)?$",
      passthrough: "^/api/lab/",
      not_content: "^/(api|dl|md|_next|sign-up|device|claim|app|oauth|\\.well-known|probe|static|hooks)(/|$)|^/(llms-full\\.txt|robots\\.txt|favicon\\.ico|sitemap\\.xml|[0-9a-f]{32}\\.txt)$",
      observed: "^/(api|oauth|hooks|device|claim|sign-up)(/|$)",
      text_faces: "^/llms\\.txt$",
    },
    secrets: { fields: [], shapes: [], uri_fields: {} },
    headers: {},
    forward: { headers: {} },
    rules: [],
  });
  const table: Array<[string, Route, boolean, boolean]> = [
    ["/docs/install", "docs", false, true],
    ["/docs/install.md", "docs", false, true],
    ["/llms.txt", "docs_root", false, true],
    ["/api/device/start", "api", true, false],
    ["/api/mcp/mcp", "api", true, false],
    ["/oauth/token", "api", true, false],
    ["/dl/v/cli.tgz", "other", false, false],
    ["/api/lab/mw", "passthrough", false, false],
    ["/robots.txt", "other", false, false],
  ];
  for (const [path, route, observed, content] of table) {
    const got = classifyRoute(path, routes);
    assert.equal(got.route, route, path);
    assert.equal(got.observed, observed, `${path} observed`);
    assert.equal(got.content, content, `${path} content`);
    assert.equal(got.known, true, "the routes form names every path");
  }
  assert.equal(routes.runPrefix?.exec("/t/abcd1234/docs/install")?.[2], "/docs/install");
});

test("the reader table names one agent string per family, the lab's readerOf exactly", () => {
  const none = { sec_ch_ua: false, sec_fetch_dest: null, sec_fetch_mode: null, upgrade_insecure: false };
  const clients = toy.surfaces?.clients ?? null;
  const cases: Array<[string, string, string | null, { sec_ch_ua: boolean; sec_fetch_dest: string | null; sec_fetch_mode: string | null; upgrade_insecure: boolean }, string | null]> = [
    ["claude-code", "Claude-User (claude-code/2.1.0; +https://www.anthropic.com/claude-code)", "text/markdown", none, null],
    ["claude-ai", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)", "*/*", none, null],
    ["openai", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "*/*", none, null],
    ["openai", "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot", "*/*", none, null],
    ["exa", "Mozilla/5.0 (compatible)", "*/*", none, '"https://crawler.exa.ai"'],
    ["signed", "Mozilla/5.0 (compatible)", "*/*", none, '"https://some.other.bot"'],
    ["cursor", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", "text/markdown, text/plain;q=0.9", none, null],
    ["browser", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", "text/html", { ...none, sec_ch_ua: true, sec_fetch_dest: "document" }, null],
    ["vendor-client", "acme-cli/0.3.0 node/v24.0.0", null, none, null],
    ["vendor-client", "acme-sdk/1.0.0", null, none, null],
    ["shell", "node", null, none, null],
    ["shell", "python-requests/2.32.3", null, none, null],
    ["shell", "curl/8.7.1", "*/*", none, null],
    ["shell", "undici", "*/*", none, null],
    ["unknown", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36", "text/html", none, null],
    ["unknown", "npm/10.9.2 node/v24.13.1 darwin arm64", "*/*", none, null],
  ];
  for (const [family, ua, accept, meta, signature] of cases) {
    assert.equal(classifyReader(ua, accept, meta, signature, null, clients), family, `${ua} with ${accept ?? "no accept"} and ${signature ?? "no signature"}`);
  }
  assert.equal(classifyReader("acme-cli/0.3.0", null, none, null, null, null), "unknown", "without the policy's clients patterns a CLI string names no vendor client");
});
