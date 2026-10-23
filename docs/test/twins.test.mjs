// The docs host's contract, checked against a running app (DOCS_URL): every page has a markdown
// twin at `/<path>.md` and under `Accept: text/markdown`, the HTML face names its twin, llms.txt
// lists every page, llms-full.txt carries every page, SKILL.md equals the package's, the reader's
// install id fills the snippets, and the sensor answers the probe in front of this very host.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const BASE = (process.env.DOCS_URL ?? "http://127.0.0.1:3917").replace(/\/$/, "");
const DOCS = new URL("../", import.meta.url).pathname;
const PAGES = JSON.parse(readFileSync(join(DOCS, "lib", "pages.json"), "utf8"));
// The pages the docs site must ship; the registry must carry each of them.
const REQUIRED = ["", "install/next", "install/cloudflare", "install/node", "install/envoy", "install/connectors", "install/agent", "doctor", "claim", "data-handling", "telemetry", "policy", "cli", "api", "security", "changelog", "exports", "the-loop"];
const mdPath = (p) => (p.slug === "" ? "/index.md" : `/${p.slug}.md`);
const htmlPath = (p) => (p.slug === "" ? "/" : `/${p.slug}`);

test("the registry carries every page the docs site must ship", () => {
  for (const slug of REQUIRED) assert.ok(PAGES.some((p) => p.slug === slug), `page ${slug || "/"} missing from lib/pages.json`);
});

test("every page answers as HTML, names its markdown twin, and the twin answers at /<path>.md and under Accept: text/markdown", async () => {
  for (const page of PAGES) {
    const html = await fetch(`${BASE}${htmlPath(page)}`, { headers: { accept: "text/html" } });
    assert.equal(html.status, 200, `${htmlPath(page)} html`);
    assert.match(html.headers.get("content-type") ?? "", /^text\/html/);
    const body = await html.text();
    assert.ok(body.includes(`<link rel="alternate" type="text/markdown" href="${mdPath(page)}">`), `${htmlPath(page)} names its twin`);
    assert.ok(body.includes(`<h1`), `${htmlPath(page)} renders a heading`);

    const twin = await fetch(`${BASE}${mdPath(page)}`);
    assert.equal(twin.status, 200, `${mdPath(page)}`);
    assert.match(twin.headers.get("content-type") ?? "", /^text\/markdown/);
    assert.ok((twin.headers.get("vary") ?? "").split(",").map((v) => v.trim().toLowerCase()).includes("accept"), `${mdPath(page)} varies on Accept (got ${twin.headers.get("vary")})`);
    const markdown = await twin.text();
    assert.match(markdown, /^# /, `${mdPath(page)} starts with a title`);

    const negotiated = await fetch(`${BASE}${htmlPath(page)}`, { headers: { accept: "text/markdown, text/html;q=0.9" } });
    assert.equal(negotiated.status, 200, `${htmlPath(page)} negotiated`);
    assert.match(negotiated.headers.get("content-type") ?? "", /^text\/markdown/);
    assert.equal(await negotiated.text(), markdown, `${htmlPath(page)}: the negotiated face is the twin`);
  }
});

test("llms.txt lists every page's twin, grouped; llms-full.txt carries every page", async () => {
  const llms = await fetch(`${BASE}/llms.txt`);
  assert.equal(llms.status, 200);
  assert.match(llms.headers.get("content-type") ?? "", /^text\/plain/);
  const text = await llms.text();
  assert.match(text, /^# Scope Journeys\n\n> /);
  for (const group of ["Install", "Verify", "Reference", "Policy"]) assert.ok(text.includes(`\n## ${group}\n`), `group ${group}`);
  for (const page of PAGES) assert.ok(text.includes(`](${BASE}${mdPath(page)}): `), `llms.txt lists ${mdPath(page)}`);
  assert.ok(text.includes(`${BASE}/SKILL.md`));
  const full = await fetch(`${BASE}/llms-full.txt`);
  assert.equal(full.status, 200);
  assert.match(full.headers.get("content-type") ?? "", /^text\/markdown/);
  const fullText = await full.text();
  for (const page of PAGES) assert.ok(fullText.includes(`<!-- page: ${BASE}${htmlPath(page)} (markdown: ${BASE}${mdPath(page)}) -->`), `llms-full.txt carries ${htmlPath(page)}`);
});

test("SKILL.md is served at the root and equals the package's file", async () => {
  const served = await fetch(`${BASE}/SKILL.md`);
  assert.equal(served.status, 200);
  assert.match(served.headers.get("content-type") ?? "", /^text\/markdown/);
  const expected = readFileSync(join(DOCS, "..", "packages", "core", "SKILL.md"), "utf8");
  assert.equal(await served.text(), expected);
  assert.match(expected, /^---\nname: scope-journeys-install\ndescription: /);
});

test("?install=jin_... fills the snippets with the reader's own install; anything else leaves the placeholder", async () => {
  const id = "jin_0123456789abcdefghijklmn";
  const filled = await (await fetch(`${BASE}/install/next.md?install=${id}`)).text();
  assert.ok(filled.includes(id));
  assert.ok(!filled.includes("jin_your_install_id"));
  const bogus = await (await fetch(`${BASE}/install/next.md?install=not-an-id`)).text();
  assert.ok(bogus.includes("jin_your_install_id"));
  assert.ok(!bogus.includes("not-an-id"));
  const htmlFilled = await (await fetch(`${BASE}/install/cloudflare?install=${id}`, { headers: { accept: "text/html" } })).text();
  assert.ok(htmlFilled.includes(id));
});

test("a path that is not a page answers 404 with the real pages listed, on both faces", async () => {
  const html = await fetch(`${BASE}/no/such/page`, { headers: { accept: "text/html" } });
  assert.equal(html.status, 404);
  assert.ok((await html.text()).includes('href="/install/next"'));
  const md = await fetch(`${BASE}/no/such/page.md`);
  assert.equal(md.status, 404);
  assert.match(md.headers.get("content-type") ?? "", /^text\/markdown/);
  assert.ok((await md.text()).includes(`${BASE}/install/next.md`));
});

test("the sensor fronts this host: the probe is answered by the sensor itself", async () => {
  const probe = await fetch(`${BASE}/.well-known/journeys-probe?journeys_probe=c21va2U`, { redirect: "manual" });
  assert.equal(probe.status, 204);
  assert.equal(probe.headers.get("x-journeys-probe"), process.env.DOCS_PROBE ?? "received", "a configured host answers received; a copy with no salt, as the smoke runs, no-salt (DOCS_PROBE)");
});
