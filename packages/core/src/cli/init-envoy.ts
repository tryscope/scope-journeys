import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ApiError, createClient, DEFAULT_API_URL, UnreachableError, type InstallCreateRequest, type InstallEnvironment } from "./client.js";
import { base64url, type InitDeps, type InitReport } from "./init-next.js";
import { envLocalIgnored, readLock, upsertEnvFile, LOCK_DIR, LOCK_FILE, type InitLock } from "./project.js";

export const ENVOY_PACKAGE = "scope-journeys-envoy";
export const EXT_PROC_CLUSTER = "journeys_ext_proc";
export const EXT_PROC_FILTER = "envoy.filters.http.ext_proc";

export interface FragmentOptions {
  /** The processor's address as Envoy reaches it (`journeys-ext-proc:9000` beside Envoy; `host.docker.internal:9000` from a container to the host). */
  processor: { host: string; port: number };
  /** Envoy sends the messages and does not wait for answers: the request path pays nothing and the processor only records. Right while every rule is dry run; off once a rule is live. */
  observability: boolean;
}

const indentBlock = (text: string, indent: string): string => text.split("\n").map((line) => (line ? `${indent}${line}` : line)).join("\n");

/**
 * The filter the customer adds to the HTTP connection manager's `http_filters`, before the router
 * (plan J5.2 step 5): the processor's cluster, headers both ways, no bodies until the processor
 * asks per route (`allow_mode_override`), fail open (architecture §7.9), 2 seconds per message. In
 * observability mode the body modes are the only ones Envoy will use, so the request bodies the
 * record needs arrive streamed and the processor buffers them itself.
 */
export function filterYaml(options: FragmentOptions): string {
  const lines = [
    `- name: ${EXT_PROC_FILTER}`,
    "  typed_config:",
    '    "@type": type.googleapis.com/envoy.extensions.filters.http.ext_proc.v3.ExternalProcessor',
    "    grpc_service:",
    `      envoy_grpc: { cluster_name: ${EXT_PROC_CLUSTER} }`,
    "      timeout: 2s",
    "    processing_mode:",
    "      request_header_mode: SEND",
    "      response_header_mode: SEND",
    `      request_body_mode: ${options.observability ? "STREAMED" : "NONE"}`,
    `      response_body_mode: ${options.observability ? "STREAMED" : "NONE"}`,
    "      request_trailer_mode: SKIP",
    "      response_trailer_mode: SKIP",
    "    failure_mode_allow: true",
    "    message_timeout: 2s",
    `    allow_mode_override: ${options.observability ? "false" : "true"}`,
  ];
  if (options.observability) lines.push("    observability_mode: true");
  return lines.join("\n");
}

/** The cluster the filter names: the processor over HTTP/2 (gRPC), one endpoint, IPv4 preferred (Envoy's default prefers IPv6, which a host alias such as host.docker.internal does not answer on). */
export function clusterYaml(options: FragmentOptions): string {
  return [
    `- name: ${EXT_PROC_CLUSTER}`,
    "  type: STRICT_DNS",
    "  dns_lookup_family: V4_PREFERRED",
    "  lb_policy: ROUND_ROBIN",
    "  typed_extension_protocol_options:",
    "    envoy.extensions.upstreams.http.v3.HttpProtocolOptions:",
    '      "@type": type.googleapis.com/envoy.extensions.upstreams.http.v3.HttpProtocolOptions',
    "      explicit_http_config: { http2_protocol_options: {} }",
    "  load_assignment:",
    `    cluster_name: ${EXT_PROC_CLUSTER}`,
    "    endpoints:",
    "      - lb_endpoints:",
    `          - endpoint: { address: { socket_address: { address: ${options.processor.host}, port_value: ${options.processor.port} } } }`,
  ].join("\n");
}

/** The Istio twin: an EnvoyFilter on the ingress gateway inserting the same filter before the router, and the same cluster. */
export function istioYaml(options: FragmentOptions): string {
  const filter = indentBlock(filterYaml(options).replace(/^- name: /, "name: ").replace(/\n  /g, "\n"), "          ");
  const cluster = indentBlock(clusterYaml(options).replace(/^- name: /, "name: ").replace(/\n  /g, "\n"), "          ");
  return [
    "apiVersion: networking.istio.io/v1alpha3",
    "kind: EnvoyFilter",
    "metadata:",
    "  name: journeys-ext-proc",
    "  namespace: istio-system",
    "spec:",
    "  workloadSelector:",
    "    labels:",
    "      istio: ingressgateway",
    "  configPatches:",
    "    - applyTo: HTTP_FILTER",
    "      match:",
    "        context: GATEWAY",
    "        listener:",
    "          filterChain:",
    "            filter:",
    "              name: envoy.filters.network.http_connection_manager",
    "              subFilter:",
    "                name: envoy.filters.http.router",
    "      patch:",
    "        operation: INSERT_BEFORE",
    "        value:",
    filter,
    "    - applyTo: CLUSTER",
    "      match:",
    "        context: GATEWAY",
    "      patch:",
    "        operation: ADD",
    "        value:",
    cluster,
    "",
  ].join("\n");
}

export interface Applied {
  ok: boolean;
  source: string;
  reason: string | null;
}

/**
 * The fragment applied to an `envoy.yaml`: the filter inserted before the router filter at the
 * router's indentation, the cluster appended to `clusters:` at the clusters' indentation. The
 * shapes this understands are the ones a static configuration has; anything else is refused and
 * the fragment printed for the person to merge by hand.
 */
export function applyToEnvoyYaml(source: string, options: FragmentOptions): Applied {
  if (source.includes(EXT_PROC_FILTER)) return { ok: true, source, reason: "already applied" };
  const lines = source.split("\n");
  const routerAt = lines.findIndex((line) => /^\s*-\s+name:\s+envoy\.filters\.http\.router\s*$/.test(line));
  if (routerAt < 0) return { ok: false, source, reason: "no `- name: envoy.filters.http.router` entry under http_filters" };
  const routerIndent = /^(\s*)-/.exec(lines[routerAt] ?? "")?.[1] ?? "";
  const clustersAt = lines.findIndex((line) => /^\s*clusters:\s*$/.test(line));
  if (clustersAt < 0) return { ok: false, source, reason: "no `clusters:` list" };
  const firstCluster = lines.slice(clustersAt + 1).find((line) => /^\s*-\s+name:/.test(line));
  const clusterIndent = firstCluster ? (/^(\s*)-/.exec(firstCluster)?.[1] ?? "") : `${/^(\s*)/.exec(lines[clustersAt] ?? "")?.[1] ?? ""}  `;
  const clustersIndent = /^(\s*)/.exec(lines[clustersAt] ?? "")?.[1] ?? "";
  // The clusters list ends at the next line indented no deeper than `clusters:` itself (or the end of the file).
  let clustersEnd = lines.length;
  for (let i = clustersAt + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "") continue;
    const indent = /^(\s*)/.exec(line)?.[1] ?? "";
    if (indent.length <= clustersIndent.length) {
      clustersEnd = i;
      break;
    }
  }
  const filter = indentBlock(filterYaml(options), routerIndent).split("\n");
  const cluster = indentBlock(clusterYaml(options), clusterIndent).split("\n");
  const out = [...lines];
  // The later edit first, so the earlier index stays valid.
  let end = clustersEnd;
  while (end > clustersAt + 1 && (out[end - 1] ?? "").trim() === "") end -= 1;
  out.splice(end, 0, ...cluster);
  out.splice(routerAt, 0, ...filter);
  return { ok: true, source: out.join("\n"), reason: null };
}

export interface InitEnvoyOptions {
  cwd: string;
  apiUrl: string | null;
  hosts: string[] | null;
  docsHost: string | null;
  /** The processor's address as Envoy reaches it. */
  processor: string;
  /** The envoy.yaml to apply the fragment to, or null to write the fragment beside the lock only. */
  config: string | null;
  /** Print the fragment (and the applied configuration) and write nothing; no call reaches Scope. */
  dryRun: boolean;
  /** The live form of the filter (`observability_mode` off, bodies on request, mode override allowed): what the Rules page prints once the first rule is live. Observability mode otherwise, the state every install starts in. */
  live: boolean;
  yes: boolean;
  environment: InstallEnvironment;
  packageVersion: string;
  assertion?: { publicJwk: Record<string, unknown>; privateJwk: Record<string, unknown> } | null;
}

export interface EnvoyReport extends InitReport {
  processor: string;
  observability: boolean;
  /** The applied configuration or the fragment, on a dry run (so the output is the thing to review). */
  fragment?: string;
}

const parseProcessor = (value: string): { host: string; port: number } | null => {
  const m = /^(?:\[([^\]]+)\]|([^:\s]+)):(\d+)$/.exec(value.trim());
  if (!m) return null;
  const port = Number(m[3]);
  return Number.isInteger(port) && port > 0 && port < 65536 ? { host: m[1] ?? m[2] ?? "", port } : null;
};

/**
 * `journeys init --envoy` (plan J5.2 steps 4 and 5): the install, the processor's variables in
 * `.env.local`, the filter and the cluster written for the customer's `envoy.yaml` (applied to it
 * with `--config`) and the Istio twin. Every rule is dry run at install, so the filter starts in
 * observability mode; the Rules page prints the one change when the first rule goes live.
 */
export async function initEnvoy(options: InitEnvoyOptions, deps: InitDeps): Promise<EnvoyReport> {
  const report: EnvoyReport = { install_id: null, form: "envoy", hosts: [], environment: options.environment, oidc: false, files_written: [], env_written: [], env_pending: [], claim_url: null, next_step: "", warnings: [], exit_code: 0, processor: options.processor, observability: !options.live };
  const processor = parseProcessor(options.processor);
  if (!processor) {
    report.exit_code = 2;
    report.next_step = `--processor ${options.processor} is not host:port (the address Envoy reaches the processor at, for example journeys-ext-proc:9000)`;
    return report;
  }
  const fragment: FragmentOptions = { processor, observability: !options.live };
  const root = options.cwd;
  const configPath = options.config ? join(root, options.config) : null;
  let applied: Applied | null = null;
  if (configPath) {
    if (!existsSync(configPath)) {
      report.exit_code = 2;
      report.next_step = `${options.config} does not exist; pass --config <your envoy.yaml> or leave it out to get the fragment alone`;
      return report;
    }
    applied = applyToEnvoyYaml(readFileSync(configPath, "utf8"), fragment);
  }
  const standalone = `${filterYaml(fragment)}\n\n${clusterYaml(fragment)}\n`;
  if (options.dryRun) {
    report.fragment = applied?.ok ? applied.source : standalone;
    if (applied && !applied.ok) report.manual = [`${options.config}: ${applied.reason}; merge the fragment by hand: the filter under http_filters before the router, the cluster under clusters`];
    report.next_step = applied?.ok ? `the configuration as it would be written to ${options.config}; run without --dry-run to write it and create the install` : "the filter and the cluster to merge into your envoy.yaml; run without --dry-run to create the install";
    report.exit_code = applied && !applied.ok ? 3 : 0;
    return report;
  }

  const hosts: string[] = [];
  if (options.hosts?.length) hosts.push(...options.hosts);
  else if (deps.isTTY && !options.yes) {
    const answer = (await deps.ask("Which hosts does Envoy front? (comma-separated, for example api.example.com)", "")).trim();
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

  const dir = join(root, "journeys");
  mkdirSync(dir, { recursive: true });
  const lock: InitLock = readLock(root) ?? { idempotency_key: randomUUID(), created_at: deps.now().toISOString(), form: "envoy", install_id: null, docs_host: null, proxy_file: null, proxy_created: false, proxy_previous: null, instrumentation_created: false, instrumentation_added_export: false, dependency: `${ENVOY_PACKAGE}@${options.packageVersion}`, mount_file: null, mount_previous: null };
  lock.docs_host = docsHost && docsHost !== "same" ? docsHost : hosts[0] ?? null;
  const manual: string[] = [];
  writeFileSync(join(dir, "envoy.journeys.yaml"), standalone);
  writeFileSync(join(dir, "istio.journeys.yaml"), istioYaml(fragment));
  report.files_written.push("journeys/envoy.journeys.yaml", "journeys/istio.journeys.yaml");
  if (configPath && applied) {
    if (applied.ok && applied.reason === null) {
      lock.mount_previous = readFileSync(configPath, "utf8");
      writeFileSync(configPath, applied.source);
      report.files_written.push(options.config as string);
      lock.mount_file = options.config;
    } else if (applied.ok) report.warnings.push(`${options.config} already carries the filter; left as it is`);
    else manual.push(`${options.config}: ${applied.reason}; merge journeys/envoy.journeys.yaml by hand: the filter under http_filters before the router, the cluster under clusters`);
  } else manual.push("merge journeys/envoy.journeys.yaml into your envoy.yaml (the filter under http_filters before the router, the cluster under clusters), or apply journeys/istio.journeys.yaml on Istio");
  mkdirSync(join(root, LOCK_DIR), { recursive: true });
  writeFileSync(join(root, LOCK_DIR, LOCK_FILE), `${JSON.stringify(lock, null, 2)}\n`);

  const apiUrl = options.apiUrl ?? deps.env.JOURNEYS_API_URL ?? DEFAULT_API_URL;
  const client = createClient({ baseUrl: apiUrl, credential: null, fetch: deps.fetch });
  const body: InstallCreateRequest = { form: "envoy", hosts, environment: options.environment, package: { name: ENVOY_PACKAGE, version: options.packageVersion, adapter: "envoy" } };
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
    report.next_step = "the API returned no install key for the Envoy form; run `journeys init --envoy` again or rotate the key in the console";
    report.manual = manual.length ? manual : undefined;
    return report;
  }
  const salt = base64url(deps.random(32));
  const values: Array<{ name: string; value: string }> = [{ name: "JOURNEYS_INSTALL_ID", value: created.install.install_id }, { name: "JOURNEYS_SALT", value: salt }, { name: "JOURNEYS_INSTALL_KEY", value: created.key }];
  if (apiUrl !== DEFAULT_API_URL) values.push({ name: "JOURNEYS_API_URL", value: apiUrl });
  if (options.assertion) values.push({ name: "JOURNEYS_ASSERTION_KEY", value: JSON.stringify({ ...options.assertion.privateJwk, kid: `${created.install.install_id}:1` }) });
  report.env_pending.push(`set on the processor's deployment, from .env.local: ${values.map((v) => v.name).join(", ")}`, `JOURNEYS_EXT_PROC_LISTEN=0.0.0.0:${processor.port}   # the port the cluster names`);
  if (!envLocalIgnored(root)) {
    report.exit_code = 6;
    report.next_step = ".env.local is not ignored by .gitignore, so the salt and the key were not written to it (a secret must never land in a tracked file): add `.env.local` to .gitignore and run `journeys init --envoy` again";
    report.manual = manual.length ? manual : undefined;
    return report;
  }
  upsertEnvFile(join(root, ".env.local"), Object.fromEntries(values.map((v) => [v.name, v.value])));
  report.files_written.push(".env.local");
  report.env_written.push(...values.map((v) => `${v.name} (.env.local)`));
  if (manual.length) {
    report.exit_code = 3;
    report.manual = manual;
  }
  report.next_step = `run the processor (npx ${ENVOY_PACKAGE}, or the image ghcr.io/tryscope/scope-journeys-envoy:${options.packageVersion}) with the variables, reload Envoy with the filter, then run \`journeys doctor --url https://${hosts[0]}\`; open the claim URL to bind the install to your account`;
  return report;
}

export function renderEnvoyReport(report: EnvoyReport): string[] {
  if (report.fragment !== undefined) return [report.fragment, ...(report.manual ?? []).map((m) => `by hand     ${m}`), `next        ${report.next_step}`];
  const lines: string[] = [];
  if (report.install_id) lines.push(`install     ${report.install_id}`);
  lines.push(`form        envoy (processor ${report.processor}, ${report.observability ? "observability mode" : "live"})`);
  if (report.hosts.length) lines.push(`hosts       ${report.hosts.join(", ")}`);
  if (report.files_written.length) lines.push(`files       ${report.files_written.join(", ")}`);
  if (report.env_written.length) lines.push(`env         ${report.env_written.join("; ")}`);
  if (report.env_pending.length) lines.push("pending     ", ...report.env_pending.map((l) => `              ${l}`));
  if (report.claim_url) lines.push(`claim       ${report.claim_url}`);
  for (const w of report.warnings) lines.push(`warning     ${w}`);
  for (const m of report.manual ?? []) lines.push(`by hand     ${m}`);
  lines.push(`next        ${report.next_step}`);
  return lines;
}
