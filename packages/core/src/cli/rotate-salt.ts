import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { ApiError, createClient, UnreachableError } from "./client.js";
import { apiUrlFrom, credentialFrom, installIdFrom } from "./doctor.js";
import { processDeps } from "./init.js";
import { saltOf, type InitDeps } from "./init-next.js";
import { emit } from "./output.js";
import { readLock, upsertEnvFile } from "./project.js";
import { readProjectLink, vercelAuthenticated, vercelEnvAdd, vercelEnvLines } from "./vercel.js";
import { wranglerSecretPut } from "./wrangler.js";

export interface RotateSaltOptions {
  cwd: string;
  cloudflare: boolean;
  dir: string;
  install: string | null;
  token: string | null;
  apiUrl: string | null;
}

export interface RotateSaltReport {
  install_id: string | null;
  form: "next" | "cloudflare" | "node";
  salt_epoch: number | null;
  previous_epoch: number | null;
  bumped_at: string | null;
  env_written: string[];
  env_pending: string[];
  exit_code: 0 | 1 | 5;
  next_step: string;
}

/**
 * `journeys rotate-salt` (plan J3.9): the salt is the customer's secret and never reaches Scope,
 * so a rotation is two things that must agree, done in the order that keeps the window small and
 * disclosed: the epoch bumped on the install first (every sensor stamps it within the policy
 * cache's minute), then a new salt generated here and written where `init` wrote the first, then
 * the deploy instruction. Records between the bump and the deploy carry the new epoch with the
 * old salt and join nothing after the deploy; the console says so for 30 days.
 */
export async function rotateSalt(options: RotateSaltOptions, deps: Pick<InitDeps, "fetch" | "exec" | "env" | "now" | "random">): Promise<RotateSaltReport> {
  const form: RotateSaltReport["form"] = options.cloudflare ? "cloudflare" : readLock(options.cwd)?.form === "node" ? "node" : "next";
  const failed = (exit_code: 1 | 5, next_step: string, partial: Partial<RotateSaltReport> = {}): RotateSaltReport => ({ install_id: null, form, salt_epoch: null, previous_epoch: null, bumped_at: null, env_written: [], env_pending: [], exit_code, next_step, ...partial });
  const installId = installIdFrom(options, deps);
  if (!installId) return failed(5, "no install id: pass --install jin_..., or run this where journeys init wrote .env.local or journeys/wrangler.toml");
  const client = createClient({ baseUrl: apiUrlFrom(options, deps), credential: credentialFrom(options, deps), fetch: deps.fetch });
  const why = (error: unknown): string => (error instanceof ApiError ? `${error.status} ${error.code}` : error instanceof UnreachableError ? error.message : String(error));
  let current: number;
  try {
    const install = await client.getInstall(installId);
    if (install.state === "unclaimed" || install.state === "revoked") return failed(1, `the install is ${install.state}: ${install.state === "unclaimed" ? "claim it first (the claim URL init printed), then rotate" : "a revoked install cannot rotate; create a new install with journeys init"}`, { install_id: installId, previous_epoch: install.salt_epoch });
    current = install.salt_epoch;
  } catch (error) {
    return failed(5, `the install could not be read (${why(error)}): check the credential (the install key in ${form === "cloudflare" ? `${options.dir}/.env.secrets` : ".env.local"} or --token) and JOURNEYS_API_URL`, { install_id: installId });
  }
  const next = current + 1;
  try {
    await client.updateInstall(installId, { salt_epoch: next }, randomUUID());
  } catch (error) {
    return failed(5, `Scope did not advance the epoch (${why(error)}); the salt was not changed`, { install_id: installId, previous_epoch: current });
  }
  const bumpedAt = deps.now().toISOString();
  const salt = saltOf(deps.random);
  const report: RotateSaltReport = { install_id: installId, form, salt_epoch: next, previous_epoch: current, bumped_at: bumpedAt, env_written: [], env_pending: [], exit_code: 0, next_step: "" };
  const window = `records between ${bumpedAt} and your deploy carry epoch ${next} with the old salt and join nothing after the deploy`;
  if (form === "cloudflare") {
    const dir = join(options.cwd, options.dir);
    if (existsSync(dir)) {
      upsertEnvFile(join(dir, ".env.secrets"), { JOURNEYS_SALT: salt });
      report.env_written.push(`JOURNEYS_SALT (${options.dir}/.env.secrets)`);
    }
    if (await wranglerSecretPut(deps.exec, dir, "JOURNEYS_SALT", salt)) report.env_written.push("JOURNEYS_SALT (wrangler secret)");
    else report.env_pending.push(`cd ${options.dir} && npx wrangler@4 secret put JOURNEYS_SALT   # (from .env.secrets)`);
    report.next_step = `deploy now (cd ${options.dir} && npx wrangler@4 deploy); ${window}`;
    return report;
  }
  const envPath = join(options.cwd, ".env.local");
  if (existsSync(envPath)) {
    upsertEnvFile(envPath, { JOURNEYS_SALT: salt });
    report.env_written.push("JOURNEYS_SALT (.env.local)");
  }
  if (readProjectLink(options.cwd) && (await vercelAuthenticated(deps.exec, options.cwd))) {
    if (await vercelEnvAdd(deps.exec, options.cwd, "JOURNEYS_SALT", salt, true)) report.env_written.push("JOURNEYS_SALT (vercel: production, preview, development)");
    else report.env_pending.push(...vercelEnvLines([{ name: "JOURNEYS_SALT", sensitive: true }]));
  } else report.env_pending.push(...vercelEnvLines([{ name: "JOURNEYS_SALT", sensitive: true }]));
  report.next_step = `deploy now (production, then preview); ${window}`;
  return report;
}

export function renderRotateSaltReport(report: RotateSaltReport): string[] {
  const lines: string[] = [];
  if (report.install_id) lines.push(`install     ${report.install_id}`);
  lines.push(`form        ${report.form}`);
  if (report.salt_epoch !== null) lines.push(`epoch       ${report.salt_epoch} (was ${report.previous_epoch ?? "?"}), bumped at ${report.bumped_at ?? "?"}`);
  if (report.env_written.length) lines.push(`env         ${report.env_written.join("; ")}`);
  if (report.env_pending.length) lines.push("pending     run these with the value from the env file:", ...report.env_pending.map((l) => `              ${l}`));
  lines.push(`next        ${report.next_step}`);
  return lines;
}

/** `journeys rotate-salt [--cloudflare] [--dir journeys] [--install jin_...] [--token t] [--api-url u]`. Returns the exit code. */
export async function runRotateSalt(argv: readonly string[], deps: InitDeps = processDeps(), json = false): Promise<number> {
  const { values } = parseArgs({ args: [...argv], options: { cloudflare: { type: "boolean" }, dir: { type: "string" }, install: { type: "string" }, token: { type: "string" }, "api-url": { type: "string" }, json: { type: "boolean" } }, strict: false });
  const report = await rotateSalt({ cwd: process.cwd(), cloudflare: values.cloudflare === true, dir: typeof values.dir === "string" ? values.dir : "journeys", install: typeof values.install === "string" ? values.install : null, token: typeof values.token === "string" ? values.token : null, apiUrl: typeof values["api-url"] === "string" ? values["api-url"] : null }, deps);
  if (json) emit(report, { json: true });
  else for (const line of renderRotateSaltReport(report)) deps.stdout(line);
  return report.exit_code;
}
