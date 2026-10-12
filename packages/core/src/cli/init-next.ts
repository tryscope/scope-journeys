import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { VERSION } from "../version.js";
import { ApiError, createClient, DEFAULT_API_URL, UnreachableError, type InstallCreateRequest, type InstallEnvironment } from "./client.js";
import { addInstrumentationExport, createProxySource, instrumentationSource, wrapProxySource } from "./proxy-file.js";
import { detectNext, readLock, upsertEnvFile, LOCK_DIR, LOCK_FILE, type InitLock, type NextProject } from "./project.js";
import { oidcTokenFromEnvLocal, readProjectLink, vercelAuthenticated, vercelEnvAdd, vercelEnvLines, vercelProjectFacts, type Exec } from "./vercel.js";

/** What the command needs from the world; the tests supply recorders, the bin supplies the process. */
export interface InitDeps {
  fetch: typeof fetch;
  exec: Exec;
  isTTY: boolean;
  ask: (question: string, fallback: string) => Promise<string>;
  env: Record<string, string | undefined>;
  stdout: (line: string) => void;
  random: (bytes: number) => Uint8Array;
  now: () => Date;
}

export interface InitNextOptions {
  cwd: string;
  apiUrl: string | null;
  key: boolean;
  oidc: boolean;
  hosts: string[] | null;
  docsHost: string | null;
  host: string | null;
  yes: boolean;
  environment: InstallEnvironment;
  /** The adapter version `init` installs and reports: the CLI's own. */
  packageVersion: string;
  /** J3.4: the install's ES256 key pair, generated before the call; null until the API accepts it. */
  assertion?: { publicJwk: Record<string, unknown>; privateJwk: Record<string, unknown> } | null;
}

export interface InitReport {
  install_id: string | null;
  form: "next" | "cloudflare" | "node" | "envoy";
  /** The Node form: the framework the mount was written for. */
  framework?: "express" | "fastify" | "hono";
  hosts: string[];
  environment: InstallEnvironment;
  oidc: boolean;
  files_written: string[];
  env_written: string[];
  env_pending: string[];
  claim_url: string | null;
  next_step: string;
  warnings: string[];
  manual?: string[];
  exit_code: 0 | 2 | 3 | 4 | 5 | 6;
}

export const OIDC_OFF_MESSAGE = "OIDC federation is off for this project. Turn on 'Secure backend access with OIDC federation' in Project Settings, Security, then run `vercel env pull` and `journeys init` again; or run `journeys init --key` to use an install key.";

export const base64url = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

const installCommand = (pm: NextProject["packageManager"], dependency: string): [string, string[]] => {
  if (pm === "pnpm") return ["pnpm", ["add", dependency]];
  if (pm === "yarn") return ["yarn", ["add", dependency]];
  if (pm === "bun") return ["bun", ["add", dependency]];
  return ["npm", ["install", dependency]];
};

function emptyReport(form: "next" | "cloudflare", environment: InstallEnvironment): InitReport {
  return { install_id: null, form, hosts: [], environment, oidc: false, files_written: [], env_written: [], env_pending: [], claim_url: null, next_step: "", warnings: [], exit_code: 0 };
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).host || null;
  } catch {
    return null;
  }
}

/**
 * `journeys init` in a Next project (architecture §16.2 flow A; plan J2.1): detection, the two
 * questions, the files, one call to `POST /v1/installs`, the environment, the claim URL. No call
 * reaches Scope before the proxy file is written; nothing the command can detect is asked.
 */
export async function initNext(options: InitNextOptions, deps: InitDeps): Promise<InitReport> {
  const report = emptyReport("next", options.environment);
  const root = options.cwd;
  const say = (line: string): void => {
    if (deps.isTTY) deps.stdout(line);
  };

  const detected = detectNext(root);
  if (!detected.ok) {
    report.exit_code = 2;
    report.next_step = detected.reason === "next_too_old" ? `Journeys needs Next 15 or later (${detected.detail})` : `run journeys init inside a Next project (${detected.detail})`;
    return report;
  }
  const project = detected.project;
  if (project.nextMajor === 15) report.warnings.push("Next 15: the proxy file is middleware.ts; Next 16 is the tested version");

  const link = readProjectLink(root);
  const oidcToken = oidcTokenFromEnvLocal(root);
  const vercelToken = deps.env.VERCEL_TOKEN ?? null;
  const facts = link && vercelToken ? await vercelProjectFacts(deps.fetch, vercelToken, link) : null;

  let oidc = false;
  if (options.key) oidc = false;
  else if (oidcToken && facts?.oidcEnabled !== false) oidc = true;
  else if (options.oidc) {
    report.exit_code = 4;
    report.next_step = facts?.oidcEnabled === false ? OIDC_OFF_MESSAGE : "the OIDC form needs VERCEL_OIDC_TOKEN in .env.local: link the project, turn on OIDC federation, run `vercel env pull`, then `journeys init --oidc` again";
    return report;
  } else if (facts?.oidcEnabled === false) report.warnings.push(OIDC_OFF_MESSAGE);
  else if (link && !vercelToken) report.warnings.push("VERCEL_TOKEN is not set, so the project's OIDC setting could not be read: continuing with an install key (run `vercel env pull` and `journeys init --oidc` to use OIDC)");
  report.oidc = oidc;

  const hosts: string[] = [];
  if (options.hosts?.length) hosts.push(...options.hosts);
  else if (facts?.domains.length) hosts.push(...facts.domains);
  else {
    const fromEnv = hostOf(deps.env.NEXT_PUBLIC_SITE_URL);
    if (fromEnv) hosts.push(fromEnv);
    else if (deps.isTTY && !options.yes) {
      const answer = (await deps.ask("Which hosts does this project serve? (comma-separated, for example app.example.com)", "")).trim();
      for (const h of answer.split(",").map((s) => s.trim()).filter(Boolean)) hosts.push(h);
    }
  }
  if (hosts.length === 0) {
    report.exit_code = 2;
    report.next_step = "no product host is known: pass --hosts a.example.com,b.example.com (or link the project so its domains are read)";
    return report;
  }
  let docsHost = options.docsHost;
  if (docsHost === null && deps.isTTY && !options.yes) docsHost = (await deps.ask("Where are your docs? (docs.example.com, or 'same')", "same")).trim();
  if (docsHost && docsHost !== "same" && !hosts.includes(docsHost)) hosts.push(docsHost);
  report.hosts = hosts;

  // The files, before any call reaches Scope.
  const dependency = `scope-journeys-next@${options.packageVersion}`;
  const [command, args] = installCommand(project.packageManager, dependency);
  const installed = await deps.exec(command, args, { cwd: root }).catch(() => ({ code: 1, stdout: "", stderr: "" }));
  if (installed.code !== 0) report.warnings.push(`the dependency was not installed (${command} ${args.join(" ")} failed): add it by hand`);

  const lock: InitLock = readLock(root) ?? { idempotency_key: randomUUID(), created_at: deps.now().toISOString(), form: "next", install_id: null, docs_host: null, proxy_file: project.proxyFile, proxy_created: false, proxy_previous: null, instrumentation_created: false, instrumentation_added_export: false, dependency };
  lock.docs_host = docsHost && docsHost !== "same" ? docsHost : hosts[0] ?? null;
  const manual: string[] = [];
  let proxyNeedsHand = false;
  const proxyPath = join(root, project.proxyFile);
  if (!project.proxyExists) {
    const source = createProxySource();
    say(`+++ ${project.proxyFile}\n${source}`);
    writeFileSync(proxyPath, source);
    report.files_written.push(project.proxyFile);
    lock.proxy_created = true;
  } else {
    const wrapped = wrapProxySource(readFileSync(proxyPath, "utf8"));
    if (wrapped.ok) {
      if (wrapped.reason === "already wrapped") report.warnings.push(`${project.proxyFile} already calls withJourneys; left as it is`);
      else {
        say(`+++ ${project.proxyFile} (wrapped; your default export now runs as next)\n${wrapped.source}`);
        writeFileSync(proxyPath, wrapped.source);
        report.files_written.push(project.proxyFile);
        lock.proxy_previous = wrapped.previous;
      }
    } else {
      proxyNeedsHand = true;
      manual.push(`${project.proxyFile}: ${wrapped.reason}; add these two lines by hand:`, ...wrapped.manual);
    }
  }
  const instrumentationPath = join(root, project.instrumentationFile);
  if (!project.instrumentationExists) {
    writeFileSync(instrumentationPath, instrumentationSource());
    report.files_written.push(project.instrumentationFile);
    lock.instrumentation_created = true;
  } else {
    const added = addInstrumentationExport(readFileSync(instrumentationPath, "utf8"));
    if (added.added) {
      writeFileSync(instrumentationPath, added.source);
      report.files_written.push(project.instrumentationFile);
      lock.instrumentation_added_export = true;
    } else if (added.manual) manual.push(added.manual);
  }
  mkdirSync(join(root, LOCK_DIR), { recursive: true });
  writeFileSync(join(root, LOCK_DIR, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`);

  // One call to Scope, idempotent across reruns through the lock's key.
  const apiUrl = options.apiUrl ?? deps.env.JOURNEYS_API_URL ?? DEFAULT_API_URL;
  const client = createClient({ baseUrl: apiUrl, credential: null, fetch: deps.fetch });
  const body: InstallCreateRequest = { form: "next", hosts, environment: options.environment, package: { name: "scope-journeys-next", version: options.packageVersion, adapter: "next" } };
  if (oidc && oidcToken) body.oidc_token = oidcToken.token;
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

  // The environment: the id, the salt, the key (key form), the api url when not the default, the host when asked.
  const salt = base64url(deps.random(32));
  const values: Array<{ name: string; value: string; sensitive: boolean }> = [{ name: "JOURNEYS_INSTALL_ID", value: created.install.install_id, sensitive: false }, { name: "JOURNEYS_SALT", value: salt, sensitive: true }];
  if (!oidc && created.key) values.push({ name: "JOURNEYS_INSTALL_KEY", value: created.key, sensitive: true });
  if (!oidc && !created.key) report.warnings.push("the API returned no install key for the key form; run `journeys init` again or rotate the key in the console");
  if (apiUrl !== DEFAULT_API_URL) values.push({ name: "JOURNEYS_API_URL", value: apiUrl, sensitive: false });
  if (options.host) values.push({ name: "JOURNEYS_HOST", value: options.host, sensitive: false });
  if (options.assertion) values.push({ name: "JOURNEYS_ASSERTION_KEY", value: JSON.stringify({ ...options.assertion.privateJwk, kid: `${created.install.install_id}:1` }), sensitive: true });

  const canWriteVercel = link !== null && (await vercelAuthenticated(deps.exec, root));
  if (canWriteVercel) {
    for (const v of values) {
      if (await vercelEnvAdd(deps.exec, root, v.name, v.value, v.sensitive)) report.env_written.push(`${v.name} (vercel: production, preview, development)`);
      else report.env_pending.push(...vercelEnvLines([{ name: v.name, sensitive: v.sensitive }]));
    }
  } else report.env_pending.push(...vercelEnvLines(values.map((v) => ({ name: v.name, sensitive: v.sensitive }))));

  if (!project.envLocalIgnored) {
    report.exit_code = 6;
    report.next_step = ".env.local is not ignored by .gitignore, so the salt and the key were not written to it (a secret must never land in a tracked file): add `.env.local` to .gitignore and run `journeys init` again";
    report.manual = manual.length ? manual : undefined;
    return report;
  }
  upsertEnvFile(join(root, ".env.local"), Object.fromEntries(values.map((v) => [v.name, v.value])));
  report.files_written.push(".env.local");
  report.env_written.push(...values.map((v) => `${v.name} (.env.local)`));

  if (proxyNeedsHand) {
    report.exit_code = 3;
    report.manual = manual;
    report.next_step = `edit ${project.proxyFile} as printed, then deploy a preview and run journeys doctor --url <preview url>`;
    return report;
  }
  if (manual.length) report.manual = manual;
  report.next_step = "deploy a preview, then run `journeys doctor --url <preview url>`; open the claim URL to bind the install to your account";
  return report;
}

/** The lines a person reads on a terminal; the JSON form is the report itself. */
export function renderInitReport(report: InitReport): string[] {
  const lines: string[] = [];
  if (report.install_id) lines.push(`install     ${report.install_id}`);
  lines.push(`form        ${report.form}${report.framework ? ` (${report.framework})` : ""}${report.oidc ? " (OIDC: no key in your environment)" : ""}`);
  if (report.hosts.length) lines.push(`hosts       ${report.hosts.join(", ")}`);
  if (report.files_written.length) lines.push(`files       ${report.files_written.join(", ")}`);
  if (report.env_written.length) lines.push(`env         ${report.env_written.join("; ")}`);
  if (report.env_pending.length) lines.push("pending     run these with the values from .env.local:", ...report.env_pending.map((l) => `              ${l}`));
  if (report.claim_url) lines.push(`claim       ${report.claim_url}`);
  for (const w of report.warnings) lines.push(`warning     ${w}`);
  for (const m of report.manual ?? []) lines.push(`by hand     ${m}`);
  lines.push(`next        ${report.next_step}`);
  return lines;
}

export const saltOf = (random: InitDeps["random"]): string => base64url(random(32));
export const defaultRandom = (bytes: number): Uint8Array => new Uint8Array(randomBytes(bytes));
export const envLocalExists = (root: string): boolean => existsSync(join(root, ".env.local"));
