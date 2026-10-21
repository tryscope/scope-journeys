/** JSON when stdout is not a TTY or `--json` was asked, a readable table otherwise. */
export interface OutputOptions {
  json: boolean;
}

export function wantsJson(argv: readonly string[]): boolean {
  return argv.includes("--json") || !process.stdout.isTTY;
}

export function emit(value: unknown, options: OutputOptions): void {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
    return;
  }
  process.stdout.write(`${table(value)}\n`);
}

function table(value: unknown, indent = ""): string {
  if (Array.isArray(value)) return value.map((v) => `${indent}- ${table(v, `${indent}  `).trimStart()}`).join("\n");
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const width = Math.max(0, ...entries.map(([k]) => k.length));
    return entries
      .map(([k, v]) => {
        if (v && typeof v === "object") return `${indent}${k}:\n${table(v, `${indent}  `)}`;
        return `${indent}${k.padEnd(width)}  ${v === null ? "null" : String(v)}`;
      })
      .join("\n");
  }
  return `${indent}${String(value)}`;
}

export function usage(): string {
  return [
    "journeys <command> [options]",
    "",
    "  init [--key|--oidc] [--hosts a,b] [--docs-host d] [--host h] [--api-url u] [--yes]",
    "                                            mount the sensor in this Next project and print the claim URL",
    "  init --cloudflare --host a [--host b] [--origin o] [--dir journeys] [--name scope-journeys]",
    "                                            deploy the Worker under your Cloudflare account on a route per host",
    "  init --node [--entry server.mjs] [--hosts a,b] [--docs-host d] [--host h] [--api-url u] [--yes]",
    "                                            mount the sensor in this Express, Fastify or Hono app and print the claim URL",
    "  proxy --origin <url> [--listen :8080] [--trust-proxy] [--name n] [--api-url u]",
    "                                            the standalone sensor in front of an origin you do not run (needs scope-journeys-node)",
    "  init --envoy [--dry-run] [--live] [--config envoy.yaml] [--processor host:9000] [--hosts a,b] [--docs-host d] [--yes]",
    "                                            the ext_proc filter and its cluster for your Envoy (or Istio), the processor's variables, the install",
    "  uninstall [--cloudflare|--node|--envoy]   reverse every write of init; the product is as it was",
    "  rotate-assertion-key [--cloudflare]       a new signing key for the assertion, registered with Scope; the previous one verifies seven more days",
    "  rotate-salt [--cloudflare]                the next salt epoch on the install, then a new JOURNEYS_SALT in your environment; deploy right after",
    "  version                                   the package, record and policy versions",
    "  policy validate <file>                    validate a policy document and scan it for secret-shaped values",
    "  doctor [--url https://host] [--install jin_...] [--token t] [--timeout 60]",
    "                                            probe each host of the install, print the facts that arrived and the one fix for what is missing",
    "  doctor --local --policy <file> --url <base> [--path /docs/quickstart] [--raw]",
    "                                            observe one request to a local app through the core, no adapter needed",
    "",
    "  --json                                    one JSON object on stdout (the default when stdout is not a terminal)",
  ].join("\n");
}
