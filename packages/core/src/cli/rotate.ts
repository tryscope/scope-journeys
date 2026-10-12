import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { assertionKeyVersion, assertionKid, generateAssertionKeyPair } from "./assertion-key.js";
import { ApiError, createClient, UnreachableError } from "./client.js";
import { apiUrlFrom, credentialFrom, installIdFrom } from "./doctor.js";
import { processDeps } from "./init.js";
import type { InitDeps } from "./init-next.js";
import { emit } from "./output.js";
import { readEnvFile, readLock, upsertEnvFile } from "./project.js";
import { readProjectLink, vercelAuthenticated, vercelEnvAdd, vercelEnvLines } from "./vercel.js";
import { wranglerSecretPut } from "./wrangler.js";

export interface RotateOptions {
  cwd: string;
  cloudflare: boolean;
  dir: string;
  install: string | null;
  token: string | null;
  apiUrl: string | null;
}

export interface RotateReport {
  install_id: string | null;
  form: "next" | "cloudflare" | "node";
  kid: string | null;
  previous_kid: string | null;
  env_written: string[];
  env_pending: string[];
  overlap_until: string | null;
  exit_code: 0 | 5;
  next_step: string;
}

const OVERLAP_DAYS = 7;

/**
 * `journeys rotate-assertion-key` (plan J3.4 step 6): a new ES256 pair, its public half registered
 * through `POST /v1/installs/{id}` (Scope keeps the previous one seven days), its private half
 * written where `init` wrote the first one, the overlap deadline printed. Every six weeks.
 */
export async function rotateAssertionKey(options: RotateOptions, deps: Pick<InitDeps, "fetch" | "exec" | "env" | "now">): Promise<RotateReport> {
  const form: RotateReport["form"] = options.cloudflare ? "cloudflare" : readLock(options.cwd)?.form === "node" ? "node" : "next";
  const failed = (next_step: string, partial: Partial<RotateReport> = {}): RotateReport => ({ install_id: null, form, kid: null, previous_kid: null, env_written: [], env_pending: [], overlap_until: null, exit_code: 5, next_step, ...partial });
  const installId = installIdFrom(options, deps);
  if (!installId) return failed("no install id: pass --install jin_..., or run this where journeys init wrote .env.local or journeys/wrangler.toml");
  const envPath = form === "cloudflare" ? join(options.cwd, options.dir, ".env.secrets") : join(options.cwd, ".env.local");
  const current = readEnvFile(envPath).JOURNEYS_ASSERTION_KEY ?? deps.env.JOURNEYS_ASSERTION_KEY;
  const previousVersion = assertionKeyVersion(current);
  const kid = assertionKid(installId, previousVersion + 1);
  const previousKid = previousVersion ? assertionKid(installId, previousVersion) : null;
  const pair = generateAssertionKeyPair();
  const client = createClient({ baseUrl: apiUrlFrom(options, deps), credential: credentialFrom(options, deps), fetch: deps.fetch });
  try {
    await client.updateInstall(installId, { assertion_jwk: { ...pair.publicJwk, kid } }, randomUUID());
  } catch (error) {
    const why = error instanceof ApiError ? `${error.status} ${error.code}` : error instanceof UnreachableError ? error.message : String(error);
    return failed(`Scope did not register the new key (${why}); nothing was written. Check the credential (the install key in ${form === "cloudflare" ? `${options.dir}/.env.secrets` : ".env.local"} or --token) and JOURNEYS_API_URL`, { install_id: installId, previous_kid: previousKid });
  }
  const value = JSON.stringify({ ...pair.privateJwk, kid });
  const report: RotateReport = { install_id: installId, form, kid, previous_kid: previousKid, env_written: [], env_pending: [], overlap_until: new Date(deps.now().getTime() + OVERLAP_DAYS * 86_400_000).toISOString(), exit_code: 0, next_step: "" };
  if (form === "cloudflare") {
    const dir = join(options.cwd, options.dir);
    if (existsSync(dir)) {
      upsertEnvFile(envPath, { JOURNEYS_ASSERTION_KEY: value });
      report.env_written.push(`JOURNEYS_ASSERTION_KEY (${options.dir}/.env.secrets)`);
    }
    if (await wranglerSecretPut(deps.exec, dir, "JOURNEYS_ASSERTION_KEY", value)) report.env_written.push("JOURNEYS_ASSERTION_KEY (wrangler secret)");
    else report.env_pending.push(`cd ${options.dir} && npx wrangler@4 secret put JOURNEYS_ASSERTION_KEY   # (from .env.secrets)`);
    report.next_step = `redeploy the Worker (cd ${options.dir} && npx wrangler@4 deploy): the new key signs from then on; the previous key verifies until ${report.overlap_until}`;
    return report;
  }
  if (existsSync(envPath)) {
    upsertEnvFile(envPath, { JOURNEYS_ASSERTION_KEY: value });
    report.env_written.push("JOURNEYS_ASSERTION_KEY (.env.local)");
  }
  if (readProjectLink(options.cwd) && (await vercelAuthenticated(deps.exec, options.cwd))) {
    if (await vercelEnvAdd(deps.exec, options.cwd, "JOURNEYS_ASSERTION_KEY", value, true)) report.env_written.push("JOURNEYS_ASSERTION_KEY (vercel: production, preview, development)");
    else report.env_pending.push(...vercelEnvLines([{ name: "JOURNEYS_ASSERTION_KEY", sensitive: true }]));
  } else report.env_pending.push(...vercelEnvLines([{ name: "JOURNEYS_ASSERTION_KEY", sensitive: true }]));
  if (!report.env_written.length && !report.env_pending.length) report.env_pending.push(vercelEnvLines([{ name: "JOURNEYS_ASSERTION_KEY", sensitive: true }])[0] ?? "");
  report.next_step = `redeploy (preview, then production): the new key signs from the next deploy; the previous key verifies until ${report.overlap_until}`;
  return report;
}

export function renderRotateReport(report: RotateReport): string[] {
  const lines: string[] = [];
  if (report.install_id) lines.push(`install     ${report.install_id}`);
  lines.push(`form        ${report.form}`);
  if (report.kid) lines.push(`kid         ${report.kid}${report.previous_kid ? ` (replaces ${report.previous_kid})` : ""}`);
  if (report.env_written.length) lines.push(`env         ${report.env_written.join("; ")}`);
  if (report.env_pending.length) lines.push("pending     run these with the value from the env file:", ...report.env_pending.map((l) => `              ${l}`));
  if (report.overlap_until) lines.push(`overlap     the previous key verifies until ${report.overlap_until}`);
  lines.push(`next        ${report.next_step}`);
  return lines;
}

/** `journeys rotate-assertion-key [--cloudflare] [--dir journeys] [--install jin_...] [--token t] [--api-url u]`. Returns the exit code. */
export async function runRotate(argv: readonly string[], deps: InitDeps = processDeps(), json = false): Promise<number> {
  const { values } = parseArgs({ args: [...argv], options: { cloudflare: { type: "boolean" }, dir: { type: "string" }, install: { type: "string" }, token: { type: "string" }, "api-url": { type: "string" }, json: { type: "boolean" } }, strict: false });
  const report = await rotateAssertionKey({ cwd: process.cwd(), cloudflare: values.cloudflare === true, dir: typeof values.dir === "string" ? values.dir : "journeys", install: typeof values.install === "string" ? values.install : null, token: typeof values.token === "string" ? values.token : null, apiUrl: typeof values["api-url"] === "string" ? values["api-url"] : null }, deps);
  if (json) emit(report, { json: true });
  else for (const line of renderRotateReport(report)) deps.stdout(line);
  return report.exit_code;
}
