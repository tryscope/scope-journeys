import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ApiError, createClient, DEFAULT_API_URL, UnreachableError, type InstallCreateRequest, type InstallEnvironment } from "./client.js";
import { base64url, type InitDeps, type InitReport } from "./init-next.js";
import { readLock, LOCK_DIR, LOCK_FILE, type InitLock } from "./project.js";
import { cloudflareZones, dnsProxied, wranglerDelete, wranglerDeploy, wranglerSecretPut, wranglerWhoAmI, zoneOf, type Zone } from "./wrangler.js";

export interface InitCloudflareOptions {
  cwd: string;
  /** The directory written (`journeys/` by default, or --dir). */
  dir: string;
  /** The Worker's name (`scope-journeys` by default, or --name): one per install when an account fronts several zones. */
  name: string;
  apiUrl: string | null;
  hosts: string[];
  origin: string | null;
  environment: InstallEnvironment;
  packageVersion: string;
  yes: boolean;
  assertion?: { publicJwk: Record<string, unknown>; privateJwk: Record<string, unknown> } | null;
}

export interface CloudflareReport extends InitReport {
  deployment: { id: string | null; version: string | null } | null;
}

export const WORKER_NAME = "scope-journeys";
export const WORKER_NAME_SHAPE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export const COMPATIBILITY_DATE = "2026-10-01";

/** The wrangler.toml `init --cloudflare` writes: one route per host, the non-secret variables, the two secrets as `wrangler secret put` lines. */
export function wranglerToml(options: { name: string; hosts: Array<{ host: string; zone: string }>; installId: string; apiUrl: string; origin: string | null; environment: InstallEnvironment }): string {
  const lines = [`name = ${JSON.stringify(options.name)}`, 'main = "src/worker.ts"', `compatibility_date = ${JSON.stringify(COMPATIBILITY_DATE)}`, "routes = ["];
  for (const { host, zone } of options.hosts) lines.push(`  { pattern = ${JSON.stringify(`${host}/*`)}, zone_name = ${JSON.stringify(zone)} },`);
  lines.push("]", "", "[observability]", "enabled = true", "", "[vars]", `JOURNEYS_INSTALL_ID = ${JSON.stringify(options.installId)}`, `JOURNEYS_API_URL = ${JSON.stringify(options.apiUrl)}`, `JOURNEYS_NAME = ${JSON.stringify(options.name)}`);
  if (options.environment !== "production") lines.push(`JOURNEYS_ENVIRONMENT = ${JSON.stringify(options.environment)}`);
  if (options.origin) lines.push(`JOURNEYS_ORIGIN = ${JSON.stringify(options.origin)}`);
  lines.push("# Secrets, never in this file: `npx wrangler@4 secret put JOURNEYS_INSTALL_KEY`, `npx wrangler@4 secret put JOURNEYS_SALT` and `npx wrangler@4 secret put JOURNEYS_ASSERTION_KEY`", "# (journeys init set all three; .env.secrets beside this file holds them for the next init run and is ignored by git).", "");
  return lines.join("\n");
}

const readmeOf = (name: string): string =>
  [
    "# Scope Journeys on this zone",
    "",
    `This directory was written by \`journeys init --cloudflare\`: a Worker named \`${name}\` on the routes in wrangler.toml, running scope-journeys-cloudflare.`,
    "",
    "## Upgrades",
    "",
    "    npm update scope-journeys-cloudflare",
    "    npx wrangler@4 versions upload",
    "    npx wrangler@4 versions deploy --percentage 10",
    "    npx wrangler@4 versions deploy --percentage 100",
    "",
    "A sensor version reaches a tenth of the traffic first; the console shows both versions in the records' observer.version while the split runs.",
    "",
    "## Remove",
    "",
    "    journeys uninstall --cloudflare",
    "",
  ].join("\n");

function blank(form: "cloudflare", environment: InstallEnvironment): CloudflareReport {
  return { install_id: null, form, hosts: [], environment, oidc: false, files_written: [], env_written: [], env_pending: [], claim_url: null, next_step: "", warnings: [], exit_code: 0, deployment: null };
}

/**
 * `journeys init --cloudflare --host a --host b`: the
 * Worker under the customer's own account on a route per host, the two secrets, the claim URL.
 */
export async function initCloudflare(options: InitCloudflareOptions, deps: InitDeps): Promise<CloudflareReport> {
  const report = blank("cloudflare", options.environment);
  const say = (line: string): void => {
    if (deps.isTTY) deps.stdout(line);
  };
  if (options.hosts.length === 0) {
    report.exit_code = 2;
    report.next_step = "pass the hosts to front: journeys init --cloudflare --host docs.example.com --host api.example.com";
    return report;
  }
  if (!WORKER_NAME_SHAPE.test(options.name)) {
    report.exit_code = 2;
    report.next_step = `--name ${options.name} is not a Worker name: lowercase letters, digits and dashes, 63 at most, starting and ending with a letter or digit`;
    return report;
  }
  const who = await wranglerWhoAmI(deps.exec, options.cwd);
  if (!who.loggedIn) {
    report.exit_code = 4;
    report.next_step = "run `npx wrangler login` and try again";
    return report;
  }
  const token = deps.env.CLOUDFLARE_API_TOKEN ?? null;
  let zones: Zone[] = [];
  if (token) {
    try {
      zones = await cloudflareZones(deps.fetch, token);
    } catch (error) {
      report.warnings.push(`the zone list could not be read (${error instanceof Error ? error.message : String(error)}); the routes are written as given`);
    }
  } else report.warnings.push("CLOUDFLARE_API_TOKEN is not set: the hosts were not checked against your zones and the DNS records were not checked for the proxy");
  const routes: Array<{ host: string; zone: string }> = [];
  for (const host of options.hosts) {
    const zone = zones.length ? zoneOf(host, zones) : null;
    if (zones.length && !zone) {
      report.exit_code = 2;
      report.next_step = `${host} belongs to no zone of account ${who.accountName ?? who.accountId ?? "?"}: add the zone to Cloudflare or pass a host it serves`;
      return report;
    }
    routes.push({ host, zone: zone?.name ?? host.split(".").slice(-2).join(".") });
  }
  report.hosts = options.hosts;

  const dir = join(options.cwd, options.dir);
  mkdirSync(join(dir, "src"), { recursive: true });
  const lock: InitLock = readLock(dir) ?? { idempotency_key: randomUUID(), created_at: deps.now().toISOString(), form: "cloudflare", install_id: null, proxy_file: null, proxy_created: false, proxy_previous: null, instrumentation_created: false, instrumentation_added_export: false, dependency: `scope-journeys-cloudflare@${options.packageVersion}` };
  mkdirSync(join(dir, LOCK_DIR), { recursive: true });
  writeFileSync(join(dir, LOCK_DIR, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`);

  const apiUrl = options.apiUrl ?? deps.env.JOURNEYS_API_URL ?? DEFAULT_API_URL;
  const client = createClient({ baseUrl: apiUrl, credential: null, fetch: deps.fetch });
  const body: InstallCreateRequest = { form: "cloudflare", hosts: options.hosts, environment: options.environment, package: { name: "scope-journeys-cloudflare", version: options.packageVersion, adapter: "cloudflare" } };
  if (options.assertion) body.assertion_jwk = options.assertion.publicJwk;
  let created;
  try {
    created = await client.createInstall(body, lock.idempotency_key);
  } catch (error) {
    report.exit_code = 5;
    if (error instanceof ApiError && error.status === 429) report.next_step = `Scope refused: ${error.code}; retry after ${error.retryAfterSeconds ?? "a while"} seconds (five installs per address per hour)`;
    else if (error instanceof ApiError) report.next_step = `Scope refused the install: ${error.code} (${error.message})`;
    else if (error instanceof UnreachableError) report.next_step = `${error.message}; check JOURNEYS_API_URL (${apiUrl}) and try again`;
    else report.next_step = `the install could not be created: ${error instanceof Error ? error.message : String(error)}`;
    return report;
  }
  const install = created.install;
  report.install_id = install.install_id;
  report.claim_url = created.claim_url;
  lock.install_id = install.install_id;
  writeFileSync(join(dir, LOCK_DIR, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`);
  if (!created.key) {
    report.exit_code = 5;
    report.next_step = "the API returned no install key for the Worker form; run `journeys init --cloudflare` again or rotate the key in the console";
    return report;
  }

  const rel = (name: string): string => `${options.dir}/${name}`;
  writeFileSync(join(dir, "package.json"), `${JSON.stringify({ name: "scope-journeys-worker", private: true, type: "module", dependencies: { "scope-journeys-cloudflare": options.packageVersion } }, null, 2)}\n`);
  writeFileSync(join(dir, "src", "worker.ts"), 'export { default } from "scope-journeys-cloudflare/worker"\n');
  const toml = wranglerToml({ name: options.name, hosts: routes, installId: install.install_id, apiUrl, origin: options.origin, environment: options.environment });
  say(`+++ ${rel("wrangler.toml")}\n${toml}`);
  writeFileSync(join(dir, "wrangler.toml"), toml);
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n.wrangler/\n.env.secrets\n.journeys/\n");
  writeFileSync(join(dir, "README.md"), readmeOf(options.name));
  report.files_written.push(rel("package.json"), rel("src/worker.ts"), rel("wrangler.toml"), rel(".gitignore"), rel("README.md"));

  const salt = base64url(deps.random(32));
  const secrets: Array<{ name: string; value: string }> = [{ name: "JOURNEYS_INSTALL_KEY", value: created.key }, { name: "JOURNEYS_SALT", value: salt }];
  if (options.assertion) secrets.push({ name: "JOURNEYS_ASSERTION_KEY", value: JSON.stringify({ ...options.assertion.privateJwk, kid: `${created.install.install_id}:1` }) });
  writeFileSync(join(dir, ".env.secrets"), `${secrets.map((s) => `${s.name}=${s.value}`).join("\n")}\n`);
  report.files_written.push(rel(".env.secrets"));
  say(`The salt (keep it; it is in ${rel(".env.secrets")}, ignored by git): JOURNEYS_SALT=${salt}`);

  const installed = await deps.exec("npm", ["install", "--no-audit", "--no-fund"], { cwd: dir }).catch(() => ({ code: 1, stdout: "", stderr: "" }));
  if (installed.code !== 0) report.warnings.push(`npm install in ${options.dir} failed; run it by hand before deploying`);

  for (const s of secrets) {
    if (await wranglerSecretPut(deps.exec, dir, s.name, s.value)) report.env_written.push(`${s.name} (wrangler secret)`);
    else report.env_pending.push(`cd ${options.dir} && npx wrangler@4 secret put ${s.name}   # (from .env.secrets)`);
  }

  const deployed = await wranglerDeploy(deps.exec, dir);
  if (deployed.ok) report.deployment = { id: deployed.deploymentId, version: deployed.versionId };
  else {
    report.exit_code = 5;
    report.warnings.push(`wrangler deploy failed: ${deployed.output.split("\n").slice(-3).join(" | ")}`);
  }

  if (token && zones.length) {
    for (const { host } of routes) {
      const zone = zoneOf(host, zones);
      if (!zone) continue;
      const proxied = await dnsProxied(deps.fetch, token, zone.id, host).catch(() => null);
      if (proxied === false) report.warnings.push(`the DNS record for ${host} is not proxied; enable the proxy (orange cloud) for the route to apply`);
      else if (proxied === null) report.warnings.push(`no DNS record answers for ${host}; the route applies once a proxied record exists`);
    }
  }

  report.next_step = report.exit_code === 0 ? "run `journeys doctor` to confirm every host is fronted; open the claim URL to bind the install to your account" : "fix the deploy, then `cd journeys && npx wrangler@4 deploy`";
  return report;
}

export function renderCloudflareReport(report: CloudflareReport): string[] {
  const lines: string[] = [];
  if (report.install_id) lines.push(`install     ${report.install_id}`);
  lines.push("form        cloudflare");
  if (report.hosts.length) lines.push(`routes      ${report.hosts.map((h) => `${h}/*`).join(", ")}`);
  if (report.files_written.length) lines.push(`files       ${report.files_written.join(", ")}`);
  if (report.env_written.length) lines.push(`secrets     ${report.env_written.join("; ")}`);
  if (report.env_pending.length) lines.push("pending     ", ...report.env_pending.map((l) => `              ${l}`));
  if (report.deployment) lines.push(`deployed    ${report.deployment.id ?? "?"} (version ${report.deployment.version ?? "?"})`);
  if (report.claim_url) lines.push(`claim       ${report.claim_url}`);
  for (const w of report.warnings) lines.push(`warning     ${w}`);
  lines.push(`next        ${report.next_step}`);
  return lines;
}

export interface CloudflareUninstallReport {
  ok: boolean;
  form: "cloudflare";
  removed: string[];
  restored: string[];
  manual: string[];
  next_step: string;
}

/** `journeys uninstall --cloudflare`: the Worker and its routes go; the product is as it was. */
export async function uninstallCloudflare(cwd: string, dirName: string, deps: InitDeps): Promise<CloudflareUninstallReport> {
  const dir = join(cwd, dirName);
  const report: CloudflareUninstallReport = { ok: true, form: "cloudflare", removed: [], restored: [], manual: [], next_step: "" };
  if (!existsSync(join(dir, "wrangler.toml"))) return { ...report, ok: false, next_step: `no ${dirName}/wrangler.toml here: was \`journeys init --cloudflare\` run in this directory?` };
  const name = /^name\s*=\s*"([^"]+)"/m.exec(readFileSync(join(dir, "wrangler.toml"), "utf8"))?.[1] ?? WORKER_NAME;
  const routes = [...readFileSync(join(dir, "wrangler.toml"), "utf8").matchAll(/pattern = "([^"]+)"/g)].map((m) => m[1]);
  if (await wranglerDelete(deps.exec, dir, name)) report.removed.push(`Worker ${name} (routes ${routes.join(", ")})`);
  else report.manual.push(`cd ${dirName} && npx wrangler@4 delete --name ${name}`);
  rmSync(dir, { recursive: true, force: true });
  report.removed.push(`${dirName}/`);
  report.next_step = "the product is as it was; the install stays in Scope and shows as stale";
  return report;
}
