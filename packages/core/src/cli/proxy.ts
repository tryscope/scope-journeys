import { join } from "node:path";
import { parseArgs } from "node:util";

import { originUrl, trustedProxies } from "../gateway.js";
import { emit } from "./output.js";
import { readEnvFile } from "./project.js";

/** Resolved at run time, never a dependency of the core: the Node adapter is installed beside the CLI by the customer who runs the proxy. */
const NODE_ADAPTER = "scope-journeys-node";

interface NodeAdapter {
  serveProxy(options: { origin: string; listen: string; trustProxy?: number; name?: string; apiUrl?: string; env: Record<string, string | undefined>; signals: boolean }): Promise<{ url: string; closed: Promise<void> }>;
}

const isModuleNotFound = (error: unknown): boolean => error instanceof Error && ((error as { code?: unknown }).code === "ERR_MODULE_NOT_FOUND" || /Cannot find (?:module|package)/.test(error.message));

/**
 * `journeys proxy --origin <url> --listen :8080 [--trust-proxy]`: the standalone
 * sensor for the customer who fronts an origin they do not run. Plain HTTP; TLS is the load
 * balancer's job. The install's variables come from the process environment and `.env.local` in
 * the working directory, as `init --node` wrote them. Runs until SIGTERM, which drains.
 */
export async function runProxy(argv: readonly string[], json = false): Promise<number> {
  const { values } = parseArgs({ args: [...argv], options: { origin: { type: "string" }, listen: { type: "string" }, "trust-proxy": { type: "boolean" }, name: { type: "string" }, "api-url": { type: "string" }, json: { type: "boolean" } }, strict: false });
  const env: Record<string, string | undefined> = { ...readEnvFile(join(process.cwd(), ".env.local")), ...process.env };
  const origin = typeof values.origin === "string" ? values.origin : env.JOURNEYS_ORIGIN;
  if (!origin || !originUrl(origin)) {
    process.stderr.write("journeys proxy --origin https://origin.example [--listen :8080] [--trust-proxy]\n");
    return 2;
  }
  let adapter: NodeAdapter;
  try {
    adapter = (await import(NODE_ADAPTER)) as NodeAdapter;
  } catch (error) {
    if (!isModuleNotFound(error)) throw error;
    process.stderr.write(`journeys proxy needs ${NODE_ADAPTER} beside the CLI: npm install ${NODE_ADAPTER}\n`);
    return 2;
  }
  // --trust-proxy is one proxy while JOURNEYS_TRUST_PROXY is unset; a value set there is the adapter's to read, and to warn about when it is not a count.
  const trustProxy = values["trust-proxy"] === true && !env.JOURNEYS_TRUST_PROXY ? 1 : undefined;
  const proxies = trustProxy ?? trustedProxies(env.JOURNEYS_TRUST_PROXY);
  const running = await adapter.serveProxy({ origin, listen: typeof values.listen === "string" ? values.listen : (env.JOURNEYS_LISTEN ?? ":8080"), trustProxy, name: typeof values.name === "string" ? values.name : undefined, apiUrl: typeof values["api-url"] === "string" ? values["api-url"] : undefined, env, signals: true });
  const report = { listening: running.url, origin, install: env.JOURNEYS_INSTALL_ID ?? null, trust_proxy: proxies, salt: Boolean(env.JOURNEYS_SALT) };
  if (json) emit(report, { json: true });
  else process.stdout.write(`journeys proxy: listening on ${running.url}, forwarding to ${origin}${report.install ? ` as ${report.install}` : " with no install (forward-only default; run journeys init --node)"}${proxies === null ? "" : `, trusting ${proxies} ${proxies === 1 ? "proxy" : "proxies"} in x-forwarded-for`}\n`);
  await running.closed;
  return 0;
}
