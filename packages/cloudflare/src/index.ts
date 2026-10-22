import { DEFAULT_API_URL, VERSION, assertionFromEnv, loadPolicy, observe, observeResponse, passHeaders, secureUrl, type CompiledPolicy, type Environment, type Io, type SensorRecord } from "scope-journeys";

import { platformFacts, type RequestWithCf } from "./facts.js";
import { workerCache } from "./cache.js";

export { workerCache, resetCache } from "./cache.js";
export { platformFacts } from "./facts.js";
export { deliver, resetDelivery } from "./deliver.js";
import { deliver, droppedSoFar } from "./deliver.js";

/** The Worker's bindings. The two secrets are `wrangler secret put`; the rest are `[vars]`. */
export interface Bindings {
  JOURNEYS_INSTALL_ID?: string;
  JOURNEYS_INSTALL_KEY?: string;
  JOURNEYS_SALT?: string;
  JOURNEYS_ORIGIN?: string;
  JOURNEYS_API_URL?: string;
  JOURNEYS_NAME?: string;
  /** Optional: a full url to fetch the policy from instead of `${JOURNEYS_API_URL}/v1/installs/${id}/policy`. */
  JOURNEYS_POLICY_URL?: string;
  JOURNEYS_ENVIRONMENT?: string;
  /** The install's assertion signing key (a private JWK with its kid), written by `journeys init`; a secret. */
  JOURNEYS_ASSERTION_KEY?: string;
}

export interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

export interface HandlerOptions {
  /**
   * Fixed binding values, or `{NAME}` to read the Worker's own variable NAME at request time (how
   * a deployment keeps its own variable names: `JOURNEYS_POLICY_URL: "{CONFIG_URL}"`).
   */
  env?: Partial<Record<keyof Bindings, string>>;
  fetch?: typeof fetch;
  now?: () => number;
}

const DEFAULT_NAME = "scope-journeys";

function resolveBindings(options: HandlerOptions, env: Record<string, unknown>): Bindings {
  const out: Record<string, string | undefined> = {};
  const names: (keyof Bindings)[] = ["JOURNEYS_INSTALL_ID", "JOURNEYS_INSTALL_KEY", "JOURNEYS_SALT", "JOURNEYS_ORIGIN", "JOURNEYS_API_URL", "JOURNEYS_NAME", "JOURNEYS_POLICY_URL", "JOURNEYS_ENVIRONMENT", "JOURNEYS_ASSERTION_KEY"];
  for (const name of names) {
    const fixed = options.env?.[name];
    if (typeof fixed === "string") {
      const indirect = /^\{([A-Z0-9_]+)\}$/.exec(fixed);
      out[name] = indirect ? (typeof env[indirect[1] ?? ""] === "string" ? (env[indirect[1] ?? ""] as string) : undefined) : fixed;
    } else out[name] = typeof env[name] === "string" ? (env[name] as string) : undefined;
  }
  return out as Bindings;
}

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

const warnedNoSalt = new Set<string>();

/**
 * The Worker form of the sensor: `passThroughOnException` first, the policy from
 * the cache, the platform's facts from `request.cf`, the hop to the origin, shipping after the
 * response in `waitUntil`. Every failure is open: the request reaches the origin untouched.
 */
export function createHandler(options: HandlerOptions = {}): { fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext): Promise<Response> } {
  const fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  return {
    async fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext): Promise<Response> {
      ctx.passThroughOnException();
      const b = resolveBindings(options, env);
      const name = b.JOURNEYS_NAME || DEFAULT_NAME;
      const log = (level: "info" | "warn" | "error", line: string): void => {
        if (level === "error") console.error(line);
        else if (level === "warn") console.warn(line);
        else console.log(line);
      };
      const apiUrl = secureUrl(b.JOURNEYS_API_URL ?? DEFAULT_API_URL, "JOURNEYS_API_URL", (line) => log("warn", line));
      const policyUrl = b.JOURNEYS_POLICY_URL ?? (apiUrl && b.JOURNEYS_INSTALL_ID ? `${apiUrl.replace(/\/$/, "")}/v1/installs/${b.JOURNEYS_INSTALL_ID}/policy` : null);
      const cache = workerCache(typeof caches !== "undefined" ? (caches as unknown as { default: Cache }).default : null, now);
      const loaded = await loadPolicy({ url: policyUrl, credential: b.JOURNEYS_INSTALL_KEY ?? null, fetch: fetchFn, now: now(), cache, log: (line) => log("warn", line) });
      let policy: CompiledPolicy = loaded.policy;
      const salt = b.JOURNEYS_SALT;
      if (!salt) {
        // The error is the onboarding: without a salt nothing can be hashed, so
        // the Worker runs the forward-only default and says so once per isolate, never throws.
        if (!warnedNoSalt.has(name)) {
          warnedNoSalt.add(name);
          log("warn", "journeys: JOURNEYS_SALT is not set; running the forward-only default policy (set the secret and redeploy, or run journeys init)");
        }
        policy = (await loadPolicy({ url: null, credential: null, fetch: fetchFn, now: now(), cache: null, log: () => undefined })).policy;
      }
      const origin = b.JOURNEYS_ORIGIN ?? null;
      const url = new URL(request.url);
      const issuer = apiUrl && b.JOURNEYS_INSTALL_ID ? `${apiUrl.replace(/\/$/, "")}/v1/installs/${b.JOURNEYS_INSTALL_ID}` : null;
      const identity = { install: b.JOURNEYS_INSTALL_ID ?? null, name, environment: (loaded.environment ?? b.JOURNEYS_ENVIRONMENT ?? "production") as Environment, saltEpoch: loaded.saltEpoch ?? 1, dropped: droppedSoFar(), version: VERSION, assertion: await assertionFromEnv(b.JOURNEYS_ASSERTION_KEY, issuer) };
      const facts = platformFacts(request as RequestWithCf, identity);
      const io: Io = {
        now,
        random: (bytes) => crypto.getRandomValues(new Uint8Array(bytes)),
        hash: async (value) => hex(await crypto.subtle.digest("SHA-256", encoder.encode(`${salt ?? ""}:${value}`))).slice(0, 12),
        forward: async (outbound) => {
          // Another host (a signer's key directory): a plain fetch, two seconds, nothing of ours added.
          if (new URL(outbound.url).host !== url.host) return fetchFn(outbound.url, { method: outbound.method, headers: outbound.headers, redirect: "manual", signal: AbortSignal.timeout(2_000) });
          const target = origin ? new URL(`${origin.replace(/\/$/, "")}${url.pathname}${url.search}`) : new URL(outbound.url);
          return fetchFn(target, { method: outbound.method, headers: outbound.headers, body: outbound.body, redirect: "manual", signal: AbortSignal.timeout(30_000), ...(outbound.body ? { duplex: "half" } : {}) } as RequestInit);
        },
        cache,
        ship: (records: readonly SensorRecord[]) => {
          ctx.waitUntil(deliver(records, { apiUrl, key: b.JOURNEYS_INSTALL_KEY ?? null, fetch: fetchFn, log: (line) => log("warn", line) }));
        },
        log,
      };
      try {
        const observed = await observe(request, policy, facts, io);
        if (observed.kind === "answer") {
          ctx.waitUntil(observed.records);
          return observed.response;
        }
        const upstream = await io.forward(observed.request);
        const responded = observeResponse(upstream, observed.state);
        ctx.waitUntil(responded.records);
        return responded.response;
      } catch (error) {
        log("error", `journeys: the sensor failed, forwarding untouched: ${error instanceof Error ? error.message : String(error)}`);
        const target = origin ? new URL(`${origin.replace(/\/$/, "")}${url.pathname}${url.search}`) : request.url;
        const upstream = await fetchFn(target, { method: request.method, headers: request.headers, body: request.body, redirect: "manual", ...(request.body ? { duplex: "half" } : {}) } as RequestInit);
        return new Response(upstream.body, { status: upstream.status, headers: passHeaders(upstream.headers) });
      }
    },
  };
}

export default createHandler();
