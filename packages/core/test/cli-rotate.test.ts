// `journeys rotate-assertion-key` against a mocked API and a recording exec: the new
// public key registered with its kid (version + 1, never the private part), the private key
// written where init wrote the first, the overlap deadline, the refusals.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { generateAssertionKeyPair } from "../src/cli/assertion-key.js";
import { rotateAssertionKey } from "../src/cli/rotate.js";
import type { Exec } from "../src/cli/vercel.js";

const INSTALL_ID = "jin_test0000000000000000000000";
const NOW = Date.parse("2026-10-10T12:00:00.000Z");

function world(options: { refuse?: number } = {}) {
  const posted: Array<{ url: string; body: Record<string, unknown>; idempotency: string | null }> = [];
  const commands: string[] = [];
  const exec: Exec = async (command, args, o) => {
    commands.push([command, ...args].join(" ") + (o.input ? " <stdin>" : ""));
    return { code: 0, stdout: "", stderr: "" };
  };
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST" && url.endsWith(`/v1/installs/${INSTALL_ID}`)) {
      posted.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown>, idempotency: new Headers(init.headers).get("idempotency-key") });
      if (options.refuse) return Response.json({ error: { code: "unauthorized", message: "no", request_id: "r" } }, { status: options.refuse });
      return Response.json({ install: { install_id: INSTALL_ID, form: "next", hosts: ["acme.example"], state: "live", salt_epoch: 1, policy_version: 3, package: null } });
    }
    return new Response("nope", { status: 404 });
  }) as typeof globalThis.fetch;
  return { posted, commands, deps: { fetch: fetchFn, exec, env: { JOURNEYS_API_URL: "https://api.mock" }, now: () => new Date(NOW) } };
}

test("the Next form: version 1 becomes 2, the public key goes to Scope, the private key to .env.local and the Vercel project", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "journeys-rotate-"));
  const first = generateAssertionKeyPair();
  writeFileSync(join(cwd, ".env.local"), `JOURNEYS_INSTALL_ID=${INSTALL_ID}\nJOURNEYS_INSTALL_KEY=sjk_test_dddddddddddddddddddddddddddddddd\nJOURNEYS_ASSERTION_KEY=${JSON.stringify({ ...first.privateJwk, kid: `${INSTALL_ID}:1` })}\n`);
  mkdirSync(join(cwd, ".vercel"));
  writeFileSync(join(cwd, ".vercel", "project.json"), JSON.stringify({ projectId: "prj_1", orgId: "team_1" }));
  const w = world();
  const report = await rotateAssertionKey({ cwd, cloudflare: false, dir: "journeys", install: null, token: null, apiUrl: null }, w.deps);
  assert.equal(report.exit_code, 0, JSON.stringify(report));
  assert.equal(report.kid, `${INSTALL_ID}:2`);
  assert.equal(report.previous_kid, `${INSTALL_ID}:1`);
  assert.equal(w.posted.length, 1);
  const jwk = w.posted[0]?.body.assertion_jwk as Record<string, unknown>;
  assert.equal(jwk.kid, `${INSTALL_ID}:2`);
  assert.equal(jwk.kty, "EC");
  assert.equal(jwk.crv, "P-256");
  assert.ok(typeof jwk.x === "string" && typeof jwk.y === "string");
  assert.ok(!("d" in jwk), "the private part never leaves");
  assert.match(w.posted[0]?.idempotency ?? "", /^[0-9a-f-]{36}$/);
  const written = readFileSync(join(cwd, ".env.local"), "utf8");
  const stored = JSON.parse(/JOURNEYS_ASSERTION_KEY=(.*)/.exec(written)?.[1] ?? "{}") as Record<string, unknown>;
  assert.equal(stored.kid, `${INSTALL_ID}:2`);
  assert.equal(stored.x, jwk.x);
  assert.ok(typeof stored.d === "string", "the private key is in .env.local");
  assert.ok(written.includes(`JOURNEYS_INSTALL_ID=${INSTALL_ID}`), "the other variables are kept");
  assert.deepEqual(report.env_written, ["JOURNEYS_ASSERTION_KEY (.env.local)", "JOURNEYS_ASSERTION_KEY (vercel: production, preview, development)"]);
  assert.ok(w.commands.some((c) => c.startsWith("vercel env add JOURNEYS_ASSERTION_KEY production preview development --force --yes --sensitive <stdin>")), w.commands.join("\n"));
  assert.equal(report.overlap_until, "2026-10-17T12:00:00.000Z");
  assert.match(report.next_step, /the previous key verifies until 2026-10-17T12:00:00.000Z/);
});

test("the Cloudflare form: the secret goes through wrangler and .env.secrets; the first rotation without a stored key is version 1", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "journeys-rotate-"));
  mkdirSync(join(cwd, "journeys"));
  writeFileSync(join(cwd, "journeys", "wrangler.toml"), `name = "scope-journeys"\n[vars]\nJOURNEYS_INSTALL_ID = "${INSTALL_ID}"\n`);
  writeFileSync(join(cwd, "journeys", ".env.secrets"), "JOURNEYS_INSTALL_KEY=sjk_test_dddddddddddddddddddddddddddddddd\nJOURNEYS_SALT=s\n");
  const w = world();
  const report = await rotateAssertionKey({ cwd, cloudflare: true, dir: "journeys", install: null, token: null, apiUrl: null }, w.deps);
  assert.equal(report.exit_code, 0, JSON.stringify(report));
  assert.equal(report.kid, `${INSTALL_ID}:1`);
  assert.equal(report.previous_kid, null);
  assert.deepEqual(report.env_written, ["JOURNEYS_ASSERTION_KEY (journeys/.env.secrets)", "JOURNEYS_ASSERTION_KEY (wrangler secret)"]);
  assert.ok(w.commands.some((c) => c === "npx --yes wrangler@4 secret put JOURNEYS_ASSERTION_KEY <stdin>"), w.commands.join("\n"));
  const secrets = readFileSync(join(cwd, "journeys", ".env.secrets"), "utf8");
  assert.ok(secrets.includes("JOURNEYS_SALT=s"), "the other secrets are kept");
  assert.ok(/JOURNEYS_ASSERTION_KEY=\{.*"kid":"jin_test0000000000000000000000:1".*\}/.test(secrets));
  assert.match(report.next_step, /npx wrangler@4 deploy/);
});

test("Scope refusing the key writes nothing and exits 5; no install id exits 5", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "journeys-rotate-"));
  writeFileSync(join(cwd, ".env.local"), `JOURNEYS_INSTALL_ID=${INSTALL_ID}\nJOURNEYS_INSTALL_KEY=sjk_test_dddddddddddddddddddddddddddddddd\n`);
  const w = world({ refuse: 403 });
  const refused = await rotateAssertionKey({ cwd, cloudflare: false, dir: "journeys", install: null, token: null, apiUrl: null }, w.deps);
  assert.equal(refused.exit_code, 5);
  assert.match(refused.next_step, /Scope did not register the new key \(403 unauthorized\); nothing was written/);
  assert.ok(!readFileSync(join(cwd, ".env.local"), "utf8").includes("JOURNEYS_ASSERTION_KEY"));
  const none = await rotateAssertionKey({ cwd: mkdtempSync(join(tmpdir(), "journeys-rotate-")), cloudflare: false, dir: "journeys", install: null, token: null, apiUrl: null }, world().deps);
  assert.equal(none.exit_code, 5);
  assert.match(none.next_step, /no install id/);
});
