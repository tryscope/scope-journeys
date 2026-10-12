// J3.9 step 4: `journeys rotate-salt` against a mocked API and a recording exec: the epoch bumped
// on the install first (current plus one, with an idempotency key), then the salt generated and
// written where init wrote the first, then the deploy instruction with the disclosed window; an
// unclaimed or revoked install refuses; a refusal from Scope changes no salt.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { rotateSalt } from "../src/cli/rotate-salt.js";
import type { Exec } from "../src/cli/vercel.js";

const INSTALL_ID = "jin_test0000000000000000000000";
const NOW = Date.parse("2026-10-10T12:00:00.000Z");

function world(options: { state?: string; epoch?: number; refuse?: number } = {}) {
  const posted: Array<{ body: Record<string, unknown>; idempotency: string | null }> = [];
  const commands: string[] = [];
  const exec: Exec = async (command, args, o) => {
    commands.push([command, ...args].join(" ") + (o.input ? ` <stdin:${o.input.trim().length}>` : ""));
    return { code: 0, stdout: "", stderr: "" };
  };
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const install = { install_id: INSTALL_ID, form: "next", hosts: ["acme.example"], state: options.state ?? "live", salt_epoch: options.epoch ?? 3, policy_version: 3, package: null };
    if (url.endsWith(`/v1/installs/${INSTALL_ID}`) && (!init?.method || init.method === "GET")) return Response.json({ install });
    if (init?.method === "POST" && url.endsWith(`/v1/installs/${INSTALL_ID}`)) {
      posted.push({ body: JSON.parse(String(init.body)) as Record<string, unknown>, idempotency: new Headers(init.headers).get("idempotency-key") });
      if (options.refuse) return Response.json({ error: { code: "salt_epoch_not_next", message: "no", request_id: "r" } }, { status: options.refuse });
      return Response.json({ install: { ...install, salt_epoch: install.salt_epoch + 1 } });
    }
    return new Response("nope", { status: 404 });
  }) as typeof globalThis.fetch;
  let drawn = 0;
  return { posted, commands, deps: { fetch: fetchFn, exec, env: { JOURNEYS_API_URL: "https://api.mock" }, now: () => new Date(NOW), random: (bytes: number) => Uint8Array.from({ length: bytes }, (_, i) => (i * 7 + drawn++) & 255) } };
}

test("the Next form: epoch 3 becomes 4 on the install first, then a new salt lands in .env.local and the Vercel project, then the deploy instruction with the window", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "journeys-salt-"));
  writeFileSync(join(cwd, ".env.local"), `JOURNEYS_INSTALL_ID=${INSTALL_ID}\nJOURNEYS_INSTALL_KEY=sjk_test_dddddddddddddddddddddddddddddddd\nJOURNEYS_SALT=oldsalt\n`);
  mkdirSync(join(cwd, ".vercel"));
  writeFileSync(join(cwd, ".vercel", "project.json"), JSON.stringify({ projectId: "prj_1", orgId: "team_1" }));
  const w = world();
  const report = await rotateSalt({ cwd, cloudflare: false, dir: "journeys", install: null, token: null, apiUrl: null }, w.deps);
  assert.equal(report.exit_code, 0, JSON.stringify(report));
  assert.deepEqual(w.posted.map((p) => p.body), [{ salt_epoch: 4 }]);
  assert.match(w.posted[0]?.idempotency ?? "", /^[0-9a-f-]{36}$/);
  assert.equal(report.salt_epoch, 4);
  assert.equal(report.previous_epoch, 3);
  assert.equal(report.bumped_at, "2026-10-10T12:00:00.000Z");
  const env = readFileSync(join(cwd, ".env.local"), "utf8");
  const salt = /JOURNEYS_SALT=(.*)/.exec(env)?.[1] ?? "";
  assert.notEqual(salt, "oldsalt");
  assert.match(salt, /^[A-Za-z0-9_-]{43}$/, "32 random bytes, base64url");
  assert.ok(env.includes(`JOURNEYS_INSTALL_ID=${INSTALL_ID}`));
  assert.deepEqual(report.env_written, ["JOURNEYS_SALT (.env.local)", "JOURNEYS_SALT (vercel: production, preview, development)"]);
  assert.ok(w.commands.some((c) => c.startsWith("vercel env add JOURNEYS_SALT production preview development --force --yes --sensitive <stdin:43>")), w.commands.join("\n"));
  assert.equal(report.next_step, "deploy now (production, then preview); records between 2026-10-10T12:00:00.000Z and your deploy carry epoch 4 with the old salt and join nothing after the deploy");
});

test("the Cloudflare form: the secret through wrangler and .env.secrets, the deploy instruction for the Worker", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "journeys-salt-"));
  mkdirSync(join(cwd, "journeys"));
  writeFileSync(join(cwd, "journeys", "wrangler.toml"), `name = "scope-journeys"\n[vars]\nJOURNEYS_INSTALL_ID = "${INSTALL_ID}"\n`);
  writeFileSync(join(cwd, "journeys", ".env.secrets"), "JOURNEYS_INSTALL_KEY=sjk_test_dddddddddddddddddddddddddddddddd\nJOURNEYS_SALT=oldsalt\n");
  const w = world({ epoch: 1 });
  const report = await rotateSalt({ cwd, cloudflare: true, dir: "journeys", install: null, token: null, apiUrl: null }, w.deps);
  assert.equal(report.exit_code, 0, JSON.stringify(report));
  assert.equal(report.salt_epoch, 2);
  assert.deepEqual(report.env_written, ["JOURNEYS_SALT (journeys/.env.secrets)", "JOURNEYS_SALT (wrangler secret)"]);
  assert.ok(w.commands.some((c) => c.startsWith("npx --yes wrangler@4 secret put JOURNEYS_SALT <stdin:43>")), w.commands.join("\n"));
  const secrets = readFileSync(join(cwd, "journeys", ".env.secrets"), "utf8");
  assert.ok(!secrets.includes("JOURNEYS_SALT=oldsalt") && secrets.includes("JOURNEYS_INSTALL_KEY=sjk_test_"));
  assert.match(report.next_step, /^deploy now \(cd journeys && npx wrangler@4 deploy\); records between/);
});

test("an unclaimed or revoked install refuses before anything changes; a refusal from Scope leaves the salt alone", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "journeys-salt-"));
  writeFileSync(join(cwd, ".env.local"), `JOURNEYS_INSTALL_ID=${INSTALL_ID}\nJOURNEYS_INSTALL_KEY=sjk_test_dddddddddddddddddddddddddddddddd\nJOURNEYS_SALT=oldsalt\n`);
  const unclaimed = await rotateSalt({ cwd, cloudflare: false, dir: "journeys", install: null, token: null, apiUrl: null }, world({ state: "unclaimed" }).deps);
  assert.equal(unclaimed.exit_code, 1);
  assert.match(unclaimed.next_step, /the install is unclaimed: claim it first/);
  const revoked = await rotateSalt({ cwd, cloudflare: false, dir: "journeys", install: null, token: null, apiUrl: null }, world({ state: "revoked" }).deps);
  assert.equal(revoked.exit_code, 1);
  const w = world({ refuse: 400 });
  const refused = await rotateSalt({ cwd, cloudflare: false, dir: "journeys", install: null, token: null, apiUrl: null }, w.deps);
  assert.equal(refused.exit_code, 5);
  assert.match(refused.next_step, /Scope did not advance the epoch \(400 salt_epoch_not_next\); the salt was not changed/);
  assert.ok(readFileSync(join(cwd, ".env.local"), "utf8").includes("JOURNEYS_SALT=oldsalt"));
  const none = await rotateSalt({ cwd: mkdtempSync(join(tmpdir(), "journeys-salt-")), cloudflare: false, dir: "journeys", install: null, token: null, apiUrl: null }, world().deps);
  assert.equal(none.exit_code, 5);
});
