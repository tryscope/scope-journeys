import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_API_URL } from "../policy-loader.js";
import { ApiError, createClient, UnreachableError, type InstallCreateRequest, type InstallEnvironment } from "./client.js";
import { base64url, type InitDeps, type InitReport } from "./init-next.js";
import { manualLines, mountSource, NODE_PACKAGE } from "./mount-file.js";
import { detectNode, readLock, upsertEnvFile, LOCK_DIR, LOCK_FILE, type InitLock, type NodeProject } from "./project.js";

export interface InitNodeOptions {
  cwd: string;
  apiUrl: string | null;
  hosts: string[] | null;
  docsHost: string | null;
  host: string | null;
  /** The entry file the mount goes into when the project does not name one. */
  entry: string | null;
  yes: boolean;
  environment: InstallEnvironment;
  packageVersion: string;
  assertion?: { publicJwk: Record<string, unknown>; privateJwk: Record<string, unknown> } | null;
}

const installCommand = (pm: NodeProject["packageManager"], dependency: string): [string, string[]] => {
  if (pm === "pnpm") return ["pnpm", ["add", dependency]];
  if (pm === "yarn") return ["yarn", ["add", dependency]];
  if (pm === "bun") return ["bun", ["add", dependency]];
  return ["npm", ["install", dependency]];
};

/** The variables a deployment needs beside the ones `init` wrote, which only the person knows. */
export const DEPLOYMENT_LINES = ["JOURNEYS_TRUST_PROXY=1   # the number of proxies in front of the app (1: a load balancer or a CDN; 2: a CDN in front of a load balancer), so the client's address is read from x-forwarded-for", "JOURNEYS_ORIGIN=http://127.0.0.1:<port>   # only when the app does not answer on the port the request arrived on"];

/**
 * `journeys init --node`: the framework from package.json, the mount written
 * into the entry file (or the two lines printed), the dependency, one call to Scope for the
 * install, the salt and the variables in `.env.local`, the lines the deployment still needs.
 */
export async function initNode(options: InitNodeOptions, deps: InitDeps): Promise<InitReport> {
  const report: InitReport = { install_id: null, form: "node", hosts: [], environment: options.environment, oidc: false, files_written: [], env_written: [], env_pending: [], claim_url: null, next_step: "", warnings: [], exit_code: 0 };
  const root = options.cwd;
  const say = (line: string): void => {
    if (deps.isTTY) deps.stdout(line);
  };
  const detected = detectNode(root, options.entry);
  if (!detected.ok) {
    report.exit_code = 2;
    report.next_step = detected.reason === "no_framework" ? `run journeys init --node inside a project that depends on express, fastify or hono (${detected.detail})` : `run journeys init --node inside a Node project (${detected.detail})`;
    return report;
  }
  const project = detected.project;
  report.framework = project.framework;
  if (project.frameworks.length > 1) report.warnings.push(`the project depends on ${project.frameworks.join(" and ")}; the ${project.framework} mount was written (the others mount the same way, see the install guide)`);
  report.warnings.push(`the mount's hop reaches your app from 127.0.0.1 with the visitor's address appended to x-forwarded-for, while a request the sensor passes on arrives as before; for your own code to see the visitor's address on both, trust the loopback and your proxies' own addresses: ${project.framework === "express" ? 'app.set("trust proxy", ["loopback", "<your proxies\' addresses or subnet>"])' : project.framework === "fastify" ? 'Fastify({ trustProxy: ["127.0.0.1", "<your proxies\' addresses or subnet>"] })' : "the last x-forwarded-for entry that is neither 127.0.0.1 nor one of your proxies"}`);

  const hosts: string[] = [];
  if (options.hosts?.length) hosts.push(...options.hosts);
  else if (deps.isTTY && !options.yes) {
    const answer = (await deps.ask("Which hosts does this app serve? (comma-separated, for example app.example.com)", "")).trim();
    for (const h of answer.split(",").map((s) => s.trim()).filter(Boolean)) hosts.push(h);
  }
  if (hosts.length === 0) {
    report.exit_code = 2;
    report.next_step = "no product host is known: pass --hosts a.example.com,b.example.com";
    return report;
  }
  let docsHost = options.docsHost;
  if (docsHost === null && deps.isTTY && !options.yes) docsHost = (await deps.ask("Where are your docs? (docs.example.com, or 'same')", "same")).trim();
  if (docsHost && docsHost !== "same" && !hosts.includes(docsHost)) hosts.push(docsHost);
  report.hosts = hosts;

  // The files, before any call reaches Scope.
  const dependency = `${NODE_PACKAGE}@${options.packageVersion}`;
  const [command, args] = installCommand(project.packageManager, dependency);
  const installed = await deps.exec(command, args, { cwd: root }).catch(() => ({ code: 1, stdout: "", stderr: "" }));
  if (installed.code !== 0) report.warnings.push(`the dependency was not installed (${command} ${args.join(" ")} failed): add it by hand`);

  const lock: InitLock = readLock(root) ?? { idempotency_key: randomUUID(), created_at: deps.now().toISOString(), form: "node", install_id: null, docs_host: null, proxy_file: null, proxy_created: false, proxy_previous: null, instrumentation_created: false, instrumentation_added_export: false, dependency, mount_file: null, mount_previous: null };
  lock.docs_host = docsHost && docsHost !== "same" ? docsHost : hosts[0] ?? null;
  const manual: string[] = [];
  let mountNeedsHand = false;
  if (project.entry) {
    const previous = readFileSync(join(root, project.entry), "utf8");
    const mounted = mountSource(previous, project.framework, project.moduleStyle);
    if (!mounted.ok) {
      mountNeedsHand = true;
      manual.push(`${project.entry}: ${mounted.reason}; add these two lines by hand:`, ...mounted.manual);
    } else if (mounted.reason === "already mounted") report.warnings.push(`${project.entry} already mounts ${NODE_PACKAGE}; left as it is`);
    else {
      say(`+++ ${project.entry} (the mount added after the line that creates the app)\n${mounted.source}`);
      writeFileSync(join(root, project.entry), mounted.source);
      report.files_written.push(project.entry);
      lock.mount_file = project.entry;
      lock.mount_previous = previous;
    }
  } else {
    mountNeedsHand = true;
    manual.push("no entry file was found (package.json names no main and no start script runs a file; pass --entry <file>); add these two lines by hand:", ...manualLines(project.framework, project.moduleStyle));
  }
  mkdirSync(join(root, LOCK_DIR), { recursive: true });
  writeFileSync(join(root, LOCK_DIR, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`);

  // One call to Scope, idempotent across reruns through the lock's key.
  const apiUrl = options.apiUrl ?? deps.env.JOURNEYS_API_URL ?? DEFAULT_API_URL;
  const client = createClient({ baseUrl: apiUrl, credential: null, fetch: deps.fetch });
  const body: InstallCreateRequest = { form: "node", hosts, environment: options.environment, package: { name: NODE_PACKAGE, version: options.packageVersion, adapter: "node" } };
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
    report.manual = manual.length ? manual : undefined;
    return report;
  }
  report.install_id = created.install.install_id;
  report.claim_url = created.claim_url;
  lock.install_id = created.install.install_id;
  writeFileSync(join(root, LOCK_DIR, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`);
  if (!created.key) {
    report.exit_code = 5;
    report.next_step = "the API returned no install key for the Node form; run `journeys init --node` again or rotate the key in the console";
    report.manual = manual.length ? manual : undefined;
    return report;
  }

  const salt = base64url(deps.random(32));
  const values: Array<{ name: string; value: string }> = [{ name: "JOURNEYS_INSTALL_ID", value: created.install.install_id }, { name: "JOURNEYS_SALT", value: salt }, { name: "JOURNEYS_INSTALL_KEY", value: created.key }];
  if (apiUrl !== DEFAULT_API_URL) values.push({ name: "JOURNEYS_API_URL", value: apiUrl });
  if (options.host) values.push({ name: "JOURNEYS_HOST", value: options.host });
  if (options.assertion) values.push({ name: "JOURNEYS_ASSERTION_KEY", value: JSON.stringify({ ...options.assertion.privateJwk, kid: `${created.install.install_id}:1` }) });
  report.env_pending.push(`set on the deployment, from .env.local: ${values.map((v) => v.name).join(", ")}`, ...DEPLOYMENT_LINES);
  if (!project.envLocalIgnored) {
    report.exit_code = 6;
    report.next_step = ".env.local is not ignored by .gitignore, so the salt and the key were not written to it (a secret must never land in a tracked file): add `.env.local` to .gitignore and run `journeys init --node` again";
    report.manual = manual.length ? manual : undefined;
    return report;
  }
  upsertEnvFile(join(root, ".env.local"), Object.fromEntries(values.map((v) => [v.name, v.value])));
  report.files_written.push(".env.local");
  report.env_written.push(...values.map((v) => `${v.name} (.env.local)`));

  const entry = project.entry ?? "<entry file>";
  if (mountNeedsHand) {
    report.exit_code = 3;
    report.manual = manual;
    report.next_step = `add the two lines as printed, start the app with the variables (node --env-file=.env.local ${entry}), then run journeys doctor --url http://<host>`;
    return report;
  }
  if (manual.length) report.manual = manual;
  report.next_step = `start the app with the variables (node --env-file=.env.local ${entry}) and deploy; then run \`journeys doctor --url https://${hosts[0]}\`; open the claim URL to bind the install to your account`;
  return report;
}
