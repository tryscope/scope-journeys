import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { Io, SensorRecord } from "../io.js";
import type { ScopeRequest1 } from "../generated/request.js";
import { observe, PROBE_HEADER, PROBE_PATH } from "../observe.js";
import { compilePolicy } from "../policy.js";
import { DEFAULT_API_URL } from "../policy-loader.js";
import { observeResponse } from "../respond.js";
import { VERSION } from "../version.js";
import { ApiError, createClient, UnreachableError, type Install, type InstallForm, type InstallProbeRead, type InstallState } from "./client.js";
import { readEnvFile, readLock } from "./project.js";

export interface LocalDoctorOptions {
  policy: string;
  url: string;
  path?: string;
  raw?: boolean;
}

export interface LocalDoctorReport {
  ok: boolean;
  url: string;
  nonce: string;
  route: string;
  status: number | null;
  page: ScopeRequest1["scope.page"] | null;
  reference_minted: string | null;
  decisions: ScopeRequest1["scope.decision"];
  record: Partial<ScopeRequest1> | ScopeRequest1;
  supplied_by_the_platform_at_deploy_time: string[];
  reasons: string[];
}

const MASKED_FOR_READABILITY = ["scope.body.request", "scope.body.response", "scope.response.headers", "scope.client.fetch_metadata", "scope.observer.errors", "scope.observer.dropped", "mcp.method.name", "scope.mcp.tools", "scope.mcp.client", "scope.oauth", "scope.platform_bot", "scope.signature", "scope.client.tls_ext_sha1", "scope.client.tls_hello_len", "tls.protocol.version", "network.protocol.version", "scope.cache"];

/**
 * `journeys doctor --local`: one GET with a probe nonce through the core in process, with a Node Io
 * whose forward fetches the local app, so the command observes an app before any adapter is
 * installed. It prints the record the core built and the facts only the platform can supply.
 */
export async function doctorLocal(options: LocalDoctorOptions): Promise<LocalDoctorReport> {
  const policy = compilePolicy(JSON.parse(readFileSync(options.policy, "utf8")));
  const nonce = randomBytes(12).toString("base64url");
  const base = options.url.replace(/\/$/, "");
  const path = options.path ?? "/docs/quickstart";
  const url = `${base}${path}${path.includes("?") ? "&" : "?"}journeys_probe=${nonce}`;
  const shipped: SensorRecord[] = [];
  const cached = new Map<string, string>();
  const encoder = new TextEncoder();
  const io: Io = {
    now: () => Date.now(),
    random: (bytes) => crypto.getRandomValues(new Uint8Array(bytes)),
    hash: async (value) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`doctor-local:${value}`)))].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 12),
    forward: (request) => fetch(request.url, { method: request.method, headers: request.headers, redirect: "manual", signal: AbortSignal.timeout(10_000) }),
    cache: { get: async (key) => cached.get(key) ?? null, put: async (key, value) => void cached.set(key, value) },
    ship: (records) => {
      shipped.push(...records);
    },
    log: () => undefined,
  };
  const facts = {
    address: "127.0.0.1",
    family: "ipv4" as const,
    asn: null,
    as_org: null,
    country: null,
    colo: null,
    tls_protocol_version: null,
    network_protocol_version: null,
    ja4: null,
    tls_ext_sha1: null,
    tls_hello_len: null,
    platform_request_id: null,
    platform_bot: null,
    install: null,
    source: "node" as const,
    observer: { package: "scope-journeys", version: VERSION, adapter: "doctor-local", name: "journeys-doctor" },
    salt_epoch: 1,
    environment: "development" as const,
    dropped: 0,
  };
  const request = new Request(url, { method: "GET", headers: { accept: "text/html, text/markdown;q=0.9", "user-agent": `scope-journeys-doctor/${VERSION}` } });
  const observed = await observe(request, policy, facts, io);
  let status: number | null = null;
  if (observed.kind === "answer") {
    status = observed.response.status;
    await observed.response.arrayBuffer();
    await observed.records;
  } else {
    const upstream = await io.forward(observed.request);
    const responded = observeResponse(upstream, observed.state);
    await responded.response.arrayBuffer();
    await responded.records;
    status = upstream.status;
  }
  const record = shipped.find((r): r is ScopeRequest1 => r.schema === "scope.request/1");
  const route = observed.state.route;
  const reasons: string[] = [];
  if (!record) reasons.push("the url was passthrough: the policy's passthrough patterns match it and nothing is recorded");
  else {
    if (!route.content) reasons.push(`the policy classifies ${path} as ${route.route}, not a page: add it to docs.paths or custom[]`);
    if (status === 404) reasons.push("the origin answered 404 for this path");
    else if (status !== null && status >= 400) reasons.push(`the origin answered ${status}`);
    if (!record["scope.page"] && route.content && status === 200) reasons.push("the origin's answer is not a page (no text/html or text/markdown content type)");
  }
  const page = record?.["scope.page"] ?? null;
  const ok = Boolean(record && page && status === 200);
  const shown: Partial<ScopeRequest1> = record ? { ...record } : {};
  if (!options.raw) for (const key of MASKED_FOR_READABILITY) delete (shown as Record<string, unknown>)[key];
  return {
    ok,
    url,
    nonce,
    route: route.route,
    status,
    page,
    reference_minted: page?.reference_minted ?? record?.["scope.reference_minted"] ?? null,
    decisions: record?.["scope.decision"] ?? [],
    record: shown,
    supplied_by_the_platform_at_deploy_time: ["scope.client.asn", "scope.client.as_org", "scope.client.country", "scope.client.colo", "scope.client.ja4", "request_id", "tls.protocol.version", "network.protocol.version"],
    reasons,
  };
}

// ---------------------------------------------------------------------------------------------
// `journeys doctor` proper: one probe per host, the facts that arrived, the one step
// that fixes what is missing, the docs host named first.

export interface DoctorOptions {
  cwd: string;
  url: string | null;
  install: string | null;
  token: string | null;
  apiUrl: string | null;
  timeoutSeconds: number;
}

export interface DoctorDeps {
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  random: (bytes: number) => Uint8Array;
}

export interface Fix {
  fact: string;
  fix: string;
}

export interface HostReport {
  host: string;
  fronted: boolean;
  found: boolean;
  round_trip_ms: number | null;
  facts: Record<string, boolean | number | string | null>;
  missing: Fix[];
}

/** What the install read says the ingest last saw from the sensor (the install's own row, not per host). */
export interface SensorReport {
  package: string;
  version: string;
  adapter: string;
  policy_version: number | null;
  salt_epoch: number;
  state: InstallState;
}

export interface DoctorReport {
  install_id: string | null;
  form: InstallForm | null;
  sensor: SensorReport | null;
  hosts: HostReport[];
  missing: Fix[];
  ok: boolean;
  exit_code: 0 | 1 | 5;
  next_step: string;
}

/**
 * The facts the probe read reports as booleans (journey_probe_find); these four must be true on
 * every host for exit 0. `client.asn` and `client.ja4` are optional: the platform may not send them.
 */
export const REQUIRED_FACTS = ["address_hash", "user_agent", "route", "observer.policy_version"] as const;

/** The fixes the CLI raises itself; the ingest's own `missing[]` lines are printed as it worded them. */
export function fixFor(fact: "docs_host" | "fronted" | "client.ja4" | "observer.version", form: InstallForm | null, host: string): string {
  switch (fact) {
    case "docs_host":
      return `no documentation host is fronted: add ${host} to the install (journeys init --docs-host ${host}) and front it, or every journey starts at the install instead of at the read`;
    case "fronted":
      return form === "cloudflare" ? `no route for ${host}: add "${host}/*" to wrangler.toml and deploy, or the DNS record for ${host} is not proxied` : `the proxy file does not run for ${host}; check config.matcher and JOURNEYS_HOST`;
    case "client.ja4":
      return form === "cloudflare" ? "Bot Management is not enabled on this zone; JA4 is optional" : "the project is not on a plan that sends x-vercel-ja4-digest; optional";
    case "observer.version":
      return "a newer sensor exists; npm update and redeploy";
  }
}

// The order the fixes are printed in: the docs host, the host itself, then the facts.
const RANK = ["docs_host", "fronted", "request", "client.ja4", "client.asn", "route", "observer.policy_version", "observer.version"];
const rank = (fact: string): number => (RANK.includes(fact) ? RANK.indexOf(fact) : RANK.length);
const OPTIONAL = new Set(["client.ja4", "client.asn"]);

const older = (version: string, than: string): boolean => {
  const a = version.split(/[.+-]/, 3).map(Number);
  const b = than.split(/[.+-]/, 3).map(Number);
  for (let i = 0; i < 3; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return false;
    if (x !== y) return x < y;
  }
  return false;
};

export function installIdFrom(options: Pick<DoctorOptions, "cwd" | "install" | "token" | "apiUrl">, deps: Pick<DoctorDeps, "env">): string | null {
  if (options.install) return options.install;
  const env = readEnvFile(join(options.cwd, ".env.local"));
  if (env.JOURNEYS_INSTALL_ID) return env.JOURNEYS_INSTALL_ID;
  if (deps.env.JOURNEYS_INSTALL_ID) return deps.env.JOURNEYS_INSTALL_ID;
  const toml = join(options.cwd, "journeys", "wrangler.toml");
  if (existsSync(toml)) {
    const m = /JOURNEYS_INSTALL_ID\s*=\s*"([^"]+)"/.exec(readFileSync(toml, "utf8"));
    if (m?.[1]) return m[1];
  }
  return null;
}

export function credentialFrom(options: Pick<DoctorOptions, "cwd" | "install" | "token" | "apiUrl">, deps: Pick<DoctorDeps, "env">): string | null {
  if (options.token) return options.token;
  const env = readEnvFile(join(options.cwd, ".env.local"));
  if (env.JOURNEYS_INSTALL_KEY) return env.JOURNEYS_INSTALL_KEY;
  const secrets = readEnvFile(join(options.cwd, "journeys", ".env.secrets"));
  if (secrets.JOURNEYS_INSTALL_KEY) return secrets.JOURNEYS_INSTALL_KEY;
  return deps.env.JOURNEYS_INSTALL_KEY ?? null;
}

export function apiUrlFrom(options: Pick<DoctorOptions, "cwd" | "install" | "token" | "apiUrl">, deps: Pick<DoctorDeps, "env">): string {
  if (options.apiUrl) return options.apiUrl;
  const env = readEnvFile(join(options.cwd, ".env.local"));
  return deps.env.JOURNEYS_API_URL ?? env.JOURNEYS_API_URL ?? DEFAULT_API_URL;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).host;
  } catch {
    return url;
  }
};

const why = (error: unknown): string => (error instanceof ApiError ? `${error.status} ${error.code}` : error instanceof UnreachableError ? error.message : String(error));

export async function doctor(options: DoctorOptions, deps: DoctorDeps): Promise<DoctorReport> {
  const installId = installIdFrom(options, deps);
  const failed = (next_step: string, partial: Partial<DoctorReport> = {}): DoctorReport => ({ install_id: installId, form: null, sensor: null, hosts: [], missing: [], ok: false, exit_code: 5, next_step, ...partial });
  if (!installId) return failed("no install id: pass --install jin_..., or run doctor where journeys init wrote .env.local or journeys/wrangler.toml");
  const client = createClient({ baseUrl: apiUrlFrom(options, deps), credential: credentialFrom(options, deps), fetch: deps.fetch });
  let install: Install | null = null;
  try {
    install = await client.getInstall(installId);
  } catch (error) {
    if (!options.url) return failed(`the install could not be read (${why(error)}): check the credential (the install key in .env.local, journeys/.env.secrets or --token) and JOURNEYS_API_URL`);
  }
  const hosts = options.url ? [hostOf(options.url)] : (install as Install).hosts;
  const form: InstallForm = install?.form ?? (existsSync(join(options.cwd, "journeys", "wrangler.toml")) ? "cloudflare" : "next");
  const sensor: SensorReport | null = install?.package ? { package: install.package.name, version: install.package.version, adapter: install.package.adapter, policy_version: install.policy_version, salt_epoch: install.salt_epoch, state: install.state } : null;
  const docsHost = readLock(options.cwd)?.docs_host ?? null;
  const reports: HostReport[] = [];
  for (const host of hosts) {
    const nonce = Buffer.from(deps.random(12)).toString("base64url");
    const sentAt = deps.now();
    let fronted = false;
    try {
      const response = await deps.fetch(`https://${host}${PROBE_PATH}?journeys_probe=${nonce}`, { headers: { "user-agent": `scope-journeys-doctor/${VERSION}` }, redirect: "manual", signal: AbortSignal.timeout(10_000) });
      fronted = response.status === 204 && response.headers.get(PROBE_HEADER) === "received";
    } catch {
      fronted = false;
    }
    const report: HostReport = { host, fronted, found: false, round_trip_ms: null, facts: {}, missing: [] };
    if (fronted) {
      const deadline = sentAt + options.timeoutSeconds * 1000;
      let probe: InstallProbeRead;
      for (;;) {
        try {
          probe = await client.probe(installId, nonce);
        } catch (error) {
          return failed(`the probe could not be read (${why(error)}): check the credential and JOURNEYS_API_URL`, { form, sensor, hosts: reports });
        }
        if (probe.found || deps.now() >= deadline) break;
        await deps.sleep(2000);
      }
      if (probe.found) {
        report.found = true;
        report.facts = probe.facts;
        report.round_trip_ms = probe.ts ? Math.max(0, Date.parse(probe.ts) - sentAt) : null;
        report.missing.push(...probe.missing);
        if (probe.facts["client.ja4"] === false && !report.missing.some((m) => m.fact === "client.ja4")) report.missing.push({ fact: "client.ja4", fix: fixFor("client.ja4", form, host) });
      } else report.missing.push({ fact: "request", fix: `no request carrying the probe's nonce reached the ingest within ${options.timeoutSeconds} s; check that ${host} is one the install fronts and that the sensor can reach JOURNEYS_API_URL` });
    } else report.missing.push({ fact: "fronted", fix: fixFor("fronted", form, host) });
    if (docsHost === host && !report.found) report.missing.unshift({ fact: "docs_host", fix: fixFor("docs_host", form, host) });
    report.missing.sort((a, b) => rank(a.fact) - rank(b.fact));
    reports.push(report);
  }
  // The docs host is the first thing named: the host carrying that fix leads the list.
  reports.sort((a, b) => Number(b.missing.some((m) => m.fact === "docs_host")) - Number(a.missing.some((m) => m.fact === "docs_host")));
  const missing: Fix[] = sensor && older(sensor.version, VERSION) ? [{ fact: "observer.version", fix: fixFor("observer.version", form, hosts[0] ?? "") }] : [];
  const ok = reports.length > 0 && reports.every((r) => r.fronted && r.found && REQUIRED_FACTS.every((f) => r.facts[f] === true));
  const first = [...reports.flatMap((r, i) => r.missing.filter((m) => !OPTIONAL.has(m.fact)).map((m) => ({ host: i, rank: rank(m.fact), line: `${r.host}: ${m.fix}` }))), ...missing.map((m) => ({ host: reports.length, rank: rank(m.fact), line: m.fix }))].sort((a, b) => a.rank - b.rank || a.host - b.host)[0]?.line;
  const next_step = ok ? (first ?? (sensor?.state === "unclaimed" ? "every host is fronted and reporting; open the claim URL to bind the install to your account" : "every host is fronted and reporting")) : (first ?? "a required fact is missing; see each host's list");
  return { install_id: installId, form, sensor, hosts: reports, missing, ok, exit_code: ok ? 0 : 1, next_step };
}

export function renderDoctorReport(report: DoctorReport): string[] {
  const lines: string[] = [];
  lines.push(`install     ${report.install_id ?? "?"}${report.form ? ` (${report.form})` : ""}`);
  if (report.sensor) lines.push(`sensor      ${report.sensor.package}@${report.sensor.version} (${report.sensor.adapter}), policy ${report.sensor.policy_version ?? "none"}, salt epoch ${report.sensor.salt_epoch}, ${report.sensor.state}`);
  for (const h of report.hosts) {
    lines.push(`host        ${h.host}: ${h.fronted ? "fronted" : "NOT fronted"}${h.found ? `, probe found${h.round_trip_ms !== null ? ` in ${h.round_trip_ms} ms` : ""}` : h.fronted ? ", probe not found" : ""}`);
    for (const [fact, value] of Object.entries(h.facts)) lines.push(`  ${fact.padEnd(24)} ${value === true ? "present" : value === false ? "absent" : String(value)}`);
    for (const m of h.missing) lines.push(`  fix         ${m.fix}`);
  }
  for (const m of report.missing) lines.push(`fix         ${m.fix}`);
  lines.push(`next        ${report.next_step}`);
  return lines;
}
