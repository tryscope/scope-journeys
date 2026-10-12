import { execFile } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import { VERSION } from "../version.js";
import { generateAssertionKeyPair } from "./assertion-key.js";
import { initCloudflare, renderCloudflareReport, uninstallCloudflare, WORKER_NAME } from "./init-cloudflare.js";
import { defaultRandom, initNext, renderInitReport, type InitDeps, type InitReport } from "./init-next.js";
import { initEnvoy, renderEnvoyReport } from "./init-envoy.js";
import { initNode } from "./init-node.js";
import { emit } from "./output.js";
import { readLock } from "./project.js";
import { uninstallEnvoy, uninstallNext, uninstallNode } from "./uninstall.js";
import type { Exec } from "./vercel.js";

/** The process's own bindings for the command; the tests inject their recorders instead. */
export function processDeps(): InitDeps {
  const exec: Exec = (command, args, options) =>
    new Promise((resolve) => {
      const child = execFile(command, args, { cwd: options.cwd, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) => {
        const code = error && typeof (error as { code?: unknown }).code === "number" ? ((error as { code: number }).code ?? 1) : error ? 1 : 0;
        resolve({ code, stdout: String(stdout), stderr: String(stderr) });
      });
      if (options.input !== undefined && child.stdin) {
        child.stdin.write(options.input);
        child.stdin.end();
      }
    });
  const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  return {
    fetch: (input, init) => fetch(input, init),
    exec,
    isTTY,
    ask: async (question, fallback) => {
      if (!isTTY) return fallback;
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      try {
        const answer = await rl.question(`${question}${fallback ? ` [${fallback}]` : ""}: `);
        return answer.trim() || fallback;
      } finally {
        rl.close();
      }
    },
    env: process.env as Record<string, string | undefined>,
    stdout: (line) => process.stdout.write(`${line}\n`),
    random: defaultRandom,
    now: () => new Date(),
  };
}

const list = (value: unknown): string[] | null => (typeof value === "string" && value.trim() ? value.split(",").map((s) => s.trim()).filter(Boolean) : null);

/** `journeys init [--cloudflare|--node] ...` (plan J2.1, J2.2, J5.1). Returns the exit code. */
export async function runInit(argv: readonly string[], deps: InitDeps = processDeps(), json = false): Promise<number> {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      cloudflare: { type: "boolean" },
      node: { type: "boolean" },
      envoy: { type: "boolean" },
      entry: { type: "string" },
      processor: { type: "string" },
      config: { type: "string" },
      "dry-run": { type: "boolean" },
      live: { type: "boolean" },
      key: { type: "boolean" },
      oidc: { type: "boolean" },
      hosts: { type: "string" },
      host: { type: "string" },
      "docs-host": { type: "string" },
      origin: { type: "string" },
      dir: { type: "string" },
      name: { type: "string" },
      yes: { type: "boolean" },
      "api-url": { type: "string" },
      environment: { type: "string" },
      json: { type: "boolean" },
    },
    strict: false,
  });
  const environment = values.environment === "preview" || values.environment === "development" ? values.environment : "production";
  const cwd = process.cwd();
  if (values.cloudflare) {
    const report = await initCloudflare({ cwd, dir: typeof values.dir === "string" ? values.dir : "journeys", name: typeof values.name === "string" ? values.name : WORKER_NAME, apiUrl: typeof values["api-url"] === "string" ? values["api-url"] : null, hosts: list(values.hosts) ?? (typeof values.host === "string" ? [values.host] : []), origin: typeof values.origin === "string" ? values.origin : null, environment, packageVersion: VERSION, yes: values.yes === true, assertion: generateAssertionKeyPair() }, deps);
    if (json) emit(report, { json: true });
    else for (const line of renderCloudflareReport(report)) deps.stdout(line);
    return report.exit_code;
  }
  if (values.envoy) {
    const report = await initEnvoy({ cwd, apiUrl: typeof values["api-url"] === "string" ? values["api-url"] : null, hosts: list(values.hosts) ?? (typeof values.host === "string" ? [values.host] : null), docsHost: typeof values["docs-host"] === "string" ? values["docs-host"] : null, processor: typeof values.processor === "string" ? values.processor : "journeys-ext-proc:9000", config: typeof values.config === "string" ? values.config : null, dryRun: values["dry-run"] === true, live: values.live === true, yes: values.yes === true, environment, packageVersion: VERSION, assertion: generateAssertionKeyPair() }, deps);
    if (json) emit(report, { json: true });
    else for (const line of renderEnvoyReport(report)) deps.stdout(line);
    return report.exit_code;
  }
  if (values.node) {
    const report = await initNode({ cwd, apiUrl: typeof values["api-url"] === "string" ? values["api-url"] : null, hosts: list(values.hosts) ?? (typeof values.host === "string" ? [values.host] : null), docsHost: typeof values["docs-host"] === "string" ? values["docs-host"] : null, host: typeof values.host === "string" ? values.host : null, entry: typeof values.entry === "string" ? values.entry : null, yes: values.yes === true, environment, packageVersion: VERSION, assertion: generateAssertionKeyPair() }, deps);
    if (json) emit(report, { json: true });
    else for (const line of renderInitReport(report)) deps.stdout(line);
    return report.exit_code;
  }
  const report: InitReport = await initNext({ cwd, apiUrl: typeof values["api-url"] === "string" ? values["api-url"] : null, key: values.key === true, oidc: values.oidc === true, hosts: list(values.hosts), docsHost: typeof values["docs-host"] === "string" ? values["docs-host"] : null, host: typeof values.host === "string" ? values.host : null, yes: values.yes === true, environment, packageVersion: VERSION, assertion: generateAssertionKeyPair() }, deps);
  if (json) emit(report, { json: true });
  else for (const line of renderInitReport(report)) deps.stdout(line);
  return report.exit_code;
}

/** `journeys uninstall [--cloudflare|--node|--envoy]`; without a flag, the lock in this directory says which form was mounted. */
export async function runUninstall(argv: readonly string[], deps: InitDeps = processDeps(), json = false): Promise<number> {
  const { values } = parseArgs({ args: [...argv], options: { cloudflare: { type: "boolean" }, node: { type: "boolean" }, envoy: { type: "boolean" }, dir: { type: "string" }, json: { type: "boolean" } }, strict: false });
  const cwd = process.cwd();
  const lockForm = values.cloudflare ? null : readLock(cwd)?.form;
  const node = values.node === true || (!values.cloudflare && !values.envoy && lockForm === "node");
  const envoy = values.envoy === true || (!values.cloudflare && !values.node && lockForm === "envoy");
  const report = values.cloudflare ? await uninstallCloudflare(cwd, typeof values.dir === "string" ? values.dir : "journeys", deps) : envoy ? await uninstallEnvoy(cwd) : node ? await uninstallNode(cwd, deps.exec) : await uninstallNext(cwd, deps.exec);
  if (json) emit(report, { json: true });
  else {
    if (report.removed.length) deps.stdout(`removed     ${report.removed.join(", ")}`);
    if (report.restored.length) deps.stdout(`restored    ${report.restored.join(", ")}`);
    for (const m of report.manual) deps.stdout(`by hand     ${m}`);
    deps.stdout(`next        ${report.next_step}`);
  }
  return report.ok ? 0 : 2;
}
