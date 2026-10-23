import { DEFAULT_API_URL, VERSION, assertionFromEnv, createShipper, deliver as deliverRecords, forwardObserved, forwardedUrl, hopUrl, loadPolicy, observe, originUrl, passHeaders, probeAnswer, secureUrl, type DeliveryOptions, type Environment, type Io, type SensorRecord } from "scope-journeys";
import type { NextFetchEvent, NextRequest } from "next/server.js";
import { NextResponse } from "next/server.js";

import { memoryCache } from "./cache.js";
import { platformFacts } from "./facts.js";
import { credential as credentialOf } from "./oidc.js";

export { memoryCache, resetCache } from "./cache.js";
export { resetDelivery } from "scope-journeys";
export { platformFacts } from "./facts.js";
export { credential, decodeClaims } from "./oidc.js";

/** The header the Next form adds on the hop to its own host; a request carrying it is the inner pass and is never observed twice. */
export const INNER_HEADER = "x-journeys-inner";

export interface WithJourneysOptions {
  /** Observe only this host (JOURNEYS_HOST); other hosts go to `next` untouched. */
  host?: string;
  /** Forward to this origin instead of the request's own host (the Worker-like use). */
  origin?: string;
  /** The Via pseudonym (JOURNEYS_NAME). */
  name?: string;
  apiUrl?: string;
  policyUrl?: string;
  installId?: string;
  environment?: Environment;
  /** The matcher the README recommends; `init` merges it with an existing one. */
  matcher?: string[];
  /** The proxy logic that ran before Journeys: called for the inner hop and for hosts the install does not observe. */
  next?: (request: NextRequest, event: NextFetchEvent) => Promise<Response> | Response;
  fetch?: typeof fetch;
  env?: Record<string, string | undefined>;
  now?: () => number;
}

export const matcher = ["/((?!_next/static|_next/image|favicon.ico).*)"];

const encoder = new TextEncoder();
const hex = (bytes: ArrayBuffer): string => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
let warnedNoInstall = false;
let warnedNoSalt = false;
let warnedLoop = false;

type Shipper = (work: () => Promise<void>) => void;

/** One request's records shipped on their own. */
export function deliver(records: readonly SensorRecord[], options: Omit<DeliveryOptions, "key"> & ({ key: string | null } | { /** @deprecated The 0.1 name of `key`, read until 0.3.0 (DEPRECATION.md). */ credential: string | null })): Promise<void> {
  return deliverRecords(records, { ...options, key: "key" in options ? options.key : options.credential });
}

/** The function kept running while its records ship, 10 seconds at most: an ingest outage must not hold every invocation open, and billed, for the queue's whole time limit. */
function bounded(shipping: Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 10_000);
    void shipping.then(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** `after()` when the Next version has it (the function keeps running after the response), else the event's waitUntil. */
async function shipper(event: NextFetchEvent | undefined): Promise<Shipper> {
  try {
    const mod = (await import("next/server.js")) as { after?: (task: () => Promise<void>) => void };
    if (typeof mod.after === "function") {
      const after = mod.after;
      return (work) => {
        try {
          after(work);
        } catch {
          // Outside a request scope (a test, a plain Node start): the event's waitUntil, or the work itself.
          const pending = work();
          event?.waitUntil(pending);
        }
      };
    }
  } catch {
    // Older Next: fall through to waitUntil.
  }
  return (work) => event?.waitUntil(work());
}

/**
 * The in-app form of the sensor: one condition in the proxy file. A
 * request carrying the inner-hop marker, or for a host the install does not observe, goes to the
 * customer's own logic untouched; every other request is observed, forwarded to the app's own
 * address with the marker, and recorded after the response went out. Without an install there is
 * nothing to record: the probe is answered here and everything else goes to the customer's logic
 * directly. The host observed is the one the agent spoke to, as Vercel's edge or the proxy in
 * front named it in x-forwarded-host (`next start` fills it from Host): Next builds request.url
 * on its listen host, which the record never names; the hop goes to the listener itself.
 */
export function withJourneys(options: WithJourneysOptions = {}): (request: NextRequest, event: NextFetchEvent) => Promise<Response> {
  const env = options.env ?? (typeof process !== "undefined" ? (process.env as Record<string, string | undefined>) : {});
  const fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => Date.now());
  const log = (level: "info" | "warn" | "error", line: string): void => {
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  };
  const queue = createShipper({ fetch: fetchFn, log: (line) => log("warn", line) });
  const passTo = async (request: NextRequest, event: NextFetchEvent): Promise<Response> => (options.next ? options.next(request, event) : NextResponse.next());
  return async (request, event) => {
    if (request.headers.get(INNER_HEADER)) return passTo(request, event);
    const listen = new URL(request.url);
    const url = forwardedUrl(listen, request.headers);
    const observeHost = options.host ?? env.JOURNEYS_HOST;
    if (observeHost && url.host !== observeHost) return passTo(request, event);
    const name = options.name ?? env.JOURNEYS_NAME ?? "scope-journeys";
    // A Via entry naming this sensor is its own hop come back without the marker (RFC 9110 section
    // 7.6.3): forwarding it again would loop, so it goes to the app as the inner pass does.
    if ((request.headers.get("via") ?? "").split(",").some((entry) => entry.trim() === `1.1 ${name}`)) {
      if (!warnedLoop) {
        warnedLoop = true;
        log("warn", `journeys: a request already carries "1.1 ${name}" in Via and no ${INNER_HEADER}; passing it to the app untouched (something between the hop and this host drops the marker, or two sensors share the name)`);
      }
      return passTo(request, event);
    }
    try {
      const installId = options.installId ?? env.JOURNEYS_INSTALL_ID ?? null;
      const apiUrl = secureUrl(options.apiUrl ?? env.JOURNEYS_API_URL ?? DEFAULT_API_URL, "JOURNEYS_API_URL", (line) => log("warn", line));
      const cred = credentialOf(request, env);
      const policyUrl = options.policyUrl ?? env.JOURNEYS_POLICY_URL ?? (apiUrl && installId ? `${apiUrl.replace(/\/$/, "")}/v1/installs/${installId}/policy` : null);
      const salt = env.JOURNEYS_SALT;
      if (!installId && !policyUrl) {
        if (!warnedNoInstall) {
          warnedNoInstall = true;
          log("warn", "journeys: JOURNEYS_INSTALL_ID is not set; passing every request to the app untouched, the probe aside (run `npx scope-journeys init`)");
        }
        return probeAnswer(request.method, url.pathname, salt ? "received" : "no-salt") ?? passTo(request, event);
      }
      if (!salt) {
        // Without a salt nothing can be hashed, so nothing is recorded: the app answers, the probe says why.
        if (!warnedNoSalt) {
          warnedNoSalt = true;
          log("warn", "journeys: JOURNEYS_SALT is not set; recording nothing and passing every request to the app untouched (run `npx scope-journeys init`)");
        }
        return probeAnswer(request.method, url.pathname, "no-salt") ?? passTo(request, event);
      }
      const cache = memoryCache(now);
      const loaded = await loadPolicy({ url: policyUrl, installId, credential: cred, fetch: fetchFn, now: now(), cache, log: (line) => log("warn", line) });
      const { policy } = loaded;
      const issuer = apiUrl && installId ? `${apiUrl.replace(/\/$/, "")}/v1/installs/${installId}` : null;
      const identity = { install: installId, name, environment: (loaded.environment ?? options.environment ?? env.JOURNEYS_ENVIRONMENT ?? "production") as Environment, saltEpoch: loaded.saltEpoch ?? 1, version: VERSION, assertion: await assertionFromEnv(env.JOURNEYS_ASSERTION_KEY, issuer) };
      const facts = platformFacts(request.headers, identity);
      // Where the hop goes: `next start` names its own listener (the origin its action handler
      // fetches), and the request URL's origin is the deployment's host on Vercel. Under `next
      // start` that URL carries the forwarded scheme on the listen host, so it is not the listener.
      const base = options.origin ?? env.JOURNEYS_ORIGIN ?? env.__NEXT_PRIVATE_ORIGIN ?? listen.origin;
      const hopOrigin = originUrl(base);
      if (!hopOrigin) throw new Error("journeys: the origin to forward to (JOURNEYS_ORIGIN, the origin option or the listen address) is not an http or https URL with no credentials");
      const target = hopUrl(hopOrigin, url);
      const ship = await shipper(event);
      const io: Io = {
        now,
        random: (bytes) => crypto.getRandomValues(new Uint8Array(bytes)),
        hash: async (value) => hex(await crypto.subtle.digest("SHA-256", encoder.encode(`${salt}:${value}`))).slice(0, 12),
        forward: async (outbound) => {
          // The core forwards to the observed URL and fetches a signer's key directory by another:
          // the URL's host tells the two apart. The hop itself goes to the listen address.
          if (new URL(outbound.url).host !== url.host) return fetchFn(outbound.url, { method: outbound.method, headers: outbound.headers, redirect: "manual", signal: AbortSignal.timeout(2_000) });
          const headers = new Headers(outbound.headers);
          headers.set(INNER_HEADER, "1");
          // fetch adds `accept-encoding: gzip, deflate` to a request without one and decodes the
          // answer; asking for identity keeps the hop uncompressed on the wire as the gateway rule
          // says, so the app does not compress what the sensor decompresses at once.
          headers.set("accept-encoding", "identity");
          return fetchFn(target, { method: outbound.method, headers, body: outbound.body, redirect: "manual", signal: AbortSignal.timeout(30_000), ...(outbound.body ? { duplex: "half" } : {}) } as RequestInit);
        },
        cache,
        ship: (records: readonly SensorRecord[]) => ship(() => bounded(queue.add(records, apiUrl, cred))),
        log,
      };
      // The request as the core observes it, on the URL the agent spoke to; the original keeps its
      // own branch of the body, so a failure after this still hands the app a readable request.
      const observing = url.href === listen.href ? request : new Request(url, { method: request.method, headers: request.headers, body: request.body ? request.clone().body : null, ...(request.body ? { duplex: "half" } : {}) } as RequestInit);
      const observed = await observe(observing, policy, facts, io);
      if (observed.kind === "answer") return observed.response;
      const responded = await forwardObserved(observed.request, observed.state);
      ship(async () => {
        await responded.records;
      });
      return responded.response;
    } catch (error) {
      log("error", `journeys: the sensor failed, passing the request to the app untouched: ${error instanceof Error ? error.message : String(error)}${error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : ""}`);
      return passTo(request, event);
    }
  };
}

/** The pass-through response rebuilt as the gateway rule says (exported for the tests). */
export const rebuilt = (upstream: Response): Response => new Response(upstream.body, { status: upstream.status, headers: passHeaders(upstream.headers) });
